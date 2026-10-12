// Runs the integration against a real MemeCMO host with a connector key or OAuth token:
//   BASE_URL=https://app.memecmo.ai MEMECMO_TOKEN=mc_… npm test
const zapier = require('zapier-platform-core');
const App = require('../index');
const appTester = zapier.createAppTester(App);
zapier.tools.env.inject();

const authData = { access_token: process.env.MEMECMO_TOKEN };
const skip = !process.env.MEMECMO_TOKEN;

describe('MemeCMO connector', () => {
  (skip ? test.skip : test)('auth test + connection label', async () => {
    const r = await appTester(App.authentication.test, { authData });
    expect(r.organization).toBeTruthy();
  });
  (skip ? test.skip : test)('projects dropdown', async () => {
    const r = await appTester(App.triggers.projects.operation.perform, { authData, inputData: {} });
    expect(r.length).toBeGreaterThan(0); expect(r[0].id).toBe(r[0].slug);
  });
  (skip ? test.skip : test)('new_scan', async () => {
    const r = await appTester(App.triggers.new_scan.operation.perform, { authData, inputData: {} });
    expect(Array.isArray(r)).toBe(true); if (r.length) { expect(r[0].id).toBeTruthy(); expect(typeof r[0].gap_count).toBe('number'); }
  });
  (skip ? test.skip : test)('new_deliverable (content drafts)', async () => {
    const r = await appTester(App.triggers.new_deliverable.operation.perform, { authData, inputData: { types: ['content_draft'] } });
    expect(Array.isArray(r)).toBe(true); if (r.length) { expect(r[0].type).toBe('content_draft'); expect(typeof r[0].content).toBe('string'); }
  });
  (skip ? test.skip : test)('find_deliverable + find_gaps', async () => {
    const project = process.env.TEST_PROJECT || 'neuronspark-hk';
    const d = await appTester(App.searches.find_deliverable.operation.perform, { authData, inputData: { project, type: 'content_draft' } });
    expect(Array.isArray(d)).toBe(true);
    const g = await appTester(App.searches.find_gaps.operation.perform, { authData, inputData: { project } });
    expect(g.length).toBe(1); expect(Array.isArray(g[0].questions)).toBe(true);
  });
  (skip || !process.env.TEST_WRITE ? test.skip : test)('log_action (idempotent)', async () => {
    const project = process.env.TEST_PROJECT || 'neuronspark-hk';
    const input = { project, kind: 'other', url: 'https://app.memecmo.ai/connector#zapier-test', published_at: new Date().toISOString(), title: 'Zapier test', target_prompts: ['q1'] };
    const a = await appTester(App.creates.log_action.operation.perform, { authData, inputData: input });
    expect(a.id).toBeTruthy();
    const b = await appTester(App.creates.log_action.operation.perform, { authData, inputData: input });
    expect(b.id).toBe(a.id); expect(b.duplicate).toBe(true);
  });
});
