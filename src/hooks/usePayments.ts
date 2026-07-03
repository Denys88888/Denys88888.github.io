import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { payForRide } from '../services/piSdk';
import { useToast } from './useToast';

// Drives the full Pi payment lifecycle for a ride: create → Pi confirm →
// server approve → server complete. Returns the txid on success.
export function usePayments() {
  const [processing, setProcessing] = useState(false);
  const { addToast } = useToast();

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
        addToast('success', 'Payment complete');
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
