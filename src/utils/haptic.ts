// Thin wrapper over the Vibration API for tactile feedback on key moments.
// navigator.vibrate is a no-op (or absent) on iOS Safari and desktops, and some
// browsers throw when a page tries to vibrate outside a user gesture, so every
// call is optional-chained and swallowed. Patterns are deliberately short — a
// ride app shouldn't buzz like a game.
function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported here, or not allowed from this context */
  }
}

export const haptic = {
  light: () => buzz(10),
  medium: () => buzz(20),
  heavy: () => buzz([30, 50, 30]),
  success: () => buzz([10, 30, 10]),
  error: () => buzz([50, 100, 50]),
};
