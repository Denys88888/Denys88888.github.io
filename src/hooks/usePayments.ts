import { useState, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { payForRide } from '../services/piSdk';
import { useToast } from './useToast';

export function usePayments() {
  const [processing, setProcessing] = useState(false);
  const { addToast } = useToast();
  const { t } = useTranslation();

  const payRide = useCallback(
    async (rideId: string): Promise<string | null> => {
      setProcessing(true);
      try {
        const payment = await api.createPayment(rideId);
        const { txid } = await payForRide({
          paymentId: payment.paymentId,
          amount: payment.amount,
          memo: payment.memo,
          metadata: payment.metadata,
        });
        addToast('success', t('ride.paymentComplete'));
        return txid;
      } catch (err) {
        // Surface the server's actual reason (e.g. "Payment already completed"
        // after a stale-hold recovery) instead of axios's generic
        // "Request failed with status code 409".
        const serverMessage = isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined;
        addToast(
          'error',
          serverMessage || (err instanceof Error && err.message ? err.message : t('ride.paymentFailed'))
        );
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [addToast, t]
  );

  return { payRide, processing };
}
