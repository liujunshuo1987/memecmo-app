// OAuth 2.1 against MemeCMO's own authorization server (PKCE S256, refresh rotation).
// CLIENT_ID / CLIENT_SECRET come from `zapier env:set` after registering a
// confidential client for Zapier's redirect URL (see README).
const BASE = process.env.BASE_URL || 'https://app.memecmo.ai';

const test = { url: `${BASE}/api/connector/v1/me` };

const authorizeUrl = {
  url: `${BASE}/oauth/authorize`,
  params: {
    client_id: '{{process.env.CLIENT_ID}}',
    state: '{{bundle.inputData.state}}',
    redirect_uri: '{{bundle.inputData.redirect_uri}}',
    response_type: 'code',
    scope: 'read write',
  },
};

const getAccessToken = {
  url: `${BASE}/api/oauth/token`,
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: {
    grant_type: 'authorization_code',
    code: '{{bundle.inputData.code}}',
    client_id: '{{process.env.CLIENT_ID}}',
    client_secret: '{{process.env.CLIENT_SECRET}}',
    redirect_uri: '{{bundle.inputData.redirect_uri}}',
    code_verifier: '{{bundle.inputData.code_verifier}}',
  },
};

const refreshAccessToken = {
  url: `${BASE}/api/oauth/token`,
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: {
    grant_type: 'refresh_token',
    refresh_token: '{{bundle.authData.refresh_token}}',
    client_id: '{{process.env.CLIENT_ID}}',
    client_secret: '{{process.env.CLIENT_SECRET}}',
  },
};

module.exports = {
  type: 'oauth2',
  oauth2Config: { authorizeUrl, getAccessToken, refreshAccessToken, autoRefresh: true, enablePkce: true, scope: 'read write' },
  test,
  connectionLabel: '{{organization}}',
};
