/**
 * The socket's send queue.
 *
 * This is the property DriverHomeScreen.accept() leans on: the ride list is
 * filled by a REST poll, so a request card is on screen from the first render —
 * seconds before the socket finishes connecting. Accepting in that window has to
 * survive the gap, or the driver loses a ride they were already looking at.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    public url: string,
    public protocols?: string[]
  ) {
    FakeSocket.instances.push(this);
  }

  send(msg: string): void {
    this.sent.push(msg);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }

  /** Complete the handshake, the way a real server would. */
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
}

async function loadService() {
  vi.resetModules();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  return (await import('./wsService')).wsService;
}

const parsed = (sock: FakeSocket) => sock.sent.map((s) => JSON.parse(s));

describe('wsService send queue', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds a message sent while connecting and delivers it on open', async () => {
    const ws = await loadService();
    ws.connect('tok');
    const sock = FakeSocket.instances[0];
    expect(sock.readyState).toBe(FakeSocket.CONNECTING);

    // The tap that used to be refused outright.
    ws.send('ride_accept', { rideId: 'ride_1' });
    expect(sock.sent).toHaveLength(0);

    sock.open();
    expect(parsed(sock)).toEqual([{ type: 'ride_accept', rideId: 'ride_1' }]);

    ws.disconnect();
  });

  it('keeps queued messages in the order they were sent', async () => {
    const ws = await loadService();
    ws.connect('tok');
    const sock = FakeSocket.instances[0];

    ws.send('driver_online', { lat: 1, lng: 2 });
    ws.send('ride_accept', { rideId: 'ride_1' });
    sock.open();

    expect(parsed(sock).map((m) => m.type)).toEqual(['driver_online', 'ride_accept']);

    ws.disconnect();
  });

  it('reports not-connected until the handshake completes', async () => {
    const ws = await loadService();
    ws.connect('tok');
    expect(ws.connected).toBe(false);

    FakeSocket.instances[0].open();
    expect(ws.connected).toBe(true);

    ws.disconnect();
  });

  it('drops the backlog past 50 rather than growing without bound', async () => {
    const ws = await loadService();
    ws.connect('tok');
    const sock = FakeSocket.instances[0];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let i = 0; i < 55; i++) ws.send('driver_location', { i });
    sock.open();

    expect(sock.sent).toHaveLength(50);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    ws.disconnect();
  });

  it('does not resurrect the socket for a send after disconnect', async () => {
    // Logout tears the socket down while timers and effect cleanups are still
    // firing; a queued send must not quietly reopen a session the user ended.
    const ws = await loadService();
    ws.connect('tok');
    FakeSocket.instances[0].open();
    ws.disconnect();

    ws.send('driver_location', { lat: 1, lng: 2 });
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
