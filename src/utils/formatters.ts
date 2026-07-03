import { format, formatDistanceToNow } from 'date-fns';

// Pi amount with the π symbol, 2 decimals.
export function formatPi(amount: number): string {
  return `${amount.toFixed(2)} π`;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDate(iso: string): string {
  try {
    return format(new Date(iso), 'dd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

export function formatTime(iso: string): string {
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return '';
  }
}

// Mask a phone number for privacy (+1 555 123 4567 → +1 •••• 4567).
export function maskPhone(phone?: string): string {
  if (!phone) return '••••';
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 4 ? '••••' : `••• ${digits.slice(-4)}`;
}
