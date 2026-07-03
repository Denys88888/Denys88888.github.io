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

export interface PiSDK {
  init(config: { version: string; sandbox?: boolean }): void;
  authenticate(
    scopes: string[],
    onIncompletePaymentFound: (payment: unknown) => void
  ): Promise<PiAuthResult>;
  createPayment(data: PiPaymentData, callbacks: PiPaymentCallbacks): void;
}

declare global {
  interface Window {
    Pi?: PiSDK;
  }
}

export {};
