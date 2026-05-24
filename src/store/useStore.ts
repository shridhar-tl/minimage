import type { EditorState } from 'fluxo-ui';
import { create } from 'zustand';

import type {
  Adjustments,
  FlattenSpec,
  FormatSpec,
  ImageFileEntry,
  ImageInput,
  OutputResult,
  OutputSpec,
  ProcessOptions,
  ProcessSummary,
  SizeSpec,
  WatermarkSpec,
} from '../backend/types';
import { defaultOptions, defaultOutput, newFormat, sizeFromPreset, SIZE_PRESETS } from '../lib/catalog';
import { uid } from '../lib/util';

export interface ImageItem {
  id: string;
  name: string;
  path: string | null;
  bytesBase64: string | null;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
  selected: boolean;
  previewUrl?: string;
  annotated?: boolean;
  /**
   * The image editor's own serializable state (crop, rotate, flip, blur,
   * annotation layer, current base image). Persisted so reopening the editor
   * restores the edits as live, movable layers — not baked-in pixels.
   */
  editState?: EditorState | null;
  /**
   * Snapshot of the source taken the first time it is edited, so edits are
   * non-destructive: "Reset edits" restores these and re-editing can fall back
   * to the original. `orig.bytesBase64` is null for on-disk sources (the file
   * itself is the original); the other fields always hold the pre-edit values.
   */
  orig?: {
    bytesBase64: string | null;
    width: number;
    height: number;
    sizeBytes: number;
    previewUrl?: string;
  };
}

export type LayoutView = 'grid' | 'list';
export type ColorMode = 'dark' | 'light';

/** The full settings config that a preset captures (everything but the images). */
export interface ConfigSnapshot {
  sizes: SizeSpec[];
  formats: FormatSpec[];
  output: OutputSpec;
  options: ProcessOptions;
}

interface ProcessingState {
  running: boolean;
  current: number;
  total: number;
  label: string;
}

interface AppState {
  images: ImageItem[];
  sizes: SizeSpec[];
  formats: FormatSpec[];
  output: OutputSpec;
  options: ProcessOptions;

  view: LayoutView;
  mode: ColorMode;
  onlySelected: boolean;

  processing: ProcessingState;
  summary: ProcessSummary | null;
  liveResults: OutputResult[];

  // images
  addEntries: (entries: ImageFileEntry[]) => number;
  addInMemory: (item: { name: string; bytesBase64: string; width: number; height: number; sizeBytes: number }) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;
  setPreview: (id: string, url: string) => void;
  setAnnotated: (
    id: string,
    bytesBase64: string,
    width: number,
    height: number,
    sizeBytes: number,
    editState: EditorState | null,
  ) => void;
  resetAnnotation: (id: string) => void;

  // selection
  toggleSelect: (id: string) => void;
  setSelection: (ids: string[]) => void;
  selectAll: (value: boolean) => void;

  // sizes
  addSize: (s: SizeSpec) => void;
  updateSize: (id: string, patch: Partial<SizeSpec>) => void;
  removeSize: (id: string) => void;
  duplicateSize: (id: string) => void;

  // formats
  addFormat: (f: FormatSpec) => void;
  updateFormat: (id: string, patch: Partial<FormatSpec>) => void;
  removeFormat: (id: string) => void;

  // output
  setOutput: (patch: Partial<OutputSpec>) => void;

  // batch-wide effects (advanced)
  setAdjustments: (patch: Partial<Adjustments>) => void;
  setFlatten: (patch: Partial<FlattenSpec>) => void;
  setWatermark: (patch: Partial<WatermarkSpec>) => void;
  resetOptions: () => void;

  // presets — save/restore the full config (not the images)
  applyConfig: (cfg: ConfigSnapshot) => void;

  // ui
  setView: (v: LayoutView) => void;
  toggleMode: () => void;
  setOnlySelected: (v: boolean) => void;

  // processing
  setProcessing: (patch: Partial<ProcessingState>) => void;
  pushResult: (r: OutputResult) => void;
  setSummary: (s: ProcessSummary | null) => void;
  resetResults: () => void;
}

const initialMode: ColorMode =
  (typeof localStorage !== 'undefined' && (localStorage.getItem('ip-mode') as ColorMode)) || 'dark';

function applyMode(mode: ColorMode) {
  // --ip-* vars key off the <html> data-mode; fluxo-ui's --eui-* dark vars key
  // off `body.mode-dark`, so set both.
  document.documentElement.dataset.mode = mode;
  const body = document.body;
  if (body) {
    body.classList.toggle('mode-dark', mode === 'dark');
    if (!body.classList.contains('theme-indigo')) body.classList.add('theme-indigo');
  }
  try {
    localStorage.setItem('ip-mode', mode);
  } catch {
    /* ignore */
  }
}

export const toImageInput = (item: ImageItem): ImageInput => ({
  id: item.id,
  path: item.path,
  bytesBase64: item.bytesBase64,
  name: item.name,
});

export const useStore = create<AppState>((set, get) => ({
  images: [],
  sizes: [sizeFromPreset(SIZE_PRESETS[0])], // "Original"
  formats: [newFormat('webp')],
  output: defaultOutput(),
  options: defaultOptions(),

  view: 'grid',
  mode: initialMode,
  onlySelected: false,

  processing: { running: false, current: 0, total: 0, label: '' },
  summary: null,
  liveResults: [],

  addEntries: (entries) => {
    const existing = new Set(get().images.map((i) => i.path).filter(Boolean));
    const fresh = entries
      .filter((e) => !existing.has(e.path))
      .map<ImageItem>((e) => ({
        id: uid(),
        name: e.name,
        path: e.path,
        bytesBase64: null,
        width: e.width,
        height: e.height,
        format: e.format,
        sizeBytes: e.sizeBytes,
        selected: true,
      }));
    if (fresh.length) set((s) => ({ images: [...s.images, ...fresh] }));
    return fresh.length;
  },

  addInMemory: ({ name, bytesBase64, width, height, sizeBytes }) =>
    set((s) => ({
      images: [
        ...s.images,
        {
          id: uid(),
          name,
          path: null,
          bytesBase64,
          width,
          height,
          format: 'png',
          sizeBytes,
          selected: true,
          previewUrl: bytesBase64,
        },
      ],
    })),

  removeImage: (id) => set((s) => ({ images: s.images.filter((i) => i.id !== id) })),
  clearImages: () => set({ images: [], summary: null, liveResults: [] }),
  setPreview: (id, url) =>
    set((s) => ({ images: s.images.map((i) => (i.id === id ? { ...i, previewUrl: url } : i)) })),
  setAnnotated: (id, bytesBase64, width, height, sizeBytes, editState) =>
    set((s) => ({
      images: s.images.map((i) =>
        i.id === id
          ? {
              ...i,
              // Snapshot the original once, the first time this image is edited.
              orig:
                i.orig ?? {
                  bytesBase64: i.bytesBase64,
                  width: i.width,
                  height: i.height,
                  sizeBytes: i.sizeBytes,
                  previewUrl: i.previewUrl,
                },
              bytesBase64,
              width,
              height,
              sizeBytes,
              annotated: true,
              editState,
              previewUrl: bytesBase64,
            }
          : i,
      ),
    })),
  resetAnnotation: (id) =>
    set((s) => ({
      images: s.images.map((i) =>
        i.id === id && i.orig
          ? {
              ...i,
              bytesBase64: i.orig.bytesBase64,
              width: i.orig.width,
              height: i.orig.height,
              sizeBytes: i.orig.sizeBytes,
              previewUrl: i.orig.previewUrl,
              annotated: false,
              editState: null,
              orig: undefined,
            }
          : i,
      ),
    })),

  toggleSelect: (id) =>
    set((s) => ({ images: s.images.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)) })),
  setSelection: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({ images: s.images.map((i) => ({ ...i, selected: idSet.has(i.id) })) }));
  },
  selectAll: (value) => set((s) => ({ images: s.images.map((i) => ({ ...i, selected: value })) })),

  addSize: (sz) => set((s) => ({ sizes: [...s.sizes, sz] })),
  updateSize: (id, patch) =>
    set((s) => ({ sizes: s.sizes.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  removeSize: (id) => set((s) => ({ sizes: s.sizes.filter((x) => x.id !== id) })),
  duplicateSize: (id) =>
    set((s) => {
      const src = s.sizes.find((x) => x.id === id);
      if (!src) return {};
      return { sizes: [...s.sizes, { ...src, id: uid(), label: `${src.label} copy` }] };
    }),

  addFormat: (f) => set((s) => ({ formats: [...s.formats, f] })),
  updateFormat: (id, patch) =>
    set((s) => ({ formats: s.formats.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  removeFormat: (id) => set((s) => ({ formats: s.formats.filter((x) => x.id !== id) })),

  setOutput: (patch) => set((s) => ({ output: { ...s.output, ...patch } })),

  setAdjustments: (patch) =>
    set((s) => ({ options: { ...s.options, adjustments: { ...s.options.adjustments, ...patch } } })),
  setFlatten: (patch) =>
    set((s) => ({ options: { ...s.options, flatten: { ...s.options.flatten, ...patch } } })),
  setWatermark: (patch) =>
    set((s) => ({ options: { ...s.options, watermark: { ...s.options.watermark, ...patch } } })),
  resetOptions: () => set({ options: defaultOptions() }),

  applyConfig: (cfg) =>
    set({
      // Re-id sizes/formats so list keys never collide with the live config.
      sizes: cfg.sizes.map((s) => ({ ...s, id: uid() })),
      formats: cfg.formats.map((f) => ({ ...f, id: uid() })),
      output: cfg.output,
      options: cfg.options,
    }),

  setView: (v) => set({ view: v }),
  toggleMode: () =>
    set((s) => {
      const mode: ColorMode = s.mode === 'dark' ? 'light' : 'dark';
      applyMode(mode);
      return { mode };
    }),
  setOnlySelected: (v) => set({ onlySelected: v }),

  setProcessing: (patch) => set((s) => ({ processing: { ...s.processing, ...patch } })),
  pushResult: (r) => set((s) => ({ liveResults: [...s.liveResults, r] })),
  setSummary: (s2) => set({ summary: s2 }),
  resetResults: () => set({ summary: null, liveResults: [] }),
}));

// apply persisted mode once on load
if (typeof document !== 'undefined') applyMode(initialMode);

/** Images that will actually be processed, honoring the "only selected" toggle. */
export function imagesToProcess(state: AppState): ImageItem[] {
  if (!state.onlySelected) return state.images;
  const selected = state.images.filter((i) => i.selected);
  return selected.length ? selected : state.images;
}
