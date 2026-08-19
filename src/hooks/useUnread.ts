import { useAppStore } from '../store/useAppStore';
import { chatIdForRide } from '../utils/helpers';

// Unread messages for one ride's chat. Both home screens and the ride screen
// need the same number: a driver watching the road and a rider whose screen was
// off both miss the four-second toast, and the badge is the only thing left
// telling them a message arrived.
export function useUnreadForRide(rideId: string | undefined | null): number {
  return useAppStore((s) => (rideId ? (s.unreadByChat[chatIdForRide(rideId)] ?? 0) : 0));
}
