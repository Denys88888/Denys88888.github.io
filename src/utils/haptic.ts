// Thin wrapper over the Vibration API for tactile feedback on key moments.
// navigator.vibrate is a no-op (or absent) on iOS Safari and desktops, so every
// call is optional-chained and safe to fire anywhere. Patterns are deliberately
// short — a ride app shouldn't buzz like a game.
export const haptic = {
  light: () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(20),
  heavy: () => navigator.vibrate?.([30, 50, 30]),
  success: () => navigator.vibrate?.([10, 30, 10]),
  error: () => navigator.vibrate?.([50, 100, 50]),
};
