// Android WebViews — the Pi Browser included — routinely paint the page
// underneath the system navigation bar while reporting
// env(safe-area-inset-bottom) as 0. Anything pinned to the bottom (the tab bar,
// the last button of a sheet) then sits half-covered by the nav buttons and
// can't be tapped. Reported live from a Samsung with 3-button navigation: the
// Home/History/Profile labels were behind the system buttons.
//
// Rather than hardcode extra padding for every Android device, measure what the
// engine actually reports and only reserve the gap ourselves when it reports
// nothing. A device that does report a real inset keeps using it.
const ANDROID_NAV_BAR_PX = 48; // a 48dp system nav bar, Android's own spec

// What the engine computes for env(safe-area-inset-bottom), in CSS pixels.
// Measured off a hidden probe because the value isn't readable any other way —
// getComputedStyle returns the unresolved `env(...)` token.
export function reportedBottomInset(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;' +
    'height:env(safe-area-inset-bottom, 0px)';
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

// Sets --android-nav-floor when the runtime under-reports its bottom inset.
// --safe-bottom (globals.css) maxes the two together, so this only ever adds
// space that would otherwise be swallowed by the system bar.
export function bootSafeArea(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (!/Android/i.test(navigator.userAgent)) return;
  if (reportedBottomInset() > 0) return; // engine handles it — don't double up
  document.documentElement.style.setProperty('--android-nav-floor', `${ANDROID_NAV_BAR_PX}px`);
}
