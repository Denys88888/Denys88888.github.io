import { PI_SANDBOX } from '../utils/constants';
import { api } from './api';
import { logger } from '../utils/logger';
import type { PiAuthResult, PiIncompletePayment } from '../types/pi';

// Wrapper around the Pi Browser SDK. Outside the Pi Browser `window.Pi` is
// undefined, so every entry point guards for it and surfaces a clear error.

let initialized = false;

// Whether Pi.authenticate has run in THIS page session.
//
// The SDK keeps the consented scopes on its own instance and refuses outright —
// `Cannot create a payment without "payments" scope` — if that instance never
// authenticated. The instance is rebuilt on every page load, while our JWT is
// restored from storage without re-authenticating, so a returning passenger
// could not pay for anything: fare, tip or cancellation fee alike. Logging out
// and back in was the only cure, and nothing on screen said so.
let piSessionReady = false;
// The boot-time arming is still in flight while the screen is already usable, so
// a fast tap would otherwise start a second authenticate — two consent dialogs
// racing, and whichever loses leaves the payment behind it hanging.
let piSessionArming: Promise<void> | null = null;

export function isPiAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.Pi;
}

export function initPi(): void {
  logger.info('[Pi] SDK available:', isPiAvailable(), '| sandbox:', PI_SANDBOX);
  if (initialized || !isPiAvailable()) return;
  // Pi.init was already called early in main.tsx; calling it again is safe —
  // the SDK ignores duplicate inits — but we still set the flag to avoid
  // log spam and redundant calls on every authenticate.
  window.Pi!.init({ version: '2.0', sandbox: PI_SANDBOX });
  initialized = true;
  logger.info('[Pi] init called');
}

// Open a native Pi Browser share sheet. Falls back to navigator.share or a
// silent no-op if neither is available (desktop / non-Pi Browser context).
export function piShare(title: string, message: string): void {
  if (isPiAvailable() && typeof window.Pi!.openShareDialog === 'function') {
    window.Pi!.openShareDialog(title, message);
    return;
  }
  if ('share' in navigator) {
    navigator.share({ title, text: message, url: window.location.origin }).catch((err: unknown) => {
      if ((err as { name?: string }).name !== 'AbortError') {
        logger.warn('[Pi] navigator.share failed', err);
      }
    });
  }
}

// A payment left open by an interrupted session — app killed, connection
// dropped, Pi Browser backgrounded mid-flow. Until it is settled the SDK
// refuses every new payment, so this has to succeed before anything else can.
// Our own backend payment id travels in `metadata` (set in createPayment), and
// if Pi already has a txid, submitting completion is exactly what a normal
// successful payment does.
export async function resolveIncompletePayment(payment: PiIncompletePayment): Promise<void> {
  logger.warn('[Pi] incomplete payment found', payment);
  const ourPaymentId = payment.metadata?.paymentId;
  const txid = payment.transaction?.txid;
  if (ourPaymentId && txid) {
    // Has a chain txid → finish it, same as a normal completion.
    await api.completePayment(ourPaymentId, payment.identifier, txid);
    logger.info('[Pi] recovered incomplete payment', { ourPaymentId });
  } else if (ourPaymentId) {
    // No txid → nothing to complete (never hit the chain). Cancel it so the
    // Pi SDK stops blocking new createPayment calls on this stuck payment.
    await api.cancelPayment(ourPaymentId, payment.identifier);
    logger.info('[Pi] cancelled stuck incomplete payment', { ourPaymentId });
  } else {
    // No paymentId in metadata — old payment, test transaction, or metadata
    // corruption. Cancel via piPaymentId directly so the Pi SDK is unblocked.
    await api.cancelUnknownPiPayment(payment.identifier);
    logger.info('[Pi] cancelled unknown incomplete payment', { piId: payment.identifier });
  }
}

// Arm the SDK for payments on a session restored from storage.
//
// Call it on boot, not from a pay button: authenticate is a network round-trip
// and may raise a consent dialog, and doing that inside a click handler is what
// costs the click its user activation (see payForRide).
export function ensurePiPayments(): Promise<void> {
  if (piSessionReady || !isPiAvailable()) return Promise.resolve();
  piSessionArming ??= authenticateWithPi().then(
    () => undefined,
    (err) => {
      // Let the next attempt try again rather than caching the failure.
      piSessionArming = null;
      throw err;
    }
  );
  return piSessionArming;
}

// Authenticate the current Pi user. Returns the accessToken + basic profile.
export async function authenticateWithPi(): Promise<PiAuthResult> {
  if (!isPiAvailable()) {
    throw new Error('Pi SDK unavailable — please open this app in the Pi Browser.');
  }
  initPi();
  const onIncompletePaymentFound = (payment: PiIncompletePayment): void => {
    void resolveIncompletePayment(payment).catch((err) =>
      logger.error('[Pi] failed to resolve incomplete payment', err)
    );
  };
  logger.info('[Pi] calling authenticate…');
  // 'wallet_address' is required for the server to look up this user's Stellar
  // public key when paying them out (App-to-User) — without it Pi's payment
  // API rejects A2U payment creation with error "missing_scope". Drivers who
  // logged in before this scope was added must log out and back in once to
  // grant it (Pi will prompt for the new permission on next authenticate).
  const result = await window.Pi!.authenticate(
    ['username', 'payments', 'wallet_address'],
    onIncompletePaymentFound
  );
  piSessionReady = true;
  return result;
}

export interface PreparedPiPayment {
  paymentId: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}

// Run the full Pi payment lifecycle for a ride, wiring the SDK callbacks to our
// server endpoints (approve → complete). Resolves with the txid on success.
//
// Callers must reach this from a click handler with no awaited network call in
// between — the payment record has to be prepared beforehand. WebKit and
// Chromium both expire "user activation" a few seconds after the tap, and a
// cold Render instance easily outlasts that; the sheet then never opens and no
// callback ever fires, so the promise hangs and the button spins forever.
export function payForRide(params: PreparedPiPayment): Promise<{ txid: string }> {
  if (!isPiAvailable()) {
    return Promise.reject(new Error('Pi SDK unavailable — open in the Pi Browser.'));
  }
  // Normally already armed on boot, so this costs a microtask, not a request.
  if (!piSessionReady) return ensurePiPayments().then(() => startPiPayment(params, true));
  return startPiPayment(params, true);
}

function startPiPayment(params: PreparedPiPayment, mayRecover: boolean): Promise<{ txid: string }> {
  return new Promise((resolve, reject) => {
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
        onError: (error, pending) => {
          // The SDK reports "a pending payment needs to be handled" here and
          // hands over the payment itself. It then calls its own
          // onIncompletePaymentFound — which only authenticate() ever arms, so
          // on a restored session that is undefined and the leftover would
          // block every future payment forever. Settle it and try once more.
          if (mayRecover && pending?.identifier) {
            resolveIncompletePayment(pending)
              .then(() => startPiPayment(params, false))
              .then(resolve, reject);
            return;
          }
          reject(error);
        },
      }
    );
  });
}
