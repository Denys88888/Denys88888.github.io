export function hapticLight(): void {
  try { navigator.vibrate?.(10); } catch { /* unsupported */ }
}

export function hapticMedium(): void {
  try { navigator.vibrate?.(30); } catch { /* unsupported */ }
}

export function hapticHeavy(): void {
  try { navigator.vibrate?.(50); } catch { /* unsupported */ }
}

export function hapticSuccess(): void {
  try { navigator.vibrate?.([30, 50, 30]); } catch { /* unsupported */ }
}

export function hapticError(): void {
  try { navigator.vibrate?.([50, 30, 50, 30, 50]); } catch { /* unsupported */ }
}
