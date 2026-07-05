import { api } from './api';
import type { SavedAddress } from '../types';

// Saved quick-access places (Home / Work / Parents). The backend is the source
// of truth; localStorage keeps a mirror so the chips work offline and the list
// survives a failed request.

const LS_KEY = 'taxipro_saved_addresses';

function readLocal(): SavedAddress[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as SavedAddress[];
  } catch {
    return [];
  }
}

function writeLocal(addresses: SavedAddress[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(addresses));
  } catch {
    /* storage full/blocked — chips just won't persist */
  }
}

export async function loadSavedAddresses(): Promise<SavedAddress[]> {
  try {
    const remote = await api.getSavedAddresses();
    writeLocal(remote);
    return remote;
  } catch {
    return readLocal();
  }
}

// Insert or replace the entry with the same label, then sync.
export async function saveAddress(entry: SavedAddress): Promise<SavedAddress[]> {
  const list = readLocal().filter((a) => a.label !== entry.label);
  list.push(entry);
  writeLocal(list);
  try {
    await api.putSavedAddresses(list);
  } catch {
    /* offline — the local mirror will be pushed on the next successful save */
  }
  return list;
}
