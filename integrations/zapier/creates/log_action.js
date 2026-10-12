// Action: log something the brand published, so MemeCMO verifies the page and attributes what moves.
const BASE = process.env.BASE_URL || 'https://app.memecmo.ai';
const KINDS = {
  content_page: 'Content page on the brand\'s site', third_party_placement: 'Third-party placement (article, PR, social post)', directory_profile: 'Directory profile',
  schema: 'Schema / structured data', site_update: 'Site update', encyclopedia: 'Encyclopedia entry', other: 'Other',
};
const perform = async (z, bundle) => {
  const d = bundle.inputData;
  const res = await z.request({
    url: `${BASE}/api/connector/v1/projects/${encodeURIComponent(d.project)}/actions`, method: 'POST',
    body: {
      kind: d.kind, url: d.url || null, published_at: String(d.published_at || '').slice(0, 10), title: d.title || null, note: d.note || null,
      target_prompts: d.target_prompts || [], source_run_id: d.source_run_id || null,
    },
  });
  return res.data;
};
module.exports = {
  key: 'log_action',
  noun: 'Action',
  display: { label: 'Log Published Action', description: 'Record a page, article, post or profile that went live. MemeCMO fetches and verifies it and attributes changes in later scans. Logging the same URL twice returns the existing record.' },
  operation: {
    inputFields: [
      { key: 'project', label: 'Project', required: true, dynamic: 'projects.id.label' },
      { key: 'kind', label: 'Kind', required: true, choices: KINDS, default: 'third_party_placement' },
      { key: 'url', label: 'Live URL', required: false, helpText: 'The public URL of what went live. Needed for verification.' },
      { key: 'published_at', label: 'Published on', required: true, type: 'datetime', helpText: 'The day it went live (not in the future).' },
      { key: 'title', label: 'Title', required: false },
      { key: 'note', label: 'Note', required: false, type: 'text' },
      { key: 'target_prompts', label: 'Target questions', required: false, list: true, helpText: 'The buyer questions this action targets — copy them verbatim from the scan\'s gaps.' },
      { key: 'source_run_id', label: 'Source run ID', required: false, helpText: 'The deliverable this came from (run_id from the New Deliverable trigger).' },
    ],
    perform,
    sample: {
      source: 'MemeCMO', organization: 'My Company', project: 'my-brand-vietnam', brand: 'My Brand', market: 'Vietnam',
      workspace: 'https://app.memecmo.ai/workspace/my-company/my-brand-vietnam', id: 'a1f3c2d4-0000-4000-8000-000000000004',
      logged: true, duplicate: false, verification_queued: true, kind: 'third_party_placement', url: 'https://www.facebook.com/mybrand/posts/123', published_at: '2026-10-10', target_prompts: [],
    },
    outputFields: [
      { key: 'id', label: 'Action ID' }, { key: 'logged', type: 'boolean' }, { key: 'duplicate', type: 'boolean' }, { key: 'verification_queued', type: 'boolean' },
      { key: 'kind' }, { key: 'url' }, { key: 'published_at' }, { key: 'workspace' },
    ],
  },
};
