import { Car, Crown, CarFront, Bus, type LucideIcon } from 'lucide-react';
import type { VehicleType } from '../types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:10000';
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:10000';
export const PI_SANDBOX = import.meta.env.VITE_PI_SANDBOX !== 'false';

export const TOKEN_KEY = 'taxipro_token';
export const USER_KEY = 'taxipro_user';
export const THEME_KEY = 'taxipro_theme';
export const LANG_KEY = 'taxipro_lang';
export const UNREAD_KEY = 'taxipro_unread';

export interface VehicleOption {
  type: VehicleType;
  labelKey: string;
  icon: LucideIcon;
  basePrice: number;
}

// Display metadata for the vehicle selector. Prices are indicative; the server
// computes the authoritative fare.
export const VEHICLE_OPTIONS: VehicleOption[] = [
  { type: 'economy', labelKey: 'vehicle.economy', icon: Car, basePrice: 1.0 },
  // A cargo truck read as "comfort" only by accident of icon naming; the tiers
  // now go plain car → nicer car → premium marker → minibus.
  { type: 'comfort', labelKey: 'vehicle.comfort', icon: CarFront, basePrice: 1.5 },
  { type: 'business', labelKey: 'vehicle.business', icon: Crown, basePrice: 2.5 },
  { type: 'xl', labelKey: 'vehicle.xl', icon: Bus, basePrice: 2.0 },
];

// Minimum requirements to register for each vehicle class — mirrors the
// server's VEHICLE_CLASS_REQUIREMENTS (taxi-pro-server/src/config/constants.ts).
// Client-side check is UX only (fast feedback before submit); the server
// enforces the real gate.
const CURRENT_YEAR = new Date().getFullYear();
export const VEHICLE_CLASS_REQUIREMENTS: Record<VehicleType, { minYear: number; minSeats?: number }> = {
  economy: { minYear: 2000 },
  comfort: { minYear: CURRENT_YEAR - 10 },
  xl: { minYear: CURRENT_YEAR - 12, minSeats: 6 },
  business: { minYear: CURRENT_YEAR - 6 },
};

// Language codes + display labels (native names). Flags removed per design.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'pl', label: 'Polski' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Indonesia' },
  { code: 'th', label: 'ไทย' },
  { code: 'uk', label: 'Українська' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'sv', label: 'Svenska' },
] as const;

export const RTL_LANGUAGES = ['ar'];

export const QUICK_TEMPLATE_KEYS = [
  'templates.0',
  'templates.1',
  'templates.2',
  'templates.3',
  'templates.4',
];

// Mirrors LATE_CANCELLATION_FEE_PERCENT in taxi-pro-server/src/config/constants.ts.
// Used only to show the rider what they will be charged before they confirm —
// the server remains the authority on the amount actually taken.
export const LATE_CANCELLATION_FEE_PERCENT = 50;
