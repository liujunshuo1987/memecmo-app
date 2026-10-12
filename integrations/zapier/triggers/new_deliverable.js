// Polling trigger: a deliverable is ready — the publish-ready text with the client's edits applied.
const BASE = process.env.BASE_URL || 'https://app.memecmo.ai';
const TYPES = {
  content_draft: 'Content draft (page + FAQ)', distribution_kit: 'Distribution kit (placements)', site_optimization: 'Site upgrade (JSON-LD + edits)',
  encyclopedia_entry: 'Encyclopedia entry', geo_report: 'GEO report',
};
const perform = async (z, bundle) => {
  const types = Array.isArray(bundle.inputData.types) ? bundle.inputData.types : (bundle.inputData.types ? [bundle.inputData.types] : []);
  const res = await z.request({ url: `${BASE}/api/connector/v1/events/deliverables`, params: { limit: 25, ...(types.length ? { type: types.join(',') } : {}) } });
  const want = bundle.inputData.project;
  return (res.data.deliverables || []).filter((d) => !want || d.project === want);
};
module.exports = {
  key: 'new_deliverable',
  noun: 'Deliverable',
  display: { label: 'New Deliverable', description: 'Triggers when a content draft, distribution kit, site upgrade, encyclopedia entry or report is generated. Figures in the text come only from the brand\'s public facts; a placeholder means the brand has not published that number.' },
  operation: {
    inputFields: [
      { key: 'project', label: 'Project', required: false, dynamic: 'projects.id.label' },
      { key: 'types', label: 'Deliverable types', required: false, list: true, choices: TYPES, helpText: 'Default: content drafts, distribution kits, site upgrades, encyclopedia entries and reports.' },
    ],
    perform,
    sample: {
      id: '5b9b1b7e-0000-4000-8000-000000000002', project: 'my-brand-vietnam', brand: 'My Brand', market: 'Vietnam', organization: 'My Company',
      type: 'content_draft', title: 'My Brand — Elevator advertising in Hanoi: a buyer\'s guide', format: 'markdown', run_id: '2c1e9c1a-0000-4000-8000-000000000003',
      created_at: '2026-10-10T02:30:00.000Z', edited: false, words: 640, content: '# Elevator advertising in Hanoi\n\n…', workspace_url: 'https://app.memecmo.ai/workspace/my-company/my-brand-vietnam',
    },
    outputFields: [
      { key: 'id', label: 'Deliverable ID' }, { key: 'project' }, { key: 'brand' }, { key: 'market' }, { key: 'type' }, { key: 'title' }, { key: 'format' },
      { key: 'run_id', label: 'Run ID (use as source_run_id when logging the action)' }, { key: 'created_at', type: 'datetime' }, { key: 'edited', type: 'boolean', label: 'Edited by a person' },
      { key: 'words', type: 'integer' }, { key: 'content', type: 'string', label: 'Content (markdown)' }, { key: 'workspace_url' },
    ],
  },
};
