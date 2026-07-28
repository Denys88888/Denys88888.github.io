import { PI_SANDBOX } from '../utils/constants';
import { api } from './api';
import { logger } from '../utils/logger';
import type { PiAuthResult, PiIncompletePayment } from '../types/pi';

// Wrapper around the Pi Browser SDK. Outside the Pi Browser `window.Pi` is
// undefined, so every entry point guards for it and surfaces a clear error.

let initialized = false;

export function isPiAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.Pi;
}

export function initPi(): void {
  logger.info('[Pi] SDK available:', isPiAvailable(), '| sandbox:', PI_SANDBOX);
  if (initialized || !isPiAvailable()) return;
  window.Pi!.init({ version: '2.0', sandbox: PI_SANDBOX });
  initialized = true;
  logger.info('[Pi] init called');
}

// Authenticate the current Pi user. Returns the accessToken + basic profile.
export async function authenticateWithPi(): Promise<PiAuthResult> {
  if (!isPiAvailable()) {
    throw new Error('Pi SDK unavailable — please open this app in the Pi Browser.');
  }
  initPi();
  const onIncompletePaymentFound = (payment: PiIncompletePayment): void => {
    // A previous payment (fare or tip) was left open by an interrupted
    // session — app killed, connection dropped, Pi Browser backgrounded
    // mid-flow. Finish it now so it doesn't sit stuck: our own backend
    // payment id travels in `metadata` (we set it in createPayment), and if
    // Pi already has a txid for it, submitting completion is exactly what a
    // normal successful payment does.
    logger.warn('[Pi] incomplete payment found', payment);
    const ourPaymentId = payment.metadata?.paymentId as string | undefined;
    const txid = payment.transaction?.txid;
    if (ourPaymentId && txid) {
      // Has a chain txid → finish it, same as a normal completion.
      api
        .completePayment(ourPaymentId, payment.identifier, txid)
        .then(() => logger.info('[Pi] recovered incomplete payment', { ourPaymentId }))
        .catch((err) => logger.error('[Pi] failed to recover incomplete payment', err));
    } else if (ourPaymentId) {
      // No txid → nothing to complete (never hit the chain). Cancel it so the
      // Pi SDK stops blocking new createPayment calls on this stuck payment.
      api
        .cancelPayment(ourPaymentId, payment.identifier)
        .then(() => logger.info('[Pi] cancelled stuck incomplete payment', { ourPaymentId }))
        .catch((err) => logger.error('[Pi] failed to cancel incomplete payment', err));
    } else {
      // No paymentId in metadata — old payment, test transaction, or metadata
      // corruption. Cancel via piPaymentId directly so the Pi SDK is unblocked.
      api
        .cancelUnknownPiPayment(payment.identifier)
        .then(() => logger.info('[Pi] cancelled unknown incomplete payment', { piId: payment.identifier }))
        .catch((err) => logger.error('[Pi] failed to cancel unknown incomplete payment', err));
    }
  };
  logger.info('[Pi] calling authenticate…');
  // 'wallet_address' is required for the server to look up this user's Stellar
  // public key when paying them out (App-to-User) — without it Pi's payment
  // API rejects A2U payment creation with error "missing_scope". Drivers who
  // logged in before this scope was added must log out and back in once to
  // grant it (Pi will prompt for the new permission on next authenticate).
  return window.Pi!.authenticate(['username', 'payments', 'wallet_address'], onIncompletePaymentFound);
}

// Run the full Pi payment lifecycle for a ride, wiring the SDK callbacks to our
// server endpoints (approve → complete). Resolves with the txid on success.
export function payForRide(params: {
  paymentId: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}): Promise<{ txid: string }> {
  return new Promise((resolve, reject) => {
    if (!isPiAvailable()) {
      reject(new Error('Pi SDK unavailable — open in the Pi Browser.'));
      return;
    }
    initPi();
    window.Pi!.createPayment(
      { amount: params.amount, memo: params.memo, metadata: params.metadata },
      {
        onReadyForServerApproval: (piPaymentId) => {
          api.approvePayment(params.paymentId, piPaymentId).catch((e) => reject(e));
        },
        onReadyForServerCompletion: (piPaymentId, txid) => {
          api
            .completePayment(params.paymentId, piPaymentId, txid)
            .then(() => resolve({ txid }))
            .catch((e) => reject(e));
        },
        onCancel: () => reject(new Error('Payment cancelled')),
        onError: (error) => reject(error),
      }
    );
  });
}
