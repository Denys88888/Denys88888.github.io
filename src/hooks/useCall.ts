import { useSyncExternalStore } from 'react';
import { callService, type CallSnapshot } from '../services/callService';

// Subscribe a component to the shared call state. useSyncExternalStore keeps it
// in step with the singleton without a manual effect + forceUpdate.
export function useCall(): CallSnapshot {
  return useSyncExternalStore(
    (cb) => callService.subscribe(cb),
    () => callService.getSnapshot()
  );
}
