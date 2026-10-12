// Search: the latest deliverable of one type for a project (publish-ready text with edits applied).
const BASE = process.env.BASE_URL || 'https://app.memecmo.ai';
const TYPES = {
  content_draft: 'Content draft (page + FAQ)', distribution_kit: 'Distribution kit', site_optimization: 'Site upgrade', encyclopedia_entry: 'Encyclopedia entry',
  geo_report: 'GEO report', standard_answers: 'Standard answers', brand_profile: 'Brand profile',
};
const perform = async (z, bundle) => {
  const res = await z.request({ url: `${BASE}/api/connector/v1/projects/${encodeURIComponent(bundle.inputData.project)}/deliverables`, params: { type: bundle.inputData.type } });
  const d = res.data.deliverable;
  if (!d) return [];
  const content = typeof d.content === 'string' ? d.content : JSON.stringify(d.content, null, 2);
  return [{ id: d.runId || `${bundle.inputData.project}:${d.type}`, type: d.type, title: d.title || null, format: d.format, run_id: d.runId || null, created_at: d.createdAt || null, edited: !!d.edited, content, workspace_url: res.data.workspace }];
};
module.exports = {
  key: 'find_deliverable',
  noun: 'Deliverable',
  display: { label: 'Find Latest Deliverable', description: 'Get the latest deliverable of a type for a project — the text to publish, with the client\'s own edits applied.' },
  operation: {
    inputFields: [
      { key: 'project', label: 'Project', required: true, dynamic: 'projects.id.label' },
      { key: 'type', label: 'Type', required: true, choices: TYPES, default: 'content_draft' },
    ],
    perform,
    sample: { id: '2c1e9c1a-0000-4000-8000-000000000003', type: 'content_draft', title: 'My Brand — buyer\'s guide', format: 'markdown', run_id: '2c1e9c1a-0000-4000-8000-000000000003', created_at: '2026-10-10T02:30:00.000Z', edited: false, content: '# …', workspace_url: 'https://app.memecmo.ai/workspace/my-company/my-brand-vietnam' },
    outputFields: [{ key: 'id' }, { key: 'type' }, { key: 'title' }, { key: 'run_id' }, { key: 'created_at', type: 'datetime' }, { key: 'edited', type: 'boolean' }, { key: 'content', type: 'string' }, { key: 'workspace_url' }],
  },
};
