// Polling trigger: a comparable scan finished (AI Mindset Index, presence, gap count).
const BASE = process.env.BASE_URL || 'https://app.memecmo.ai';
const perform = async (z, bundle) => {
  const res = await z.request({ url: `${BASE}/api/connector/v1/events/scans`, params: { limit: 25 } });
  const want = bundle.inputData.project;
  return (res.data.scans || []).filter((s) => !want || s.project === want);
};
module.exports = {
  key: 'new_scan',
  noun: 'Scan',
  display: { label: 'New Scan', description: 'Triggers when a scheduled or manual scan of a project completes (comparable scans only; partial and diagnostic scans are skipped).' },
  operation: {
    inputFields: [{ key: 'project', label: 'Project', required: false, dynamic: 'projects.id.label', helpText: 'Leave empty for every project this account can see.' }],
    perform,
    sample: {
      id: '8d2f5f2c-0000-4000-8000-000000000001', project: 'my-brand-vietnam', brand: 'My Brand', market: 'Vietnam', organization: 'My Company',
      scanned_at: '2026-10-10T02:14:00.000Z', agent: 'monitor', ai_mindset_index: 58, presence_pct: 46, share_of_voice_pct: 41, citation_pct: 12,
      queries: 120, gap_count: 9, top_gaps: ['Which elevator advertising company has the widest coverage in Hanoi?'], workspace_url: 'https://app.memecmo.ai/workspace/my-company/my-brand-vietnam',
    },
    outputFields: [
      { key: 'id', label: 'Scan ID' }, { key: 'project', label: 'Project slug' }, { key: 'brand' }, { key: 'market' }, { key: 'scanned_at', type: 'datetime' },
      { key: 'ai_mindset_index', type: 'integer', label: 'AI Mindset Index (0–100)' }, { key: 'presence_pct', type: 'number', label: 'Presence % (answers naming the brand ÷ all answers)' },
      { key: 'share_of_voice_pct', type: 'number' }, { key: 'citation_pct', type: 'number' }, { key: 'queries', type: 'integer' }, { key: 'gap_count', type: 'integer' },
      { key: 'top_gaps', label: 'Top gaps (questions)' }, { key: 'workspace_url' },
    ],
  },
};
