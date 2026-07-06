import i18n from '../i18n';

// All formatting goes through Intl with the active UI language, so dates,
// relative times and units localize automatically for every supported locale.
const lang = () => i18n.language || 'en';

// Pi amount with the π symbol, 2 decimals.
export function formatPi(amount: number): string {
  return `${amount.toFixed(2)} π`;
}

function unit(value: number, u: 'kilometer' | 'meter' | 'minute' | 'hour', digits = 0): string {
  try {
    return new Intl.NumberFormat(lang(), {
      style: 'unit',
      unit: u,
      unitDisplay: 'short',
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value} ${u}`;
  }
}

export function formatDistance(km: number): string {
  return km < 1 ? unit(Math.round(km * 1000), 'meter') : unit(km, 'kilometer', 1);
}

export function formatDuration(min: number): string {
  if (min < 60) return unit(Math.round(min), 'minute');
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${unit(h, 'hour')} ${unit(m, 'minute')}` : unit(h, 'hour');
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const steps: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [86400 * 30, 'day'],
    [86400 * 365, 'month'],
    [Infinity, 'year'],
  ];
  let value = diffSec;
  let unitName: Intl.RelativeTimeFormatUnit = 'second';
  let prev = 1;
  for (const [limit, u] of steps) {
    if (abs < limit) {
      value = Math.round(diffSec / prev);
      unitName = u;
      break;
    }
    prev = limit;
  }
  try {
    return new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' }).format(value, unitName);
  } catch {
    return '';
  }
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang(), { hour: '2-digit', minute: '2-digit' }).format(d);
}

// Mask a phone number for privacy (+1 555 123 4567 → ••• 4567).
export function maskPhone(phone?: string): string {
  if (!phone) return '••••';
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 4 ? '••••' : `••• ${digits.slice(-4)}`;
}
