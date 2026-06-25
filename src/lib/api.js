// REST API client for the Taxi Pro backend
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let _token = null;

export function setToken(token) { _token = token; }
export function getToken() { return _token; }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export const api = {
  // Auth
  verify: accessToken => request('POST', '/auth/verify', { accessToken }),

  // Rides
  createRide: ride => request('POST', '/api/rides', ride),
  getRide: id => request('GET', `/api/rides/${id}`),
  getRides: userId => request('GET', `/api/rides${userId ? `?userId=${userId}` : ''}`),
  updateRide: (id, updates) => request('PATCH', `/api/rides/${id}`, updates),
  shareRide: id => request('POST', `/api/rides/${id}/share`),

  // Payments
  approvePayment: id => request('POST', `/api/payments/${id}/approve`),
  completePayment: (id, txid) => request('POST', `/api/payments/${id}/complete`, { txid }),

  // User
  updateUser: (id, data) => request('PATCH', `/api/users/${id}`, data),

  // Push token
  registerPushToken: (userId, token) => request('POST', '/api/push-token', { userId, token }),

  // Ratings
  submitRating: rating => request('POST', '/api/ratings', rating),

  // Promos
  validatePromo: (code, userId) => request('POST', '/api/promos/validate', { code, userId }),

  // Messages
  getMessages: chatId => request('GET', `/api/messages?chatId=${chatId}`),

  // Health
  health: () => request('GET', '/health'),
};

export default api;
