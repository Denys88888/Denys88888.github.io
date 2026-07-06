import { PI_SANDBOX } from '../utils/constants';
import { api } from './api';
import { logger } from '../utils/logger';
import type { PiAuthResult } from '../types/pi';

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
  const onIncompletePaymentFound = (payment: unknown): void => {
    // A previous payment was left open; surface for diagnostics.
    logger.warn('[Pi] incomplete payment found', payment);
  };
  logger.info('[Pi] calling authenticate…');
  return window.Pi!.authenticate(['username', 'payments'], onIncompletePaymentFound);
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
