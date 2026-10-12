const includeBearer = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.access_token) request.headers.Authorization = `Bearer ${bundle.authData.access_token}`;
  request.headers.Accept = 'application/json';
  return request;
};

const handleErrors = (response, z) => {
  if (response.status === 401) throw new z.errors.RefreshAuthError('MemeCMO session expired');
  if (response.status >= 400) {
    let msg = `MemeCMO returned ${response.status}`;
    try { const j = response.json || JSON.parse(response.content); msg = j.message || j.error_description || j.error || msg; } catch (e) { /* keep */ }
    throw new z.errors.Error(msg, 'MemeCMOError', response.status);
  }
  return response;
};

module.exports = { includeBearer, handleErrors };
