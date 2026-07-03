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

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setResults(await searchAddress(query, near, countryCodes));
      setOpen(true);
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="relative">
      <Input
        label={label}
        placeholder={placeholder}
        value={query}
        icon={icon}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg surface shadow-card">
          {results.map((r, i) => (
            <li key={i}>
              <button
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-primary/10"
                onClick={() => {
                  onSelect({ lat: r.lat, lng: r.lng, address: r.displayName });
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
