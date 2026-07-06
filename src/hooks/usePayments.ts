import { useState, useCallback } from 'react';
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
        addToast('error', err instanceof Error ? err.message : 'Payment failed');
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [addToast]
  );

  return { payRide, processing };
}
