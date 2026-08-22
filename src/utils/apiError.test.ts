import { describe, it, expect, afterEach } from 'vitest';
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

const setOnline = (online: boolean): void => {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
};

// Three different situations used to produce one sentence. The whole point of
// the helper is that they no longer do.
describe('apiErrorKey', () => {
  afterEach(() => setOnline(true));

  it('tells the user their connection is gone when the phone has no network', () => {
    // No `response` at all, and the radio agrees: airplane mode, a tunnel.
    setOnline(false);
    expect(apiErrorKey(new AxiosError('Network Error'))).toBe('common.offline');
  });

  // The bug this pins: a suspended Render service answers with a plain HTML
  // page and no CORS header, so the browser blocks it and axios reports the
  // same shape as a dead tunnel. Calling that "no internet connection" on a
  // phone with full bars sends the driver to reboot their handset over an
  // outage that is ours.
  it('blames the server, not the phone, when the phone is online', () => {
    setOnline(true);
    expect(apiErrorKey(new AxiosError('Network Error'))).toBe('common.cantReachServer');
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
