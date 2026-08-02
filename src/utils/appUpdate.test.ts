import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { watchForNewVersion } from './appUpdate';
import { useAppStore } from '../store/useAppStore';
import type { Ride } from '../types';

// A stand-in for navigator.serviceWorker: enough of the container to dispatch
// 'controllerchange' and answer getRegistration().
class FakeContainer extends EventTarget {
  controller: object | null = null;
  update = vi.fn().mockResolvedValue(undefined);
  getRegistration = vi.fn(async () => ({ update: this.update }));
  claim() {
    this.controller = {};
    this.dispatchEvent(new Event('controllerchange'));
  }
}

let sw: FakeContainer;
let reload: ReturnType<typeof vi.fn>;
let stop: (() => void) | undefined;

// document outlives each test, so a watcher left running would answer the next
// test's events too.
function start() {
  stop = watchForNewVersion();
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  sw = new FakeContainer();
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  useAppStore.setState({ currentRide: null });
  document.body.innerHTML = '';
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('watchForNewVersion', () => {
  it('reloads when a newer worker takes control of the page', () => {
    sw.controller = {};
    start();

    sw.claim();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sits still through the first worker installing on a brand new visit', () => {
    sw.controller = null; // nothing has ever controlled this page
    start();

    sw.claim();

    expect(reload).not.toHaveBeenCalled();
  });

  it('waits out a ride rather than reloading the map from under it', () => {
    sw.controller = {};
    useAppStore.setState({ currentRide: { id: 'r1', status: 'in_progress' } as Ride });
    start();

    sw.claim();
    expect(reload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    expect(reload).not.toHaveBeenCalled();

    useAppStore.setState({ currentRide: null });
    vi.advanceTimersByTime(5_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits while an address is being typed', () => {
    sw.controller = {};
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    start();

    sw.claim();
    expect(reload).not.toHaveBeenCalled();

    input.blur();
    vi.advanceTimersByTime(5_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads only once however many workers claim the page', () => {
    sw.controller = {};
    start();

    sw.claim();
    sw.claim();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('asks for a fresh worker when the app comes back to the foreground', async () => {
    sw.controller = {};
    start();

    // The browser only re-fetches sw.js on navigation, so a session left open
    // learns about a deploy from this check and nothing else.
    vi.advanceTimersByTime(16 * 60 * 1000);
    setVisibility('visible');
    await vi.runAllTimersAsync();

    expect(sw.update).toHaveBeenCalledTimes(1);
  });

  it('does not re-check on every glance at the app', async () => {
    sw.controller = {};
    start();

    setVisibility('visible');
    vi.advanceTimersByTime(60_000);
    setVisibility('visible');
    await vi.runAllTimersAsync();

    expect(sw.update).not.toHaveBeenCalled();
  });

  it('does nothing where the browser has no service worker at all', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });

    expect(() => start()).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});
