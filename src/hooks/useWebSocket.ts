import { useEffect, useState, useCallback } from 'react';
import { wsService } from '../services/wsService';

// React wrapper over the singleton WebSocket client.
//
// Reconnection: the socket auto-reconnects with exponential backoff
// (1s → 2s → 4s → 8s → 16s → 30s cap) handled inside wsService. This hook adds
// browser online/offline awareness: when the device drops offline we surface it,
// and the moment it comes back online we force an immediate reconnect (resetting
// the backoff) so chat and ride tracking resume without waiting out a delay.
export function useWebSocket() {
  const [connected, setConnected] = useState(wsService.connected);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const offOpen = wsService.on('__open', () => setConnected(true));
    const offClose = wsService.on('__close', () => setConnected(false));

    const handleOnline = () => {
      setOnline(true);
      wsService.forceReconnect();
    };
    const handleOffline = () => {
      setOnline(false);
      setConnected(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      offOpen();
      offClose();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const subscribe = useCallback(
    (type: string, handler: (payload: Record<string, unknown>) => void) =>
      wsService.on(type, handler),
    []
  );

  const send = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => wsService.send(type, payload),
    []
  );

  const reconnect = useCallback(() => wsService.forceReconnect(), []);

  return { connected, online, subscribe, send, reconnect };
}
