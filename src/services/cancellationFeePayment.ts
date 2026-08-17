import { api } from './api';
import { payForRide, type PreparedPiPayment } from './piSdk';
import { logger } from '../utils/logger';

// Settling a late-cancellation fee. The fare is escrowed as one Pi payment for
// the full amount and Pi has no partial capture, so the hold goes back whole
// when the ride is cancelled and the fee is collected as its own payment the
// passenger approves afterwards.
//
// Two screens ask for this — the cancel dialog, right after the ride is called
// off, and the home screen, where an unpaid fee blocks the next booking — so
// the flow lives here rather than being written twice and drifting apart.
//
// The amount is not a parameter. The server prices the fee from the ride it
// already recorded and ignores anything the client sends, so passing one here
// would only invite the two to disagree on screen.
//
// Split in two on purpose. Asking the server for the payment record is a
// network call, and doing it inside the Pay handler is what broke this: by the
// time Pi.createPayment ran, the tap's user activation had expired, the wallet
// sheet silently never opened, and since no callback fires either the button
// just span forever. So the record is fetched as soon as the debt is known and
// the tap itself goes straight to the SDK.
export async function prepareCancellationFee(rideId: string): Promise<PreparedPiPayment> {
  const payment = await api.createPayment(rideId, { type: 'fee' });
  logger.info('[fee] prepared cancellation fee', { rideId, amount: payment.amount });
  return {
    paymentId: payment.paymentId,
    amount: payment.amount,
    memo: payment.memo,
    metadata: payment.metadata,
  };
}

export function payCancellationFee(prepared: PreparedPiPayment): Promise<{ txid: string }> {
  return payForRide(prepared);
}
