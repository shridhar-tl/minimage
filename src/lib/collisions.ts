// Predicts the output file paths a batch would write and flags collisions.
//
// The filename template only sees what tokens it contains. Two outputs that
// differ only by an axis NOT present in the template render to the SAME path and
// would silently overwrite each other — e.g. two PNGs at different compression
// levels when the template has no {pnglevel}/{enc}. This module not only detects
// that, it works out EXACTLY which axis collides and which token fixes it.

import type { FormatSpec, OutputSpec, SizeSpec } from '../backend/types';
import { formatMeta } from './catalog';
import { renderFilename, type NameCtx } from './tokens';
import { extOf, stemOf } from './util';

export interface ImageLike {
  name: string;
  width: number;
  height: number;
}

/** Compute the output width/height for one image under one size spec. */
function outDims(img: ImageLike, size: SizeSpec): { w: number; h: number } {
  const ow = img.width || 1920;
  const oh = img.height || 1080;
  if (size.scalePercent != null) {
    return { w: Math.round((ow * size.scalePercent) / 100), h: Math.round((oh * size.scalePercent) / 100) };
  }
  if (size.width && size.height) return { w: size.width, h: size.height };
  if (size.width) return { w: size.width, h: Math.round((oh * size.width) / ow) };
  if (size.height) return { w: Math.round((ow * size.height) / oh), h: size.height };
  return { w: ow, h: oh };
}

/** One concrete output in a collision group, kept so we can diff the axes. */
interface Variant {
  imgName: string;
  w: number;
  h: number;
  sizeLabel: string;
  fmt: FormatSpec;
}

/** A token we recommend the user add, with a one-line reason. */
export interface Suggestion {
  token: string;
  reason: string;
}

export interface CollisionInfo {
  /** True when the current config would write two outputs to the same path. */
  hasCollisions: boolean;
  /** How many distinct output names are involved in collisions. */
  count: number;
  /** A few example colliding file names, for the warning message. */
  examples: string[];
  /**
   * Concrete tokens that would resolve the collisions, derived from exactly
   * which axes differ between the colliding outputs. Most useful first.
   */
  suggestions: Suggestion[];
}

const NO_COLLISIONS: CollisionInfo = { hasCollisions: false, count: 0, examples: [], suggestions: [] };

// Newline can't appear in a filename, so it's a safe key separator for the
// "Same folder" case where collisions are scoped per source image.
const SEP = '\n';

function makeCtx(v: Variant, ow: number, oh: number, index: number): NameCtx {
  const meta = formatMeta(v.fmt.format);
  return {
    name: stemOf(v.imgName),
    origext: extOf(v.imgName),
    ext: meta.ext,
    width: v.w,
    height: v.h,
    ow,
    oh,
    format: v.fmt.format,
    quality: v.fmt.quality ?? 100,
    effort: v.fmt.effort,
    pngLevel: v.fmt.pngLevel,
    lossless: v.fmt.lossless,
    sizeLabel: v.sizeLabel,
    index,
  };
}

/**
 * Given the variants that collided onto one filename, figure out which axes
 * actually differ and return the precise token(s) that would separate them.
 */
function suggestForGroup(variants: Variant[]): Suggestion[] {
  const distinct = <T>(pick: (v: Variant) => T) => new Set(variants.map(pick)).size > 1;

  const out: Suggestion[] = [];
  // Each axis → the token that encodes it, only suggested when that axis varies.
  if (distinct((v) => v.imgName)) out.push({ token: '{name}', reason: 'different source images' });
  if (distinct((v) => `${v.w}x${v.h}`)) out.push({ token: '{width}x{height}', reason: 'different sizes' });
  if (distinct((v) => v.fmt.format)) out.push({ token: '{format}', reason: 'different formats' });

  // Encoding axes — these are the ones with no token in the default template.
  const encAxes: Suggestion[] = [];
  if (distinct((v) => v.fmt.lossless)) encAxes.push({ token: '{lossless}', reason: 'lossless vs lossy' });
  if (distinct((v) => v.fmt.quality)) encAxes.push({ token: '{quality}', reason: 'different quality' });
  if (distinct((v) => v.fmt.effort)) encAxes.push({ token: '{effort}', reason: 'different effort' });
  if (distinct((v) => v.fmt.pngLevel)) encAxes.push({ token: '{pnglevel}', reason: 'different compression levels' });

  // If only encoding settings differ and more than one of them, {enc} is the
  // single token that captures them all — recommend it first.
  if (out.length === 0 && encAxes.length > 1) {
    out.push({ token: '{enc}', reason: 'different encoding settings' });
  }
  out.push(...encAxes);

  // No axis differs → the variants are genuinely identical (e.g. the same
  // format added twice). Only a sequence number can separate them.
  if (out.length === 0) out.push({ token: '{index}', reason: 'identical outputs' });
  return out;
}

/**
 * Detect output-path collisions across the whole image × size × format matrix.
 *
 * Skipped (treated as safe) when:
 *  - the template includes {index}/{idx} (every output is made unique), or
 *  - destination is "Replace" (handled separately — one size × one format).
 */
export function detectCollisions(
  images: ImageLike[],
  sizes: SizeSpec[],
  formats: FormatSpec[],
  output: OutputSpec,
): CollisionInfo {
  if (!images.length || !sizes.length || !formats.length) return NO_COLLISIONS;
  if (output.mode === 'replace') return NO_COLLISIONS;

  const template = output.filenameTemplate;
  if (template.includes('{index}') || template.includes('{idx}')) return NO_COLLISIONS;

  // Group every produced output by its final relative path.
  const groups = new Map<string, Variant[]>();
  let index = 0;
  for (const img of images) {
    const ow = img.width || 1920;
    const oh = img.height || 1080;
    for (const size of sizes) {
      const { w, h } = outDims(img, size);
      for (const fmt of formats) {
        index += 1;
        const variant: Variant = { imgName: img.name, w, h, sizeLabel: size.label, fmt };
        const rel = renderFilename(template, makeCtx(variant, ow, oh, index));
        // In "Same folder" each output sits next to its source, so a collision
        // can only happen within one source's outputs. Scope the key per image.
        const key = output.mode === 'sameFolder' ? `${img.name}${SEP}${rel}` : rel;
        const arr = groups.get(key);
        if (arr) arr.push(variant);
        else groups.set(key, [variant]);
      }
    }
  }

  const dupes = [...groups.entries()].filter(([, vs]) => vs.length > 1);
  if (!dupes.length) return NO_COLLISIONS;

  const examples = dupes.slice(0, 4).map(([key]) => {
    const i = key.indexOf(SEP);
    return i >= 0 ? key.slice(i + 1) : key;
  });

  // Merge the per-group suggestions, de-duped, keeping the most relevant first.
  const merged = new Map<string, Suggestion>();
  for (const [, vs] of dupes) {
    for (const s of suggestForGroup(vs)) {
      if (!merged.has(s.token)) merged.set(s.token, s);
    }
  }

  return {
    hasCollisions: true,
    count: dupes.length,
    examples,
    suggestions: [...merged.values()],
  };
}
