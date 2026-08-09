import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { setFareOverrides } from '../utils/helpers';

type PublicSettings = Awaited<ReturnType<typeof api.publicSettings>>;

const POLL_MS = 60000;

// The app's single poll of the public settings endpoint — mounted once at the
// root, so admin changes reach an open session within a minute without every
// consumer fetching for itself. Two consumers today: the maintenance banner
// reads the returned value, and the fare knobs are pushed into utils/helpers so
// the quote on the order screen follows what the admin set instead of the
// client's own hardcoded table.
export function usePublicSettings(): PublicSettings | null {
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = (): void => {
      api
        .publicSettings()
        .then((s) => {
          if (cancelled) return;
          setSettings(s);
          setFareOverrides({ minFare: s.minFare, baseFarePerKm: s.baseFarePerKm });
        })
        .catch((err) => console.error('[settings] publicSettings:', err));
    };
    check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return settings;
}
