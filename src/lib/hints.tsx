import type { HintContent } from '../components/InfoHint';

/**
 * Rich tooltip content for every setting, shown via the "?" InfoHint. Keeping it
 * here (rather than inline in panels) lets the panels stay compact and the copy
 * stay consistent. Each entry becomes a small titled card on hover.
 */
export const HINTS = {
  lossless: {
    title: 'Lossless',
    body: 'Keeps every pixel exactly as the source. No quality loss, but larger files.',
    tip: 'Leave off for photos; turn on for pixel-art, logos, or screenshots you need byte-perfect.',
  },
  quality: {
    title: 'Quality',
    body: (
      <>
        Lower = smaller file but more visible artifacts. Higher = better looking but larger.
      </>
    ),
    tip: <><b>75–85</b> is a sweet spot for most photos.</>,
  },
  effort: {
    title: 'Compression effort',
    body: 'How hard the encoder works to shrink the file. The image looks identical either way — higher just squeezes out a few more kilobytes.',
    tip: 'Higher is slower to create. Bump it up for final exports, keep it low while experimenting.',
  },
  pngLevel: {
    title: 'Compression effort',
    body: 'How hard to work to shrink the PNG, with no quality loss. 0 is fastest, 6 is smallest.',
    tip: 'Level 2 is a good balance; go to 6 only for files you ship.',
  },
  maxKb: {
    title: 'Target file size',
    body: (
      <>
        Auto-tunes <b>quality</b> per image so each output lands at or under your size budget.
        Overrides the quality slider for this format.
      </>
    ),
    tip: 'Great for email limits or upload caps. Works on JPEG, WebP, AVIF and lossy PNG.',
  },
  upscale: {
    title: 'Allow upscaling',
    body: 'By default images are never enlarged past their original size (to avoid blur). Turn this on to force smaller sources up to the target size.',
  },
  fitMode: {
    title: 'Fit mode',
    body: (
      <>
        How the image fills a width×height box:
        <br />
        <b>Fit</b> — scale inside, no crop. <b>Cover</b> — fill &amp; crop overflow.
        <br />
        <b>Pad</b> — fit then pad to exact size. <b>Stretch</b> — exact size, may distort.
      </>
    ),
  },
  // --- adjustments ---
  brightness: {
    title: 'Brightness',
    body: 'Lightens or darkens every output uniformly. 0 leaves it unchanged.',
  },
  contrast: {
    title: 'Contrast',
    body: 'Increases or reduces the difference between light and dark areas. 0 leaves it unchanged.',
  },
  saturation: {
    title: 'Saturation',
    body: 'Boosts or mutes color intensity. −100 is nearly grayscale, +100 is vivid.',
  },
  grayscale: {
    title: 'Grayscale',
    body: 'Converts every output to black & white. Overrides the saturation setting.',
  },
  // --- flatten ---
  flattenAll: {
    title: 'Flatten transparency',
    body: (
      <>
        Replaces transparent areas with a solid background color for <b>every</b> format — not
        just the ones that can’t store transparency (JPEG/BMP, which always flatten).
      </>
    ),
    tip: 'Use when you want a guaranteed solid background, e.g. PNG/WebP logos on white.',
  },
  flattenBg: {
    title: 'Background color',
    body: 'The color painted behind transparent pixels when flattening, and the pad color for non-alpha formats like JPEG.',
  },
  // --- watermark ---
  watermark: {
    title: 'Watermark',
    body: 'Stamps a logo or text caption onto every output — handy for branding or copyright.',
    tip: 'Text uses your system fonts; image accepts any PNG/SVG/JPG with transparency.',
  },
  watermarkScale: {
    title: 'Size',
    body: 'Width of the watermark as a percentage of each output’s width, so it scales proportionally across all sizes.',
  },
  watermarkOpacity: {
    title: 'Opacity',
    body: 'How see-through the watermark is. Lower is subtler; higher is bolder.',
  },
  watermarkMargin: {
    title: 'Margin',
    body: 'Inset from the chosen edge, as a percentage of width. 0 sits flush to the corner.',
  },
  // --- presets ---
  presets: {
    title: 'Presets',
    body: 'Save your whole setup — sizes, formats, output and advanced effects — and reload it in one click for repeat jobs.',
    tip: 'Sources (the images) aren’t part of a preset, only the settings.',
  },
  metadata: {
    title: 'Metadata',
    body: (
      <>
        Outputs are re-encoded from raw pixels, so camera <b>EXIF</b>, GPS and color profiles are
        always removed — smaller files and no location leaks.
      </>
    ),
    tip: 'There’s nothing to toggle: stripping is automatic and applies to every output.',
  },
} satisfies Record<string, HintContent>;

export type HintKey = keyof typeof HINTS;
