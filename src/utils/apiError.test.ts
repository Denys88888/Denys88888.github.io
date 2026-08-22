import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiErrorKey } from './apiError';

const withStatus = (status: number): AxiosError => {
  const err = new AxiosError('boom');
  err.response = {
    status,
    statusText: '',
    data: undefined,
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return err;
};

// Three different situations used to produce one sentence. The whole point of
// the helper is that they no longer do.
describe('apiErrorKey', () => {
  it('tells the user their connection is gone when nothing answered', () => {
    // No `response` at all: airplane mode, a tunnel, DNS.
    expect(apiErrorKey(new AxiosError('Network Error'))).toBe('common.offline');
  });

  it('names the server when the edge answers but the app behind it does not', () => {
    // What a sleeping — or suspended — Render instance returns.
    expect(apiErrorKey(withStatus(502))).toBe('common.serverDown');
    expect(apiErrorKey(withStatus(503))).toBe('common.serverDown');
    expect(apiErrorKey(withStatus(504))).toBe('common.serverDown');
  });

  it('keeps the generic message for a request the server did answer', () => {
    // 400/409/500 are ours to explain, and several callers already do it with
    // a more specific message before falling back here.
    expect(apiErrorKey(withStatus(400))).toBe('common.error');
    expect(apiErrorKey(withStatus(500))).toBe('common.error');
  });

  it('does not mislabel a plain bug as a network problem', () => {
    expect(apiErrorKey(new TypeError('x is not a function'))).toBe('common.error');
    expect(apiErrorKey(undefined)).toBe('common.error');
  });
});
