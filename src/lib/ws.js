// WebSocket client — auto-reconnect, event emitter, keep-alive ping
// Prefer an explicit VITE_WS_URL; otherwise derive ws(s):// from the API URL.
const WS_URL = import.meta.env.VITE_WS_URL ||
  (import.meta.env.VITE_API_URL || 'http://localhost:10000')
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:');

class TaxiWS {
  constructor() {
    this._ws = null;
    this._handlers = new Map();
    this._token = null;
    this._reconnectTimer = null;
    this._pingTimer = null;
    this._destroyed = false;
  }

  connect(token) {
    if (this._ws?.readyState === WebSocket.OPEN) return;
    this._token = token;
    this._destroyed = false;
    try {
      this._ws = new WebSocket(WS_URL);
    } catch (e) {
      console.warn('[WS] Connect error:', e.message);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      clearTimeout(this._reconnectTimer);
      if (token) this.send({ type: 'auth', token });
      this._startPing();
      this._emit('connected', {});
    };

    this._ws.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        this._emit(data.type, data);
        this._emit('*', data);
      } catch { /* ignore parse errors */ }
    };

    this._ws.onclose = () => {
      this._stopPing();
      this._emit('disconnected', {});
      if (!this._destroyed) this._scheduleReconnect();
    };

    this._ws.onerror = () => { /* onclose will fire after */ };
  }

  _scheduleReconnect() {
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this.connect(this._token), 5000);
  }

  _startPing() {
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => this.send({ type: 'ping' }), 30000);
  }

  _stopPing() {
    clearInterval(this._pingTimer);
  }

  send(data) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(handler);
    return () => this._handlers.get(type)?.delete(handler);
  }

  off(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }

  _emit(type, data) {
    this._handlers.get(type)?.forEach(h => { try { h(data); } catch { /* */ } });
  }

  disconnect() {
    this._destroyed = true;
    clearTimeout(this._reconnectTimer);
    this._stopPing();
    this._ws?.close();
    this._ws = null;
  }

  get connected() {
    return this._ws?.readyState === WebSocket.OPEN;
  }
}

export const ws = new TaxiWS();
export default ws;
