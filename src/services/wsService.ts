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
  // When the server last said anything. A socket the OS put to sleep with
  // the screen still reports OPEN afterwards, so readyState alone cannot
  // tell a live connection from a dead one — silence can.
  private lastHeardAt = 0;
  private wakeBound = false;

  connect(token: string): void {
    // If the token changed while a socket is live (e.g. a driver was just
    // approved and received a fresh JWT), the open socket is still authenticated
    // with the OLD token/role — tear it down and reconnect with the new one.
    const tokenChanged = this.token !== null && this.token !== token;
    this.token = token;
    this.manualClose = false;
    this.bindWakeSources();
    if (tokenChanged && this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.open();
  }

  private open(): void {
    if (!this.token) return;
    // After an explicit disconnect() (e.g. logout), a lingering send() from a
    // timer or effect-cleanup would otherwise reopen the socket the user just
    // closed — token is still set, so the !this.token guard alone won't stop
    // it. Only connect()/forceReconnect() (which clear manualClose) may reopen.
    if (this.manualClose) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    // Auth via Sec-WebSocket-Protocol rather than a ?token= query string, so
    // the JWT never lands in proxy/CDN access logs. The server echoes back the
    // bare 'jwt' marker; the second entry carries the token.
    const ws = new WebSocket(WS_URL, ['jwt', this.token]);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.lastHeardAt = Date.now();
      // Flush anything queued while disconnected.
      for (const msg of this.queue.splice(0)) ws.send(msg);
      this.emit('__open', {});
    };

    ws.onmessage = (event) => {
      this.lastHeardAt = Date.now();
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

  /**
   * Come back the moment the app does.
   *
   * A phone in a pocket has its socket dropped and its timers throttled, and by
   * the time it is unlocked the reconnect backoff has grown to its 30-second
   * cap — so the map sat on a stale car for half a minute after the passenger
   * was already looking at it. Worse, the socket often still reads OPEN while
   * being quietly dead, and nothing would have reconnected at all; a stretch of
   * silence is the only evidence, so treat it as one.
   */
  private wake(): void {
    if (this.manualClose || !this.token) return;
    const silentFor = Date.now() - this.lastHeardAt;
    const openButSilent =
      this.ws?.readyState === WebSocket.OPEN && this.lastHeardAt > 0 && silentFor > 30000;
    if (openButSilent) {
      // Closing is what gets a fresh connection: reopening on top of a
      // half-open one just adds a second socket that is equally deaf.
      this.ws?.close();
      this.ws = null;
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0; // the backoff was for a network that was down, not an app that was away
    this.open();
  }

  // Bound once, on the first connect: these outlive any one screen.
  private bindWakeSources(): void {
    if (this.wakeBound || typeof document === 'undefined') return;
    this.wakeBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.wake();
    });
    window.addEventListener('online', () => this.wake());
    window.addEventListener('focus', () => this.wake());
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
      if (this.queue.length < 50) {
        this.queue.push(msg);
      } else {
        // Backpressure: a socket that's been down long enough to build a
        // 50-message backlog is unlikely to want stale queued frames anyway
        // (driver-location pings especially). Drop with a breadcrumb rather
        // than silently, so a stuck reconnect is at least visible in logs.
        console.warn('[ws] send queue full (50), dropping message', { type });
      }
      this.open();
    }
  }

  on(type: string, listener: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    // Multiple independent parts of the app subscribe to the same event type
    // (e.g. both notificationService's chime/toast and a screen's own UI
    // update listen to 'ride_available'). forEach aborts entirely the moment
    // one listener throws, silently skipping every listener registered after
    // it for this emit — one broken handler could starve a sibling handler
    // with no error ever surfacing. Isolate each listener's call instead.
    this.listeners.get(type)?.forEach((l) => {
      try {
        l(payload);
      } catch (err) {
        console.error(`[ws] listener for "${type}" threw:`, err);
      }
    });
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.queue.length = 0;
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
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }
    this.ws = null;
    this.open();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WsService();
