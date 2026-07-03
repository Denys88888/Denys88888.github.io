import { WS_URL } from '../utils/constants';

type Listener = (payload: Record<string, unknown>) => void;

// Singleton WebSocket client with JWT-handshake auth and exponential-backoff
// reconnect (1s → 30s cap). Consumers subscribe to server message `type`s.
class WsService {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private queue: string[] = [];

  connect(token: string): void {
    this.token = token;
    this.manualClose = false;
    this.open();
  }

  private open(): void {
    if (!this.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const ws = new WebSocket(`${WS_URL}/?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Flush anything queued while disconnected.
      for (const msg of this.queue.splice(0)) ws.send(msg);
      this.emit('__open', {});
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        const type = String(data.type ?? '');
        this.emit(type, data);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = (event) => {
      this.emit('__close', { code: event.code });
      // 1008 = auth rejected: do not retry with the same (bad) token.
      if (this.manualClose || event.code === 1008) return;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnection.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    const msg = JSON.stringify({ type, ...payload });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.queue.push(msg);
      this.open();
    }
  }

  on(type: string, listener: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    this.listeners.get(type)?.forEach((l) => l(payload));
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
  }

  // Immediately attempt to reconnect, resetting the backoff. Used when the device
  // regains network connectivity (the `online` event) so we don't wait out a
  // pending backoff delay.
  forceReconnect(): void {
    if (!this.token || this.manualClose) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.ws = null;
    this.open();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WsService();
