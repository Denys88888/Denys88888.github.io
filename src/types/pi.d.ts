// Minimal typings for the Pi Network browser SDK (window.Pi), loaded from
// https://sdk.minepi.com/pi-sdk.js. Only the surface we use is declared.

export interface PiAuthResult {
  accessToken: string;
  user: { uid: string; username: string };
}

export interface PiPaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}

export interface PiPaymentCallbacks {
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment?: unknown) => void;
}

// The DTO the SDK hands back for a payment left over from a previous session
// (app killed / connection dropped mid-flow). `identifier` is Pi's own
// payment id; `metadata` is whatever we passed to createPayment, which is how
// we recover our own backend payment id for it.
export interface PiIncompletePayment {
  identifier: string;
  metadata?: { paymentId?: string; rideId?: string; type?: string };
  transaction?: { txid: string; verified: boolean } | null;
}

export interface PiSDK {
  init(config: { version: string; sandbox?: boolean }): void;
  authenticate(
    scopes: string[],
    onIncompletePaymentFound: (payment: PiIncompletePayment) => void
  ): Promise<PiAuthResult>;
  createPayment(data: PiPaymentData, callbacks: PiPaymentCallbacks): void;
}

declare global {
  interface Window {
    Pi?: PiSDK;
  }
}

export {};
