// Agent registry — names + display metadata for the v0.5 agent suite.

export interface AgentDef {
  id: string;
  displayName: string;
  shortName: string;
  emoji: string;
  description: string;
  // Approx wall-clock; informs UI progress estimates.
  typicalDurationSec: number;
}

export const AGENTS: Record<string, AgentDef> = {
  full_scan: {
    id: 'full_scan',
    displayName: 'Full GEO Scan',
    shortName: 'Full Scan',
    emoji: '⚡',
    description: 'Runs Discovery → Monitor → Report end-to-end and produces the complete GEO report in one click.',
    typicalDurationSec: 360,
  },
  discovery: {
    id: 'discovery',
    displayName: 'Discovery Agent',
    shortName: 'Discovery',
    emoji: '🔍',
    description: 'Generates 100 core GEO prompts + brand context from the brand input.',
    typicalDurationSec: 60,
  },
  monitor: {
    id: 'monitor',
    displayName: 'AIGVR Monitor Agent',
    shortName: 'Monitor',
    emoji: '📡',
    description:
      'Runs the prompt set across ChatGPT, Perplexity, Gemini, Claude. Scores the AIGVR five-dimension index.',
    typicalDurationSec: 600,
  },
  report: {
    id: 'report',
    displayName: 'Report Composer Agent',
    shortName: 'Report',
    emoji: '📊',
    description: 'Synthesizes monitor + audit data into a stakeholder-ready weekly / monthly report.',
    typicalDurationSec: 90,
  },
  optimize: {
    id: 'optimize',
    displayName: 'Content Optimize Agent',
    shortName: 'Optimize',
    emoji: '✍️',
    description: 'Turns the top measured gap into a publish-ready, AI-retrieval-optimized page + FAQ schema in the target language.',
    typicalDurationSec: 60,
  },
  distribute: {
    id: 'distribute',
    displayName: 'Distribution Agent',
    shortName: 'Distribute',
    emoji: '📣',
    description: 'Turns the Source-Authority targets into ready-to-send third-party placements (directory / PR / review submissions) in the target language.',
    typicalDurationSec: 60,
  },
  site: {
    id: 'site',
    displayName: 'Site Optimize Agent',
    shortName: 'Site',
    emoji: '🏗️',
    description: 'Fetches the brand homepage and returns paste-in JSON-LD + concrete AEO edits (entity clarity, structure) for AI retrieval & Google rich results.',
    typicalDurationSec: 60,
  },
  encyclopedia: {
    id: 'encyclopedia',
    displayName: 'Encyclopedia Agent',
    shortName: 'Encyclopedia',
    emoji: '📚',
    description: 'Honest Wikipedia notability check, then a neutral citation-scaffolded entry — or the realistic path (build coverage, get mentioned in existing articles).',
    typicalDurationSec: 60,
  },
};

export const V05_AGENT_IDS = Object.keys(AGENTS);
