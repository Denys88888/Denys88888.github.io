import { describe, it, expect } from 'vitest';
import { payoutState, unpaidToDriver } from './payoutState';
import type { Ride } from '../types';

// Pins the honesty the earnings screen depends on: a ride only counts as money
// in the driver's wallet when a payout actually moved it there.
const ride = (over: Partial<Ride>): Ride =>
  ({
    status: 'completed',
    paymentStatus: 'completed',
    driverEarnings: 9,
    ...over,
  }) as Ride;

describe('payoutState', () => {
  it('is paid once the payout completed', () => {
    expect(payoutState(ride({ driverPayoutStatus: 'completed' }))).toBe('paid');
  });

  // Funds moved on chain; only Pi's bookkeeping failed. The driver has it.
  it('counts sent_unconfirmed as paid', () => {
    expect(payoutState(ride({ driverPayoutStatus: 'sent_unconfirmed' }))).toBe('paid');
  });

  it('is sending while a payout is under way', () => {
    expect(payoutState(ride({ driverPayoutStatus: 'pending' }))).toBe('sending');
  });

  // The two cases that used to read as money earned.
  it('is queued when the payout failed', () => {
    expect(payoutState(ride({ driverPayoutStatus: 'failed' }))).toBe('queued');
  });

  it('is queued when the app wallet cannot send', () => {
    expect(payoutState(ride({ driverPayoutStatus: 'no_wallet_configured' }))).toBe('queued');
  });

  it('is queued when no payout was ever attempted', () => {
    expect(payoutState(ride({}))).toBe('queued');
  });

  it('is awaiting the passenger until the fare is paid', () => {
    expect(payoutState(ride({ paymentStatus: 'held' }))).toBe('awaiting_passenger');
    expect(payoutState(ride({ paymentStatus: 'pending' }))).toBe('awaiting_passenger');
  });

  it('is not paid while a paid tip is still queued', () => {
    expect(
      payoutState(ride({ driverPayoutStatus: 'completed', tipAmount: 2, tipPayoutStatus: 'failed' }))
    ).toBe('queued');
  });

  it('follows the fee payout on a paid late cancellation', () => {
    const base = { status: 'cancelled' as const, cancellationFeeStatus: 'paid' as const, cancellationFeeDriverEarnings: 3 };
    expect(payoutState(ride({ ...base, feePayoutStatus: 'completed' }))).toBe('paid');
    expect(payoutState(ride({ ...base, feePayoutStatus: 'no_wallet_configured' }))).toBe('queued');
  });

  it('owes nothing on a free cancellation or an unfinished ride', () => {
    expect(payoutState(ride({ status: 'cancelled' }))).toBe('none');
    expect(payoutState(ride({ status: 'in_progress' }))).toBe('none');
  });
});

describe('unpaidToDriver', () => {
  it('is the fare while its payout has not moved', () => {
    expect(unpaidToDriver(ride({ driverPayoutStatus: 'failed' }))).toBe(9);
  });

  it('is nothing once it has', () => {
    expect(unpaidToDriver(ride({ driverPayoutStatus: 'completed' }))).toBe(0);
    expect(unpaidToDriver(ride({ driverPayoutStatus: 'sent_unconfirmed' }))).toBe(0);
  });

  it('adds a paid tip that has not reached the driver', () => {
    expect(
      unpaidToDriver(ride({ driverPayoutStatus: 'completed', tipAmount: 2, tipPayoutStatus: 'failed' }))
    ).toBe(2);
    expect(unpaidToDriver(ride({ tipAmount: 2 }))).toBe(11);
  });

  // Nobody is holding that money for the driver — it was never paid.
  it('leaves out a fare the passenger has not paid', () => {
    expect(unpaidToDriver(ride({ paymentStatus: 'held' }))).toBe(0);
  });

  it('counts a paid late-cancellation fee still owed', () => {
    expect(
      unpaidToDriver(
        ride({
          status: 'cancelled',
          cancellationFeeStatus: 'paid',
          cancellationFeeDriverEarnings: 3,
          feePayoutStatus: 'failed',
        })
      )
    ).toBe(3);
  });
});
