import type { Ride } from '../types';

// Where a driver's money for one ride actually is. The earnings screen used to
// know only what a ride was worth, so it showed every completed ride as money
// earned — including rides the passenger never paid for, and rides where the
// passenger paid but the payout to the driver failed. A driver could read a
// total that was simply not in their wallet.
//
//   paid                — it left the app wallet for theirs
//   sending             — a payout is under way right now
//   queued              — the passenger paid, the driver has not been paid yet
//                         (payout failed, or the app wallet cannot send); the
//                         money is held and an operator can re-send it
//   awaiting_passenger  — the ride finished but the passenger has not paid
//   none                — nothing is owed to the driver for this ride
export type PayoutState = 'paid' | 'sending' | 'queued' | 'awaiting_passenger' | 'none';

type PayoutStatus = Ride['driverPayoutStatus'];

// 'sent_unconfirmed' is money that moved on chain while Pi's bookkeeping call
// failed afterwards. To the driver that is paid: it is in their wallet.
function moved(status: PayoutStatus): boolean {
  return status === 'completed' || status === 'sent_unconfirmed';
}

function partState(status: PayoutStatus): 'paid' | 'sending' | 'queued' {
  if (moved(status)) return 'paid';
  if (status === 'pending') return 'sending';
  // failed, no_wallet_configured, or never attempted: not in their wallet.
  return 'queued';
}

type SettledRide = Pick<
  Ride,
  | 'status'
  | 'paymentStatus'
  | 'driverEarnings'
  | 'driverPayoutStatus'
  | 'tipAmount'
  | 'tipPayoutStatus'
  | 'cancellationFeeStatus'
  | 'cancellationFeeDriverEarnings'
  | 'feePayoutStatus'
>;

export function payoutState(ride: SettledRide): PayoutState {
  if (ride.status === 'cancelled') {
    if (ride.cancellationFeeStatus !== 'paid' || !((ride.cancellationFeeDriverEarnings ?? 0) > 0)) {
      return 'none';
    }
    return partState(ride.feePayoutStatus);
  }
  if (ride.status !== 'completed') return 'none';
  if (ride.paymentStatus !== 'completed') return 'awaiting_passenger';

  const parts = [partState(ride.driverPayoutStatus)];
  // A tip is its own payment and its own payout; tipAmount is only set once the
  // passenger's tip has actually been paid.
  if ((ride.tipAmount ?? 0) > 0) parts.push(partState(ride.tipPayoutStatus));
  if (parts.includes('queued')) return 'queued';
  if (parts.includes('sending')) return 'sending';
  return 'paid';
}

// Money a passenger has paid that has not reached the driver yet. Deliberately
// excludes rides the passenger has not paid for: that is not money anyone is
// holding for the driver, and folding it in would inflate the figure.
export function unpaidToDriver(ride: SettledRide): number {
  if (ride.status === 'cancelled') {
    return ride.cancellationFeeStatus === 'paid' && !moved(ride.feePayoutStatus)
      ? ride.cancellationFeeDriverEarnings ?? 0
      : 0;
  }
  if (ride.status !== 'completed' || ride.paymentStatus !== 'completed') return 0;
  let owed = 0;
  if (!moved(ride.driverPayoutStatus)) owed += ride.driverEarnings ?? 0;
  if ((ride.tipAmount ?? 0) > 0 && !moved(ride.tipPayoutStatus)) owed += ride.tipAmount ?? 0;
  return owed;
}
