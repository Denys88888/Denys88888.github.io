import axios, { type AxiosInstance } from 'axios';
import { API_URL } from '../utils/constants';
import { storage } from './storageService';
import { useAppStore } from '../store/useAppStore';
import { wsService } from './wsService';
import type {
  User,
  Ride,
  RideStatus,
  GeoPoint,
  VehicleType,
  DriverSummary,
  ChatMessage,
  HealthInfo,
} from '../types';

const client: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// Attach the JWT to every request.
client.interceptors.request.use((config) => {
  const token = storage.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 with an active session the token is stale/expired: fully log out
// (store + storage + socket) so the app routes back to login instead of
// silently failing every request until a manual reload.
client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      storage.clearAuth();
      if (useAppStore.getState().token) {
        wsService.disconnect();
        useAppStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

export interface PaginatedRides {
  rides: Ride[];
  total: number;
  page: number;
  limit: number;
}

export const api = {
  // ── Health ──
  health: () => client.get<HealthInfo>('/api/health').then((r) => r.data),

  // ── Auth ──
  piAuth: (accessToken: string) =>
    client
      .post<{ token: string; user: User }>('/api/auth/pi', { accessToken })
      .then((r) => r.data),

  // ── Profile ──
  getMe: () => client.get<User>('/api/users/me').then((r) => r.data),
  updateProfile: (patch: Partial<Pick<User, 'name' | 'phone' | 'avatar' | 'preferredLanguage' | 'preferredTheme'>>) =>
    client.patch<User>('/api/users/me', patch).then((r) => r.data),

  // ── Rides ──
  createRide: (payload: {
    pickup: GeoPoint;
    destination: GeoPoint;
    vehicleType: VehicleType;
    stops?: GeoPoint[];
    scheduledAt?: string;
    negotiable?: boolean;
    offeredFare?: number;
  }) => client.post<Ride>('/api/rides', payload).then((r) => r.data),
  submitOffer: (rideId: string, amount: number, etaMin?: number) =>
    client.post<Ride>(`/api/rides/${rideId}/offers`, { amount, etaMin }).then((r) => r.data),
  acceptOffer: (rideId: string, driverId: string) =>
    client.post<Ride>(`/api/rides/${rideId}/offers/accept`, { driverId }).then((r) => r.data),
  listRides: (params?: { status?: RideStatus; page?: number; limit?: number }) =>
    client.get<PaginatedRides>('/api/rides', { params }).then((r) => r.data),
  getRide: (id: string) => client.get<Ride>(`/api/rides/${id}`).then((r) => r.data),
  updateRide: (id: string, patch: Partial<Ride>) =>
    client.patch<Ride>(`/api/rides/${id}`, patch).then((r) => r.data),
  cancelRide: (id: string, reason: string) =>
    client.post<Ride>(`/api/rides/${id}/cancel`, { reason }).then((r) => r.data),
  shareRide: (id: string) =>
    client.post<{ shareToken: string }>(`/api/rides/${id}/share`).then((r) => r.data),

  // ── Drivers ──
  registerDriver: (payload: {
    vehicleType: VehicleType;
    brand: string;
    model: string;
    color: string;
    number: string;
    vehiclePhoto?: string;
    licensePhoto?: string;
  }) => client.post('/api/drivers/register', payload).then((r) => r.data),
  updateDriverLocation: (lat: number, lng: number) =>
    client.post('/api/drivers/location', { lat, lng }).then((r) => r.data),
  nearbyDrivers: (params: {
    lat: number;
    lng: number;
    radius?: number;
    vehicleType?: VehicleType;
  }) =>
    client
      .get<{ drivers: DriverSummary[] }>('/api/drivers/nearby', { params })
      .then((r) => r.data.drivers),
  goOnline: (lat?: number, lng?: number) =>
    client.post('/api/drivers/online', { lat, lng }).then((r) => r.data),
  goOffline: () => client.post('/api/drivers/offline').then((r) => r.data),

  // ── Messages ──
  chatHistory: (chatId: string) =>
    client
      .get<{ chatId: string; messages: ChatMessage[] }>('/api/messages', {
        params: { chatId },
      })
      .then((r) => r.data.messages),

  // ── Payments ──
  createPayment: (rideId: string) =>
    client
      .post<{
        paymentId: string;
        amount: number;
        memo: string;
        metadata: Record<string, unknown>;
      }>('/api/payments', { rideId })
      .then((r) => r.data),
  approvePayment: (paymentId: string, piPaymentId: string) =>
    client.post(`/api/payments/${paymentId}/approve`, { piPaymentId }).then((r) => r.data),
  completePayment: (paymentId: string, piPaymentId: string, txid: string) =>
    client
      .post(`/api/payments/${paymentId}/complete`, { piPaymentId, txid })
      .then((r) => r.data),

  // ── Reports ──
  createReport: (rideId: string, reportedId: string, reason: string, description?: string) =>
    client
      .post('/api/reports', { rideId, reportedId, reason, description })
      .then((r) => r.data),

  // ── Push ──
  savePushToken: (token: string, platform = 'web') =>
    client.post('/api/push-token', { token, platform }).then((r) => r.data),

  // ── Admin ──
  adminStats: () => client.get('/api/admin/stats').then((r) => r.data),
  adminUsers: (params?: { role?: string; search?: string }) =>
    client.get<{ users: User[] }>('/api/admin/users', { params }).then((r) => r.data.users),
  adminBlockUser: (id: string, isBlocked: boolean, blockReason?: string) =>
    client.patch(`/api/admin/users/${id}`, { isBlocked, blockReason }).then((r) => r.data),
  adminRides: (status?: RideStatus) =>
    client
      .get<{ rides: Ride[] }>('/api/admin/rides', { params: { status } })
      .then((r) => r.data.rides),
  adminSettings: () => client.get('/api/admin/settings').then((r) => r.data),
  adminUpdateSettings: (patch: Record<string, unknown>) =>
    client.patch('/api/admin/settings', patch).then((r) => r.data),
  adminPendingDrivers: () =>
    client.get<{ drivers: User[] }>('/api/admin/drivers/pending').then((r) => r.data.drivers),
  adminVerifyDriver: (id: string, approve: boolean) =>
    client.post(`/api/admin/drivers/${id}/verify`, { approve }).then((r) => r.data),
};
