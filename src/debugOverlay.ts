// On-device diagnostics: the Pi Browser exposes no console (no devtools, no
// logcat mirroring), so app errors/warnings are rendered onto a screen
// overlay instead. Off by default; open the app with ?debug=1 to enable for
// the session (persisted in sessionStorage across SPA reloads). Collapsed to
// a small tappable badge by default so it never blocks normal use — tap it
// to expand the full log panel.

const enabled = (() => {
  try {
    if (new URLSearchParams(location.search).has('debug')) {
      sessionStorage.setItem('taxipro_debug', '1');
    }
    return sessionStorage.getItem('taxipro_debug') === '1';
  } catch {
    return false;
  }
})();

const MAX_LINES = 60;
let panel: HTMLElement | null = null;
let badge: HTMLButtonElement | null = null;
let unseenCount = 0;
let expanded = false;

function getExpandedPref(): boolean {
  try {
    return sessionStorage.getItem('taxipro_debug_expanded') === '1';
  } catch {
    return false;
  }
}

function setExpandedPref(v: boolean): void {
  try {
    sessionStorage.setItem('taxipro_debug_expanded', v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function updateBadge(): void {
  if (!badge) return;
  badge.textContent = expanded ? '▼ Debug' : unseenCount > 0 ? `🐞 Debug (${unseenCount})` : '🐞 Debug';
  badge.style.background = !expanded && unseenCount > 0 ? '#B00020' : 'rgba(0,0,0,0.78)';
}

function setExpanded(v: boolean): void {
  expanded = v;
  setExpandedPref(v);
  if (!panel) return;
  panel.style.display = v ? 'block' : 'none';
  if (v) unseenCount = 0;
  updateBadge();
}

function ensureUi(): HTMLElement | null {
  if (panel) return panel;
  if (!document.body) return null;

  expanded = getExpandedPref();

  badge = document.createElement('button');
  badge.type = 'button';
  Object.assign(badge.style, {
    position: 'fixed',
    right: '8px',
    bottom: '8px',
    zIndex: '2147483647',
    font: '11px/1 monospace',
    color: '#fff',
    background: 'rgba(0,0,0,0.78)',
    border: 'none',
    borderRadius: '999px',
    padding: '6px 10px',
    pointerEvents: 'auto',
  });
  badge.onclick = () => setExpanded(!expanded);
  document.body.appendChild(badge);

  panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '36px',
    zIndex: '2147483646',
    maxHeight: '45vh',
    overflow: 'auto',
    background: 'rgba(0,0,0,0.86)',
    color: '#7CFC00',
    font: '10px/1.35 monospace',
    padding: '4px 6px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    pointerEvents: 'auto',
    display: 'none',
  });
  document.body.appendChild(panel);

  setExpanded(expanded);
  return panel;
}

function append(kind: string, args: unknown[]): void {
  if (!enabled) return;
  const el = ensureUi();
  if (!el) return;
  const text = args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  const line = document.createElement('div');
  line.textContent = `${new Date().toISOString().slice(11, 23)} ${kind} ${text}`;
  if (kind !== 'log') line.style.color = '#FF6B6B';
  el.appendChild(line);
  while (el.childNodes.length > MAX_LINES) el.removeChild(el.firstChild!);
  el.scrollTop = el.scrollHeight;
  if (!expanded) {
    unseenCount += 1;
    updateBadge();
  }
}

// warn/error are always mirrored — the app only ever calls these with a
// meaningful `[screen] action:` tag, never noise. `log` stays opt-in via the
// [TaxiProDebug] marker so third-party chatter (Pi SDK, etc.) doesn't flood
// the small on-screen panel.
for (const kind of ['log', 'warn', 'error'] as const) {
  const original = console[kind].bind(console);
  console[kind] = (...args: unknown[]) => {
    original(...args);
    if (kind === 'log') {
      if (typeof args[0] === 'string' && args[0].includes('TaxiProDebug')) append(kind, args);
    } else {
      append(kind, args);
    }
  };
}

window.addEventListener('error', (e) =>
  append('error', [`[TaxiProDebug] window.onerror: ${e.message} @ ${e.filename}:${e.lineno}`])
);
window.addEventListener('unhandledrejection', (e) =>
  append('error', [
    `[TaxiProDebug] unhandledrejection: ${
      e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : JSON.stringify(e.reason)
    }`,
  ])
);

if (enabled) {
  console.log(
    `[TaxiProDebug] overlay active | url: ${location.host} | ua: ${navigator.userAgent.slice(0, 80)}`
  );
}
