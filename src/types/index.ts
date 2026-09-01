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
  vehiclePhoto?: string;
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
  vehicleYear: number;
  seats?: number;
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
  // Only populated by GET /api/admin/users — count of resolved reports
  // against this user, mirroring the auto-block threshold check.
  strikeCount?: number;
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
  // Free-text note from the passenger for the driver (e.g. "large trunk
  // needed", "child seat required").
  note?: string;
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
  // A2U driver payout tracking (admin-only visibility/recovery).
  driverPayoutStatus?: 'pending' | 'completed' | 'failed';
  driverPayoutTxid?: string;
  driverPayoutError?: string;
  driverPayoutPiId?: string;
  tipPayoutStatus?: 'pending' | 'completed' | 'failed';
  tipPayoutTxid?: string;
  tipPayoutError?: string;
  tipPayoutPiId?: string;
  status: RideStatus;
  // When the driver marked arrived — starts the free-cancellation grace window.
  arrivedAt?: string;
  scheduledAt?: string;
  negotiable?: boolean;
  offeredFare?: number;
  offers?: FareOffer[];
  paymentId?: string;
  txid?: string;
  passengerRating?: number;
  driverRating?: number;
  // Optional detail behind driverRating; the overall score is still what moves
  // the driver's average.
  driverRatingBreakdown?: {
    cleanliness?: number;
    driving?: number;
    route?: number;
  };
  cancelledBy?: Role;
  cancellationReason?: string;
  cancellationFee?: number;
  // A late-cancellation fee is collected as its own Pi payment after the fact,
  // not taken out of the refunded fare — 'outstanding' until the passenger
  // approves it, and blocking their next booking while it is.
  cancellationFeeStatus?: 'outstanding' | 'paid';
  cancellationFeeDriverEarnings?: number;
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

export interface Report {
  id: string;
  rideId: string;
  reporterId: string;
  reportedId: string;
  reporterName?: string;
  reportedName?: string;
  reason: string;
  description?: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolvedBy?: string;
  createdAt: string;
}

// What a share link exposes. Deliberately not a subset of `Ride` — it is its
// own shape so that adding a field to Ride can never quietly widen what gets
// handed to whoever the link was forwarded to. No fare, no payment state, no
// passenger identity, no phone numbers on either side.
export interface SharedRide {
  status: RideStatus;
  finished: boolean;
  pickup: GeoPoint;
  destination: GeoPoint;
  distanceKm: number;
  estimatedDurationMin: number;
  driver: {
    name: string;
    rating: number;
    brand?: string;
    model?: string;
    color?: string;
    number?: string;
  } | null;
  driverLocation: GeoPoint | null;
  updatedAt: string;
}
