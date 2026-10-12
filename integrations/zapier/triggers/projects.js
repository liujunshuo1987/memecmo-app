// Hidden trigger backing the "project" dynamic dropdown.
const BASE = process.env.BASE_URL || 'https://app.memecmo.ai';
const perform = async (z) => {
  const res = await z.request({ url: `${BASE}/api/connector/v1/projects` });
  return (res.data.projects || []).map((p) => ({ id: p.slug, slug: p.slug, brand: p.brand, market: p.market, label: `${p.brand} · ${p.market}` }));
};
module.exports = {
  key: 'projects',
  noun: 'Project',
  display: { label: 'List Projects', description: 'Projects (brand × market) this account can see.', hidden: true },
  operation: { perform, sample: { id: 'my-brand-vietnam', slug: 'my-brand-vietnam', brand: 'My Brand', market: 'Vietnam', label: 'My Brand · Vietnam' } },
};
