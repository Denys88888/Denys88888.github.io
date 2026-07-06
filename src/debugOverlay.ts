// On-device diagnostics: the Pi Browser exposes no console (no devtools, no
// logcat mirroring), so [TaxiProDebug] lines are rendered onto a screen
// overlay. Off by default; open the app with ?debug=1 to enable for the
// session (persisted in sessionStorage across SPA reloads).

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

const MAX_LINES = 40;
let box: HTMLElement | null = null;

function ensureBox(): HTMLElement | null {
  if (box) return box;
  if (!document.body) return null;
  box = document.createElement('div');
  box.id = 'taxipro-debug-overlay';
  Object.assign(box.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '2147483647',
    maxHeight: '45vh',
    overflow: 'hidden',
    background: 'rgba(0,0,0,0.78)',
    color: '#7CFC00',
    font: '10px/1.35 monospace',
    padding: '4px 6px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    pointerEvents: 'none',
  });
  document.body.appendChild(box);
  return box;
}

function append(kind: string, args: unknown[]): void {
  if (!enabled) return;
  const el = ensureBox();
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
  // overflow is hidden, so keep the newest line pinned into view.
  el.scrollTop = el.scrollHeight;
}

for (const kind of ['log', 'warn', 'error'] as const) {
  const original = console[kind].bind(console);
  console[kind] = (...args: unknown[]) => {
    original(...args);
    if (typeof args[0] === 'string' && args[0].includes('TaxiProDebug')) append(kind, args);
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
