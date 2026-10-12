// Search: the current high-intent gaps of a project (one result holding the list).
const BASE = process.env.BASE_URL || 'https://app.memecmo.ai';
const perform = async (z, bundle) => {
  const res = await z.request({ url: `${BASE}/api/connector/v1/projects/${encodeURIComponent(bundle.inputData.project)}/gaps`, params: { limit: 50 } });
  const gaps = res.data.gaps || [];
  return [{ id: `${bundle.inputData.project}:${res.data.scanned_at || 'none'}`, scanned_at: res.data.scanned_at, total: res.data.total, questions: gaps.map((g) => g.prompt), gaps, workspace_url: res.data.workspace }];
};
module.exports = {
  key: 'find_gaps',
  noun: 'Gap list',
  display: { label: 'Find Current Gaps', description: 'The buyer questions where AI engines name competitors but not the brand, from the latest scan.' },
  operation: {
    inputFields: [{ key: 'project', label: 'Project', required: true, dynamic: 'projects.id.label' }],
    perform,
    sample: { id: 'my-brand-vietnam:2026-10-10T02:14:00.000Z', scanned_at: '2026-10-10T02:14:00.000Z', total: 9, questions: ['Which elevator advertising company has the widest coverage in Hanoi?'], gaps: [{ stage: 'consideration', prompt: 'Which elevator advertising company has the widest coverage in Hanoi?', engine: 'Perplexity', competitorsPresent: ['Competitor A'] }], workspace_url: 'https://app.memecmo.ai/workspace/my-company/my-brand-vietnam' },
    outputFields: [{ key: 'id' }, { key: 'scanned_at', type: 'datetime' }, { key: 'total', type: 'integer' }, { key: 'questions', label: 'Questions' }, { key: 'workspace_url' }],
  },
};
