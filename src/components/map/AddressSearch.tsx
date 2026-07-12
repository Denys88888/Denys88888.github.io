import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from '../ui/Input';
import { searchAddress, type AddressResult } from '../../services/mapService';
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
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
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
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg surface shadow-card">
          {results.map((r, i) => (
            <li key={i}>
              <button
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-primary/10"
                // pointerdown fires before the input's blur, so selection wins
                // the race against the blur-driven close on slow devices.
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSelect({ lat: r.lat, lng: r.lng, address: r.displayName });
                  fromUser.current = false;
                  setQuery(r.displayName);
                  setOpen(false);
                }}
              >
                {r.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
