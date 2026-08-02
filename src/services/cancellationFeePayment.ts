import { api } from './api';
import { payForRide } from './piSdk';
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
export async function payCancellationFee(rideId: string): Promise<{ txid: string }> {
  const payment = await api.createPayment(rideId, { type: 'fee' });
  logger.info('[fee] paying cancellation fee', { rideId, amount: payment.amount });
  return payForRide({
    paymentId: payment.paymentId,
    amount: payment.amount,
    memo: payment.memo,
    metadata: payment.metadata,
  });
}
