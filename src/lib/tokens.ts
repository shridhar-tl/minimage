// Filename templating — kept in sync with src-tauri/src/filename.rs so the live
// preview in the UI matches what the backend actually writes.

export interface NameCtx {
  name: string;
  origext: string;
  ext: string;
  width: number;
  height: number;
  ow: number;
  oh: number;
  format: string;
  quality: number;
  /** WebP/AVIF encoding effort (1–9), or null if not applicable. */
  effort: number | null;
  /** PNG compression level (0–6), or null if not applicable. */
  pngLevel: number | null;
  /** True when this output is encoded losslessly. */
  lossless: boolean;
  sizeLabel: string;
  index: number;
}

export const FILENAME_TOKENS: { token: string; desc: string }[] = [
  { token: '{name}', desc: 'Original file name (no extension)' },
  { token: '{ext}', desc: 'Output extension (jpg, webp, …)' },
  { token: '{origext}', desc: 'Original extension' },
  { token: '{width}', desc: 'Output width in px' },
  { token: '{height}', desc: 'Output height in px' },
  { token: '{w}', desc: 'Output width (short)' },
  { token: '{h}', desc: 'Output height (short)' },
  { token: '{ow}', desc: 'Original width in px' },
  { token: '{oh}', desc: 'Original height in px' },
  { token: '{format}', desc: 'Output format name' },
  { token: '{quality}', desc: 'Quality value used (lossy formats)' },
  { token: '{effort}', desc: 'Compression effort (WebP/AVIF)' },
  { token: '{pnglevel}', desc: 'PNG compression level (0–6)' },
  { token: '{lossless}', desc: '"lossless" or "lossy"' },
  { token: '{enc}', desc: 'Compact encoding tag (e.g. q80e4, l2, lossless)' },
  { token: '{sizelabel}', desc: 'Label of the size preset' },
  { token: '{index}', desc: 'Sequence number' },
  { token: '{idx}', desc: 'Sequence number, zero-padded (001)' },
  { token: '{dd}', desc: 'Day, 2 digits' },
  { token: '{d}', desc: 'Day' },
  { token: '{MM}', desc: 'Month, 2 digits' },
  { token: '{M}', desc: 'Month' },
  { token: '{YYYY}', desc: 'Year, 4 digits' },
  { token: '{YY}', desc: 'Year, 2 digits' },
  { token: '{HH}', desc: 'Hour (24h), 2 digits' },
  { token: '{hh}', desc: 'Hour (12h), 2 digits' },
  { token: '{mm}', desc: 'Minute, 2 digits' },
  { token: '{ss}', desc: 'Second, 2 digits' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Compact, filename-safe tag describing the encoding settings that actually
 * affect this output — so a single `{enc}` token guarantees unique names across
 * any encoding difference. Kept in sync with `enc_tag` in filename.rs.
 *   PNG:        "lossless" | "l<level>"   (e.g. l2)
 *   WebP/AVIF:  "lossless" | "q<quality>e<effort>"  (e.g. q80e4)
 *   JPEG:       "q<quality>"
 *   others:     "" (no tunable knobs)
 */
export function encTag(ctx: Pick<NameCtx, 'format' | 'quality' | 'effort' | 'pngLevel' | 'lossless'>): string {
  if (ctx.format === 'png') return ctx.lossless ? 'lossless' : `l${ctx.pngLevel ?? 2}`;
  if (ctx.format === 'webp' || ctx.format === 'avif') {
    return ctx.lossless ? 'lossless' : `q${ctx.quality}e${ctx.effort ?? 4}`;
  }
  if (ctx.format === 'jpeg') return `q${ctx.quality}`;
  return '';
}

export function renderFilename(template: string, ctx: NameCtx, now = new Date()): string {
  const h12raw = now.getHours() % 12;
  const h12 = h12raw === 0 ? 12 : h12raw;

  // Longest tokens first so {MM} resolves before {M}, {dd} before {d}, etc.
  const pairs: [string, string][] = [
    ['{origheight}', String(ctx.oh)],
    ['{origwidth}', String(ctx.ow)],
    ['{sizelabel}', ctx.sizeLabel],
    ['{pnglevel}', ctx.pngLevel == null ? '' : String(ctx.pngLevel)],
    ['{lossless}', ctx.lossless ? 'lossless' : 'lossy'],
    ['{origext}', ctx.origext],
    ['{quality}', String(ctx.quality)],
    ['{effort}', ctx.effort == null ? '' : String(ctx.effort)],
    ['{height}', String(ctx.height)],
    ['{format}', ctx.format],
    ['{index}', String(ctx.index)],
    ['{width}', String(ctx.width)],
    ['{label}', ctx.sizeLabel],
    ['{name}', ctx.name],
    ['{YYYY}', String(now.getFullYear())],
    ['{enc}', encTag(ctx)],
    ['{idx}', String(ctx.index).padStart(3, '0')],
    ['{ext}', ctx.ext],
    ['{ow}', String(ctx.ow)],
    ['{oh}', String(ctx.oh)],
    ['{YY}', pad(now.getFullYear() % 100)],
    ['{MM}', pad(now.getMonth() + 1)],
    ['{dd}', pad(now.getDate())],
    ['{HH}', pad(now.getHours())],
    ['{hh}', pad(h12)],
    ['{mm}', pad(now.getMinutes())],
    ['{ss}', pad(now.getSeconds())],
    ['{w}', String(ctx.width)],
    ['{h}', String(ctx.height)],
    ['{M}', String(now.getMonth() + 1)],
  ];

  let out = template.trim() === '' ? '{name}_{width}x{height}.{ext}' : template;
  for (const [token, value] of pairs) {
    if (out.includes(token)) out = out.split(token).join(value);
  }
  out = out.split('{d}').join(String(now.getDate()));
  return sanitizeRelPath(out);
}

// Mirror filename.rs exactly: only the illegal set and control chars become '_'.
// Spaces and dashes inside names are preserved; trailing dots/spaces trimmed.
// (Control chars 0x00–0x1f are intentional here — they're invalid in filenames.)
// eslint-disable-next-line no-control-regex
const ILLEGAL = new RegExp('[<>:"|?*\\u0000-\\u001f]', 'g');

function sanitizeSegment(seg: string): string {
  const s = seg.replace(ILLEGAL, '_').replace(/[. ]+$/g, '');
  return s === '' ? '_' : s;
}

function sanitizeRelPath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '' && s !== '.')
    .map(sanitizeSegment)
    .join('/');
}
