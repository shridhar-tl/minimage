// The backend contract.
//
// The entire UI talks to image processing / the file system ONLY through the
// `ProcessorBackend` interface below (via the `useBackend()` hook). Today the
// only implementation is `tauriBackend`. To move to Electron/sharp later, write
// an `electronBackend` that satisfies this same interface and swap it in
// `backend/context.tsx` — no UI component changes.

export type ResizeMode = 'fit' | 'cover' | 'stretch' | 'pad';
export type OutputFormatId = 'webp' | 'avif' | 'jpeg' | 'png' | 'gif' | 'bmp' | 'tiff' | 'ico';
export type OutputModeId = 'replace' | 'sameFolder' | 'customFolder';
export type ConflictPolicy = 'overwrite' | 'skip' | 'rename';
export type ResultStatus = 'ok' | 'skipped' | 'error';

/** Where a watermark sits on the image. */
export type WatermarkAnchor =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'center';

export type WatermarkKind = 'text' | 'image';

export interface SizeSpec {
  id: string;
  label: string;
  width: number | null;
  height: number | null;
  scalePercent: number | null;
  mode: ResizeMode;
  allowUpscale: boolean;
  background: string | null;
}

export interface FormatSpec {
  id: string;
  format: OutputFormatId;
  quality: number | null;
  lossless: boolean;
  pngLevel: number | null;
  effort: number | null;
  /**
   * Target file-size mode: when set (KB), the encoder auto-tunes quality so each
   * output lands at or under this size. Ignored for lossless / formats without a
   * quality knob (PNG-lossless, GIF, BMP, TIFF, ICO).
   */
  maxKb: number | null;
}

/** Brightness/contrast/saturation/grayscale applied to every output. */
export interface Adjustments {
  /** -100..100, 0 = no change. */
  brightness: number;
  /** -100..100, 0 = no change. */
  contrast: number;
  /** -100..100, 0 = no change (−100 = grayscale-ish, +100 = vivid). */
  saturation: number;
  grayscale: boolean;
}

/** How transparency is handled when exporting. */
export interface FlattenSpec {
  /**
   * Force a solid background behind transparent pixels for *every* format,
   * not just the ones that lack alpha. Off = transparency is kept where the
   * format supports it (and only flattened for JPEG/BMP, as before).
   */
  flattenAll: boolean;
  /** Background color used when flattening (hex). */
  background: string;
}

/** A logo or text stamp composited onto every output. */
export interface WatermarkSpec {
  enabled: boolean;
  kind: WatermarkKind;
  /** Text content (kind = 'text'). */
  text: string;
  /** Base64/data-URL of the overlay image (kind = 'image'). */
  imageBase64: string | null;
  /** File name of the chosen overlay image, for display only. */
  imageName: string | null;
  anchor: WatermarkAnchor;
  /** 1..100. */
  opacity: number;
  /** Watermark width as a % of the output's width (1..100). */
  scalePercent: number;
  /** Inset from the chosen edge, as a % of the output's width (0..25). */
  marginPercent: number;
  /** Text color (hex), kind = 'text'. */
  color: string;
}

export interface OutputSpec {
  mode: OutputModeId;
  customFolder: string | null;
  filenameTemplate: string;
  onConflict: ConflictPolicy;
}

/** A single image to process — a file on disk OR in-memory bytes. */
export interface ImageInput {
  id: string;
  path: string | null;
  bytesBase64: string | null;
  name: string;
}

/**
 * Batch-wide effects applied to every output (after resize, before encode).
 * Optional so older callers / the default request stay valid.
 */
export interface ProcessOptions {
  adjustments: Adjustments;
  flatten: FlattenSpec;
  watermark: WatermarkSpec;
}

export interface ProcessRequest {
  jobId: string;
  inputs: ImageInput[];
  sizes: SizeSpec[];
  formats: FormatSpec[];
  output: OutputSpec;
  options: ProcessOptions;
}

export interface ImageFileEntry {
  path: string;
  name: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

export interface ProbeInfo {
  width: number;
  height: number;
  format: string;
}

export interface OutputResult {
  inputId: string;
  inputName: string;
  sizeLabel: string;
  format: string;
  /** Human-readable summary of the encoding settings used (e.g. "quality 80 · effort 4"). */
  options: string;
  outputPath: string;
  width: number;
  height: number;
  bytes: number;
  originalBytes: number;
  status: ResultStatus;
  error: string | null;
}

export interface ProcessSummary {
  jobId: string;
  total: number;
  ok: number;
  skipped: number;
  failed: number;
  results: OutputResult[];
}

export interface ProgressEvent {
  jobId: string;
  current: number;
  total: number;
  label: string;
  lastResult: OutputResult | null;
}

export interface ProcessorBackend {
  /** Identifies the implementation (e.g. "tauri"). */
  readonly kind: string;

  /** Open a native multi-file picker; returns chosen file paths. */
  pickFiles(): Promise<string[]>;
  /** Open a native folder picker; returns the chosen directory. */
  pickFolder(): Promise<string | null>;
  /** Open a native folder picker for the output destination. */
  pickOutputFolder(): Promise<string | null>;

  /** Expand files/folders into image entries with dimensions. */
  inspectPaths(paths: string[], recursive: boolean): Promise<ImageFileEntry[]>;
  /** Probe a single source. */
  probe(input: ImageInput): Promise<ProbeInfo>;
  /** Render a downscaled PNG data-URL preview for display / annotation. */
  preview(input: ImageInput, max: number): Promise<string>;

  /** Run a batch; `onProgress` fires per produced output. */
  process(request: ProcessRequest, onProgress: (e: ProgressEvent) => void): Promise<ProcessSummary>;

  /** Open a file/folder with the OS default handler. */
  openPath(path: string): Promise<void>;
  /** Open an external URL in the default browser. */
  openUrl(url: string): Promise<void>;
  /** Reveal a file in the OS file explorer. */
  revealInFolder(path: string): Promise<void>;

  /** Subscribe to OS drag-and-drop of files onto the window. Returns an unsubscribe fn. */
  onFileDrop(handler: (paths: string[]) => void): Promise<() => void>;
}
