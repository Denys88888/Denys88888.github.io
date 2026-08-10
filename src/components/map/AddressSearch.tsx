import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Clock } from 'lucide-react';
import { Input } from '../ui/Input';
import {
  searchAddress,
  recentAddresses,
  rememberAddress,
  type AddressResult,
} from '../../services/mapService';
import type { GeoPoint } from '../../types';

interface Props {
  label: string;
  placeholder: string;
  value: string;
  icon?: ReactNode;
  near?: GeoPoint | null;
  countryCodes?: string;
  onSelect: (point: GeoPoint) => void;
}

// Debounced Nominatim autocomplete. When `near` is supplied, results are limited
// to the user's local region (~50 km). Emits a GeoPoint (with address) on select.
export function AddressSearch({ label, placeholder, value, icon, near, countryCodes, onSelect }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  // Shown instead of search results while the field is empty. Seeded from
  // storage on mount and refreshed whenever the list could have changed, so it
  // can never be empty at the moment the dropdown decides to open.
  const [recents, setRecents] = useState<AddressResult[]>(() => recentAddresses());
  const showingRecents = query.trim().length < 2 && recents.length > 0;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // Only user keystrokes may trigger a search: programmatic value changes
  // (selecting a suggestion, confirming a map tap) must not reopen the list.
  const fromUser = useRef(false);
  // `near` is only a ~50 km bias for ranking; a GPS tick must not restart the
  // debounce or invalidate an in-flight search, so it lives outside the deps.
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    fromUser.current = false;
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!fromUser.current) return;
    if (query.trim().length < 2) {
      setResults([]);
      // An emptied field falls back to the recents list rather than closing —
      // clearing the input is often how someone starts picking a past trip.
      // Re-read storage here: another field may have added an entry since mount.
      const r = recentAddresses();
      setRecents(r);
      setOpen(r.length > 0);
      return;
    }
    let stale = false; // a newer query superseded this request mid-flight
    timer.current = setTimeout(async () => {
      const found = await searchAddress(query, nearRef.current, countryCodes);
      if (stale) return;
      setResults(found);
      setOpen(found.length > 0);
    }, 400);
    return () => {
      stale = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, countryCodes]);

  return (
    <div className="relative">
      <Input
        label={label}
        placeholder={placeholder}
        value={query}
        icon={icon}
        onChange={(e) => {
          fromUser.current = true;
          setQuery(e.target.value);
        }}
        onFocus={() => {
          const r = recentAddresses();
          setRecents(r);
          if (results.length || r.length) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && (showingRecents ? recents.length > 0 : results.length > 0) && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg surface shadow-card">
          {(showingRecents ? recents : results).map((r, i) => (
            <li key={`${r.displayName}-${i}`}>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-primary/10"
                // pointerdown fires before the input's blur, so selection wins
                // the race against the blur-driven close on slow devices.
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSelect({ lat: r.lat, lng: r.lng, address: r.displayName });
                  rememberAddress(r);
                  fromUser.current = false;
                  setQuery(r.displayName);
                  setOpen(false);
                }}
              >
                {showingRecents && <Clock size={14} className="shrink-0 opacity-50" />}
                <span className="truncate">{r.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
