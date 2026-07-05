// Domain types shared across the frontend (mirrors the backend schema).

export type Role = 'passenger' | 'driver' | 'admin';
export type VehicleType = 'economy' | 'comfort' | 'business' | 'xl';
export type Theme = 'light' | 'dark' | 'auto';

// Escrow lifecycle of the ride's Pi payment:
// pending (unpaid) → held (approved/reserved) → completed | refunded.
export type RidePaymentStatus = 'pending' | 'held' | 'completed' | 'refunded';

export type DriverApplicationStatus = 'pending' | 'approved' | 'rejected';

export type RideStatus =
  | 'scheduled'
  | 'searching'
  | 'assigned'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface FareOffer {
  driverId: string;
  driverName: string;
  driverRating: number;
  vehicleType?: VehicleType;
  amount: number;
  etaMin?: number;
  createdAt: string;
}

export interface RideParty {
  uid: string;
  name: string;
  phone?: string;
  rating: number;
  avatar?: string;
  vehicleType?: VehicleType;
  brand?: string;
  model?: string;
  color?: string;
  number?: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  address?: string;
}

// Quick-access saved place ("Home", "Work", "Parents").
export interface SavedAddress {
  label: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface SurgeInfo {
  multiplier: number;
  reason: 'normal' | 'peak' | 'weather' | 'night' | 'holiday';
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

export interface DriverInfo {
  vehicleType: VehicleType;
  applicationStatus?: DriverApplicationStatus;
  brand: string;
  model: string;
  color: string;
  number: string;
  vehiclePhoto?: string;
  licensePhoto?: string;
  licenseVerified: boolean;
  isOnline: boolean;
  lastLocation?: GeoPoint;
}

export interface User {
  uid: string;
  role: Role;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  rating: number;
  ratingCount: number;
  isBlocked: boolean;
  fcmToken?: string;
  preferredLanguage?: string;
  preferredTheme?: Theme;
  savedAddresses?: SavedAddress[];
  driverInfo?: DriverInfo;
  createdAt: string;
  updatedAt: string;
}

export interface Ride {
  id: string;
  passengerId: string;
  driverId?: string;
  pickup: GeoPoint;
  destination: GeoPoint;
  stops?: GeoPoint[];
  vehicleType: VehicleType;
  distanceKm: number;
  estimatedDurationMin: number;
  fare: number;
  surgeMultiplier?: number;
  platformFeePercent: number;
  platformFee: number;
  driverEarnings: number;
  tipAmount?: number;
  tipTxid?: string;
  paymentStatus?: RidePaymentStatus;
  status: RideStatus;
  scheduledAt?: string;
  negotiable?: boolean;
  offeredFare?: number;
  offers?: FareOffer[];
  paymentId?: string;
  txid?: string;
  passengerRating?: number;
  driverRating?: number;
  cancelledBy?: Role;
  cancellationReason?: string;
  cancellationFee?: number;
  shareToken?: string;
  // Enriched by GET /api/rides/:id once assigned (contact cards).
  driver?: RideParty | null;
  passenger?: RideParty | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderRole: Role;
  text: string;
  isTemplate: boolean;
  timestamp: string;
}

export interface DriverSummary {
  uid: string;
  name: string;
  rating: number;
  vehicleType?: VehicleType;
  location?: GeoPoint;
  distanceKm?: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface HealthInfo {
  status: string;
  sandbox: boolean;
  firebase: boolean;
  store?: 'firestore' | 'sqlite' | 'memory';
}
