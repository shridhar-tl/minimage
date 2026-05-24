import type {
  Adjustments,
  FlattenSpec,
  FormatSpec,
  OutputFormatId,
  OutputSpec,
  ProcessOptions,
  ResizeMode,
  SizeSpec,
  WatermarkSpec,
} from '../backend/types';
import { uid } from './util';

/* ------------------------------- sizes -------------------------------- */

export interface SizePreset {
  label: string;
  width: number | null;
  height: number | null;
  mode?: ResizeMode;
  scalePercent?: number | null;
  group: string;
}

export const SIZE_PRESETS: SizePreset[] = [
  { label: 'Original', width: null, height: null, group: 'General' },
  { label: '50%', width: null, height: null, scalePercent: 50, group: 'Scale' },
  { label: '25%', width: null, height: null, scalePercent: 25, group: 'Scale' },
  { label: '2×', width: null, height: null, scalePercent: 200, group: 'Scale' },

  { label: 'Thumb 320w', width: 320, height: null, group: 'Width' },
  { label: 'Small 640w', width: 640, height: null, group: 'Width' },
  { label: 'Medium 1024w', width: 1024, height: null, group: 'Width' },
  { label: 'Large 1600w', width: 1600, height: null, group: 'Width' },
  { label: 'XL 1920w', width: 1920, height: null, group: 'Width' },

  { label: 'Icon 64', width: 64, height: 64, mode: 'cover', group: 'Square' },
  { label: 'Icon 128', width: 128, height: 128, mode: 'cover', group: 'Square' },
  { label: 'Icon 256', width: 256, height: 256, mode: 'cover', group: 'Square' },
  { label: 'Avatar 512', width: 512, height: 512, mode: 'cover', group: 'Square' },

  { label: 'HD 1280×720', width: 1280, height: 720, mode: 'fit', group: 'Box' },
  { label: 'FHD 1920×1080', width: 1920, height: 1080, mode: 'fit', group: 'Box' },
  { label: '2K 2560×1440', width: 2560, height: 1440, mode: 'fit', group: 'Box' },
  { label: '4K 3840×2160', width: 3840, height: 2160, mode: 'fit', group: 'Box' },

  { label: 'IG Square 1080', width: 1080, height: 1080, mode: 'cover', group: 'Social' },
  { label: 'IG Portrait', width: 1080, height: 1350, mode: 'cover', group: 'Social' },
  { label: 'Story 1080×1920', width: 1080, height: 1920, mode: 'cover', group: 'Social' },
  { label: 'OG 1200×630', width: 1200, height: 630, mode: 'cover', group: 'Social' },
  { label: 'Twitter 1600×900', width: 1600, height: 900, mode: 'cover', group: 'Social' },
  { label: 'Favicon 32', width: 32, height: 32, mode: 'cover', group: 'Social' },
];

export function sizeFromPreset(p: SizePreset): SizeSpec {
  return {
    id: uid(),
    label: p.label,
    width: p.width,
    height: p.height,
    scalePercent: p.scalePercent ?? null,
    mode: p.mode ?? 'fit',
    allowUpscale: false,
    background: '#ffffff',
  };
}

export function newCustomSize(): SizeSpec {
  return {
    id: uid(),
    label: 'Custom',
    width: 800,
    height: null,
    scalePercent: null,
    mode: 'fit',
    allowUpscale: false,
    background: '#ffffff',
  };
}

export const RESIZE_MODES: { id: ResizeMode; label: string; hint: string }[] = [
  { id: 'fit', label: 'Fit', hint: 'Scale to fit inside, keep aspect (no crop)' },
  { id: 'cover', label: 'Cover', hint: 'Fill the box, keep aspect, crop overflow' },
  { id: 'pad', label: 'Pad', hint: 'Fit then pad to the exact box with background' },
  { id: 'stretch', label: 'Stretch', hint: 'Stretch to exact size (may distort)' },
];

/* ------------------------------ formats ------------------------------- */

export interface FormatMeta {
  id: OutputFormatId;
  label: string;
  ext: string;
  quality: boolean; // supports a lossy quality slider
  lossless: boolean; // supports a lossless toggle
  alpha: boolean;
  pngLevel?: boolean;
  effort?: boolean;
  defaultQuality: number;
  blurb: string;
}

export const FORMATS: FormatMeta[] = [
  { id: 'webp', label: 'WebP', ext: 'webp', quality: true, lossless: true, alpha: true, effort: true, defaultQuality: 80, blurb: 'Great all-rounder — small files, supports transparency, lossy or lossless.' },
  { id: 'avif', label: 'AVIF', ext: 'avif', quality: true, lossless: true, alpha: true, effort: true, defaultQuality: 55, blurb: 'Smallest files at the same quality. Slower to create.' },
  { id: 'jpeg', label: 'JPEG', ext: 'jpg', quality: true, lossless: false, alpha: false, defaultQuality: 82, blurb: 'Universal for photos. No transparency.' },
  { id: 'png', label: 'PNG', ext: 'png', quality: true, lossless: true, alpha: true, pngLevel: true, defaultQuality: 80, blurb: 'Smart compression (TinyPNG-style): big size cuts with no visible loss. Toggle Lossless for exact pixels.' },
  { id: 'gif', label: 'GIF', ext: 'gif', quality: false, lossless: false, alpha: true, defaultQuality: 100, blurb: '256-color palette for simple graphics.' },
  { id: 'tiff', label: 'TIFF', ext: 'tiff', quality: false, lossless: true, alpha: true, defaultQuality: 100, blurb: 'Lossless archival format.' },
  { id: 'bmp', label: 'BMP', ext: 'bmp', quality: false, lossless: true, alpha: false, defaultQuality: 100, blurb: 'Uncompressed bitmap.' },
  { id: 'ico', label: 'ICO', ext: 'ico', quality: false, lossless: true, alpha: true, defaultQuality: 100, blurb: 'Windows icon (capped at 256px).' },
];

export function formatMeta(id: OutputFormatId): FormatMeta {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

export function newFormat(id: OutputFormatId): FormatSpec {
  const m = formatMeta(id);
  return {
    id: uid(),
    format: id,
    quality: m.quality ? m.defaultQuality : null,
    lossless: !m.quality && m.lossless,
    pngLevel: m.pngLevel ? 2 : null,
    effort: m.effort ? 4 : null,
    maxKb: null,
  };
}

/** Formats whose file size can be auto-targeted (have a lossy quality knob). */
export function supportsTargetSize(id: OutputFormatId): boolean {
  return id === 'jpeg' || id === 'webp' || id === 'avif' || id === 'png';
}

/* --------------------------- batch-wide effects --------------------------- */

export function defaultAdjustments(): Adjustments {
  return { brightness: 0, contrast: 0, saturation: 0, grayscale: false };
}

export function defaultFlatten(): FlattenSpec {
  return { flattenAll: false, background: '#ffffff' };
}

export function defaultWatermark(): WatermarkSpec {
  return {
    enabled: false,
    kind: 'text',
    text: '© My Brand',
    imageBase64: null,
    imageName: null,
    anchor: 'bottomRight',
    opacity: 70,
    scalePercent: 25,
    marginPercent: 3,
    color: '#ffffff',
  };
}

export function defaultOptions(): ProcessOptions {
  return {
    adjustments: defaultAdjustments(),
    flatten: defaultFlatten(),
    watermark: defaultWatermark(),
  };
}

export const WATERMARK_ANCHORS: { id: WatermarkSpec['anchor']; label: string }[] = [
  { id: 'topLeft', label: 'Top left' },
  { id: 'topRight', label: 'Top right' },
  { id: 'center', label: 'Center' },
  { id: 'bottomLeft', label: 'Bottom left' },
  { id: 'bottomRight', label: 'Bottom right' },
];

/* ------------------------------ output -------------------------------- */

export function defaultOutput(): OutputSpec {
  return {
    mode: 'customFolder',
    customFolder: null,
    filenameTemplate: '{name}_{width}x{height}.{ext}',
    onConflict: 'rename',
  };
}
