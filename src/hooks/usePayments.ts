import { useState, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { isWalletSilent, payForRide } from '../services/piSdk';
import { useToast } from './useToast';
import { apiErrorKey } from '../utils/apiError';

export interface PreparedPayment {
  paymentId: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}

export function usePayments() {
  const [processing, setProcessing] = useState(false);
  const { addToast } = useToast();
  const { t } = useTranslation();

  const errorMessage = (err: unknown): string => {
    // A wallet that never answered has no server-side reason to surface, and its
    // internal message is English-only — say the one thing that helps instead.
    if (isWalletSilent(err)) return t('ride.walletSilent');
    // Surface the server's actual reason (e.g. "Payment already completed"
    // after a stale-hold recovery) instead of axios's generic
    // "Request failed with status code 409".
    const serverMessage = isAxiosError(err)
      ? (err.response?.data as { error?: string } | undefined)?.error
      : undefined;
    if (serverMessage) return serverMessage;
    // The server gave no reason — quite possibly because it never answered.
    // "Payment failed" reads like a broken wallet; the driver checks their
    // balance, re-links Pi, and never learns the server was simply down.
    if (isAxiosError(err)) return t(apiErrorKey(err));
    return err instanceof Error && err.message ? err.message : t('ride.paymentFailed');
  };

  // Why the last preparePayment failed, if it did. The retry loop below wants
  // silence — it is polling a server that may still be waking — but the pay
  // button needs to be able to say which thing went wrong when the driver
  // finally taps it and there is still nothing prepared.
  const lastPrepareError = useRef<unknown>(null);

  // Ask our backend for the payment record ahead of time (amount/memo/
  // metadata) so the actual pay button click can call window.Pi.createPayment
  // with zero awaits in between. iOS/WebKit (the Pi Browser included) treats
  // "user activation" as expiring across an awaited network call — if we
  // fetch this data inside the click handler, by the time createPayment runs
  // the SDK's payment sheet silently fails to open. Preparing it in advance
  // (as soon as the ride becomes payable) keeps the click handler synchronous.
  const preparePayment = useCallback(async (rideId: string): Promise<PreparedPayment | null> => {
    try {
      lastPrepareError.current = null;
      return await api.createPayment(rideId);
    } catch (err) {
      lastPrepareError.current = err;
      console.error('[payments] preparePayment:', err);
      return null;
    }
  }, []);

  // For the pay button to use when preparePayment came back empty.
  const prepareFailureMessage = useCallback(
    (): string => errorMessage(lastPrepareError.current),
    // errorMessage closes over `t`, which react-i18next keeps stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Call from the pay button's onClick with an already-prepared payment —
  // no awaits before this reaches payForRide, so the SDK's payment sheet
  // still has the click's user-activation context.
  const payRide = useCallback(
    async (payment: PreparedPayment): Promise<string | null> => {
      setProcessing(true);
      try {
        const { txid } = await payForRide({
          paymentId: payment.paymentId,
          amount: payment.amount,
          memo: payment.memo,
          metadata: payment.metadata,
        });
        addToast('success', t('ride.paymentComplete'));
        return txid;
      } catch (err) {
        addToast('error', errorMessage(err));
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [addToast, t]
  );

  return { preparePayment, prepareFailureMessage, payRide, processing };
}
