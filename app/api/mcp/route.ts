// MemeCMO Connector — a remote MCP server (Streamable HTTP) at /api/mcp.
//
// Auth: a connector key issued by an organization admin in the dashboard,
// sent as `Authorization: Bearer mc_…`. The key scopes every tool to that
// organization (and its direct client organizations). OAuth for the Claude /
// ChatGPT directories comes next; keys stay valid for Claude Code, Cursor,
// Claude Desktop (via mcp-remote), Zapier and any client that can set a header.
//
// Red lines (decided 2026-09-01): a key sees only its own organization; every
// answer carries attribution and the workspace link; reads are free inside the
// plan, scans will be metered in credits; nothing is ever published by us —
// the client publishes in its own environment and logs the action here.

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { serviceClient } from '@/lib/commerce';
import { rateLimit } from '@/lib/api-guard';
import { verifyBearer, logConnectorEvent, type ConnectorPrincipal } from '@/lib/connector/auth';
import { CORS_HEADERS, ISSUER } from '@/lib/oauth/server';
import {
  DELIVERABLE_TYPES, envelope, getDeliverable, latestScorecard, listActions, listDeliverables, listProjects, logAction,
  resolveProject, sourcesRanking, workspaceUrl, type OrgRef,
} from '@/lib/connector/data';
import { INTERVENTION_KINDS } from '@/lib/interventions';
import { queryMap, MAP_WORLDS } from '@/lib/map/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DOCS = 'https://app.memecmo.ai/connector';

const INSTRUCTIONS =
  'MemeCMO measures how AI engines (ChatGPT, Gemini, Claude, Perplexity, Google AI Overview) answer buyer questions about a brand in a market, ' +
  'builds publish-ready content grounded in the brand\'s public facts, and keeps a ledger of what the brand published (actions) so later scans can attribute change. ' +
  'Use list_projects first. Numbers are measured on a frozen prompt panel; quote them with their fractions. ' +
  'MemeCMO never publishes anything: when the user publishes in their own channels, call log_action with the live URL so the platform can verify it and attribute what moves. ' +
  'Always keep the "source" and "workspace" fields when relaying results. ' +
  'get_map explains MemeCMO itself: the public business ontology map (offerings, instruments, loops, rules); ask it by object id to see what something touches.';

const text = (payload: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const });

function buildHandler(principal: ConnectorPrincipal) {
  const sb = serviceClient();
  const org: OrgRef = { id: principal.orgId, slug: principal.orgSlug, name: principal.orgName };
  const canWrite = principal.scopes.includes('write');

  // Resolve + time + log every call; tool errors come back as isError, never as 500s.
  const withProject = async (tool: string, ref: string, fn: (ctx: Awaited<ReturnType<typeof resolveProject>> & object) => Promise<unknown>) => {
    const t0 = Date.now();
    const hit = await resolveProject(sb, principal.orgId, ref);
    if (!hit) {
      logConnectorEvent({ principal, tool, ok: false, ms: Date.now() - t0 });
      return fail(`Project "${ref}" is not in this organization. Call list_projects to see the slugs you can use.`);
    }
    try {
      const out = await fn(hit);
      logConnectorEvent({ principal, projectId: hit.project.id, tool, ok: true, ms: Date.now() - t0 });
      return text(out);
    } catch (e) {
      logConnectorEvent({ principal, projectId: hit.project.id, tool, ok: false, ms: Date.now() - t0 });
      return fail(e instanceof Error ? e.message : String(e));
    }
  };

  return createMcpHandler(
    (server) => {
      server.registerTool(
        'list_projects',
        {
          title: 'List projects',
          description: 'Projects this key can see (one project = one brand × one market), with the latest comparable scan: AI Mindset Index (0–100) and presence (% of answers naming the brand). Start here to get project slugs.',
          inputSchema: z.object({}),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async () => {
          const t0 = Date.now();
          try {
            const { projects } = await listProjects(sb, principal.orgId);
            logConnectorEvent({ principal, tool: 'list_projects', ok: true, ms: Date.now() - t0 });
            return text(envelope(org, null, {
              projects: projects.map((p) => ({
                slug: p.slug, brand: p.brand_name, market: p.target_country, language: p.target_language, industry: p.industry, organization: p.org.name,
                status: p.status, latestScan: p.latestScan, workspace: workspaceUrl(p.org.slug, p.slug),
              })),
              docs: DOCS,
            }));
          } catch (e) {
            logConnectorEvent({ principal, tool: 'list_projects', ok: false, ms: Date.now() - t0 });
            return fail(e instanceof Error ? e.message : String(e));
          }
        },
      );

      server.registerTool(
        'get_scorecard',
        {
          title: 'Get the latest scorecard',
          description: 'Latest comparable scan of a project: AI Mindset Index, the five dimensions (presence, prominence, sentiment, citation, share of voice), top-of-mind rate, per-engine presence with fractions, competitor benchmark, brand rank, sample sizes and the high-intent gap list (questions where competitors are named and the brand is not).',
          inputSchema: z.object({ project: z.string().describe('project slug or id (from list_projects)') }),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async ({ project }) => withProject('get_scorecard', project, async ({ project: p, org: o }) => {
          const sc = await latestScorecard(sb, p.id);
          if (!sc) return envelope(o, p, { scorecard: null, note: 'No comparable scan yet for this project.' });
          const { gaps, ...rest } = sc;
          return envelope(o, p, { scorecard: rest, gapCount: gaps.length, gapsPreview: gaps.slice(0, 5), hint: 'Call get_gaps for the full list.' });
        }),
      );

      server.registerTool(
        'get_gaps',
        {
          title: 'Get high-intent gaps',
          description: 'High-intent buyer questions from the latest scan where an AI engine named competitors but not the brand — the questions content and placements should target. Each gap: stage, prompt, engine, competitors present.',
          inputSchema: z.object({ project: z.string(), limit: z.number().int().min(1).max(200).optional() }),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async ({ project, limit }) => withProject('get_gaps', project, async ({ project: p, org: o }) => {
          const sc = await latestScorecard(sb, p.id);
          const gaps = sc?.gaps ?? [];
          return envelope(o, p, { scannedAt: sc?.scannedAt ?? null, total: gaps.length, gaps: gaps.slice(0, limit ?? 50) });
        }),
      );

      server.registerTool(
        'get_sources',
        {
          title: 'Get the sources AI cites',
          description: 'Domains the AI engines cite when answering this project\'s questions, aggregated across all scans: citations, answers, number of engines, and whether the domain is brand-owned. These are the places worth being present on.',
          inputSchema: z.object({ project: z.string(), limit: z.number().int().min(1).max(100).optional() }),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async ({ project, limit }) => withProject('get_sources', project, async ({ project: p, org: o }) => envelope(o, p, await sourcesRanking(sb, p.id, limit ?? 25))),
      );

      server.registerTool(
        'get_deliverables',
        {
          title: 'Get deliverables',
          description: 'Without `type`: the latest deliverable of each type (content_draft, distribution_kit, site_optimization, encyclopedia_entry, geo_report, standard_answers, brand_profile, prompt_set). With `type`: that deliverable\'s full content, with the client\'s own edits applied — this is the publish-ready text to use in your channels. Figures in these texts come only from the brand\'s public facts; a placeholder means the brand has not published that number.',
          inputSchema: z.object({ project: z.string(), type: z.enum(DELIVERABLE_TYPES).optional() }),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async ({ project, type }) => withProject('get_deliverables', project, async ({ project: p, org: o }) => {
          if (!type) return envelope(o, p, { deliverables: await listDeliverables(sb, p.id) });
          const d = await getDeliverable(sb, p.id, type);
          return envelope(o, p, d ? { deliverable: d } : { deliverable: null, note: `No ${type} has been generated for this project yet.` });
        }),
      );

      server.registerTool(
        'get_actions',
        {
          title: 'Get logged actions',
          description: 'What the brand has published (the action ledger), each with its verification (is the page live, words, last change) and the measured outcome on the targeted questions before vs after the publish date.',
          inputSchema: z.object({ project: z.string() }),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async ({ project }) => withProject('get_actions', project, async ({ project: p, org: o }) => envelope(o, p, { actions: await listActions(sb, p.id) })),
      );

      server.registerTool(
        'get_map',
        {
          title: 'Get the MemeCMO business map',
          description: 'The public view of MemeCMO\'s business ontology map (因陀罗网): what is sold, the instruments that measure, the loops that run, the rules that bind, what it all runs on. Without arguments: every public object and link plus the vocabulary (worlds, object types, link types). With `id`: that object, its reflections (links both ways, labelled) and its neighbourhood up to `depth` hops (1 or 2). With `world` or `type`: that slice. Ids are stable; cite them when explaining where something sits. Same data as https://app.memecmo.ai/map; no project needed.',
          inputSchema: z.object({
            id: z.string().optional().describe('object id, e.g. loop.measure_enter_prove or ins.aigvr'),
            depth: z.number().int().min(1).max(2).optional().describe('hops around `id` (default 1)'),
            world: z.enum(MAP_WORLDS).optional().describe('commercial | operation | measurement | rules | foundations'),
            type: z.string().optional().describe('object type, e.g. Offering, Instrument, Loop, Agent, Policy'),
          }),
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async (args) => {
          const t0 = Date.now();
          const out = queryMap(args);
          logConnectorEvent({ principal, tool: 'get_map', ok: !('error' in out), ms: Date.now() - t0 });
          return 'error' in out ? fail(String(out.error)) : text(out);
        },
      );

      server.registerTool(
        'log_action',
        {
          title: 'Log a published action',
          description: 'Record something the brand published (a page, a third-party article, a directory profile, a social post, a schema change) so MemeCMO can verify the page and attribute what changes in later scans. Call this AFTER the content is live in the client\'s own channel. Idempotent on URL: logging the same URL twice returns the existing record.',
          inputSchema: z.object({
            project: z.string(),
            kind: z.enum(INTERVENTION_KINDS).describe('content_page | schema | third_party_placement | encyclopedia | directory_profile | site_update | other'),
            url: z.string().url().optional().describe('the live URL (required for verification)'),
            published_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, the day it went live'),
            title: z.string().max(300).optional(),
            note: z.string().max(2000).optional(),
            target_prompts: z.array(z.string()).max(20).optional().describe('the buyer questions this action targets, verbatim from get_gaps'),
            source_run_id: z.string().optional().describe('runId of the deliverable it came from, if any'),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (args) => {
          if (!canWrite) return fail('This key is read-only. Ask an organization admin for a key with the write scope.');
          return withProject('log_action', args.project, async ({ project: p, org: o }) => {
            const r = await logAction(sb, p, {
              kind: args.kind, url: args.url, publishedAt: args.published_at, title: args.title, note: args.note,
              targetPrompts: args.target_prompts, sourceRunId: args.source_run_id,
            }, { loggedBy: principal.createdBy, keyId: principal.keyId, tokenId: principal.tokenId });
            return envelope(o, p, {
              logged: !r.duplicate, duplicate: r.duplicate, verificationQueued: r.verificationQueued,
              action: { id: r.intervention.id, kind: r.intervention.kind, url: r.intervention.url, publishedAt: r.intervention.published_at, targetPrompts: r.intervention.target_prompts.map((t) => t.prompt) },
              next: 'The page is fetched and verified within minutes; outcomes appear after the next scheduled scan (get_actions).',
            });
          });
        },
      );
    },
    {
      serverInfo: { name: 'memecmo-connector', version: '1.0.0' },
      instructions: INSTRUCTIONS,
    },
  );
}

const withCors = (res: Response): Response => {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
};

async function handle(req: Request): Promise<Response> {
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  const principal = token ? await verifyBearer(token) : null;
  if (!principal) {
    // RFC 9728: tell OAuth-capable clients where the protected-resource metadata lives.
    return withCors(new Response(
      JSON.stringify({ error: 'unauthorized', message: `Sign in through OAuth (Claude.ai, ChatGPT and other directory clients do this automatically) or send a MemeCMO connector key as "Authorization: Bearer mc_…". Docs: ${DOCS}` }),
      { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': `Bearer realm="MemeCMO Connector", resource_metadata="${ISSUER}/.well-known/oauth-protected-resource", error="invalid_token"` } },
    ));
  }
  const rl = await rateLimit(`mcp:${principal.keyId ?? principal.tokenId}`, { scope: 'mcp', limit: 120, windowMs: 60_000 });
  if (!rl.allowed) {
    return withCors(Response.json({ error: 'rate_limited', retryAfterSeconds: Math.ceil(rl.resetMs / 1000) }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }));
  }
  return withCors(await buildHandler(principal)(req));
}

function options(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export { handle as GET, handle as POST, handle as DELETE, options as OPTIONS };
