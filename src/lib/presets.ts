// Named, persisted setting profiles. A preset captures the whole config
// (sizes × formats × output × advanced effects) but never the source images —
// so you can reload a repeat job in one click.

import type { ConfigSnapshot } from '../store/useStore';
import { uid } from './util';

export interface Preset {
  id: string;
  name: string;
  /** Epoch ms when last saved. */
  savedAt: number;
  config: ConfigSnapshot;
}

const KEY = 'ip-presets';

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Preset[]) : [];
  } catch {
    return [];
  }
}

function persist(presets: Preset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** Create or overwrite a preset by name (case-insensitive match). Returns the new list. */
export function savePreset(name: string, config: ConfigSnapshot): Preset[] {
  const trimmed = name.trim() || 'Untitled';
  const presets = loadPresets();
  const existing = presets.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    existing.config = config;
    existing.savedAt = Date.now();
  } else {
    presets.push({ id: uid(), name: trimmed, savedAt: Date.now(), config });
  }
  presets.sort((a, b) => a.name.localeCompare(b.name));
  persist(presets);
  return presets;
}

export function deletePreset(id: string): Preset[] {
  const next = loadPresets().filter((p) => p.id !== id);
  persist(next);
  return next;
}
