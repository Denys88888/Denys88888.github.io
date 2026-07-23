import { useState, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { payForRide } from '../services/piSdk';
import { useToast } from './useToast';

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
    // Surface the server's actual reason (e.g. "Payment already completed"
    // after a stale-hold recovery) instead of axios's generic
    // "Request failed with status code 409".
    const serverMessage = isAxiosError(err)
      ? (err.response?.data as { error?: string } | undefined)?.error
      : undefined;
    return serverMessage || (err instanceof Error && err.message ? err.message : t('ride.paymentFailed'));
  };

  // Ask our backend for the payment record ahead of time (amount/memo/
  // metadata) so the actual pay button click can call window.Pi.createPayment
  // with zero awaits in between. iOS/WebKit (the Pi Browser included) treats
  // "user activation" as expiring across an awaited network call — if we
  // fetch this data inside the click handler, by the time createPayment runs
  // the SDK's payment sheet silently fails to open. Preparing it in advance
  // (as soon as the ride becomes payable) keeps the click handler synchronous.
  const preparePayment = useCallback(async (rideId: string): Promise<PreparedPayment | null> => {
    try {
      return await api.createPayment(rideId);
    } catch (err) {
      console.error('[payments] preparePayment:', err);
      return null;
    }
  }, []);

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

  return { preparePayment, payRide, processing };
}
