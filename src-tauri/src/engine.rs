//! The image-engine seam.
//!
//! Everything image-library-specific lives *behind* the [`ImageEngine`] trait.
//! The pipeline only ever speaks in terms of:
//!   * `Box<dyn LoadedImage>` — an opaque decoded source (decode once, reuse),
//!   * [`RasterBuffer`]       — straight-alpha RGBA8 pixels,
//!   * [`Plan`]               — pure geometry (no library types).
//!
//! To swap to a different imaging backend you only implement this trait again;
//! nothing else in `pipeline.rs` changes.

use std::any::Any;

use crate::model::{
    Adjustments, FlattenSpec, FormatSpec, ProbeInfo, ResizeMode, SizeSpec, WatermarkAnchor,
    WatermarkSpec,
};

/// Pure-geometry render plan. `content_*` is the scaled image; `canvas_*` is the
/// final framed image; `off_*` places the content on the canvas (negative = crop).
#[derive(Clone, Copy, Debug)]
pub struct Plan {
    pub content_w: u32,
    pub content_h: u32,
    pub canvas_w: u32,
    pub canvas_h: u32,
    pub off_x: i64,
    pub off_y: i64,
}

impl Plan {
    fn exact(w: u32, h: u32) -> Plan {
        Plan {
            content_w: w.max(1),
            content_h: h.max(1),
            canvas_w: w.max(1),
            canvas_h: h.max(1),
            off_x: 0,
            off_y: 0,
        }
    }
}

/// Straight-alpha RGBA8 pixel buffer (row-major, 4 bytes per pixel).
#[derive(Clone)]
pub struct RasterBuffer {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

/// A ready-to-composite watermark overlay (already rasterized to RGBA pixels).
/// The engine produces this from a text/image watermark; placement + alpha
/// blending onto the output is the engine-agnostic [`composite_watermark`].
pub struct WatermarkOverlay {
    pub buf: RasterBuffer,
}

/// An opaque decoded source. Concrete engines downcast via [`Any`].
pub trait LoadedImage: Send + Sync {
    fn dimensions(&self) -> (u32, u32);
    fn as_any(&self) -> &dyn Any;
}

/// The pluggable imaging backend.
pub trait ImageEngine: Send + Sync {
    /// Cheap width/height/format probe (no full decode where avoidable).
    fn probe(&self, bytes: &[u8], ext_hint: Option<&str>) -> anyhow::Result<ProbeInfo>;

    /// Decode a source once so it can be rendered at many sizes.
    fn load(&self, bytes: &[u8], ext_hint: Option<&str>) -> anyhow::Result<Box<dyn LoadedImage>>;

    /// Rasterize a loaded source to an exact [`Plan`] (resize + frame).
    fn render(&self, src: &dyn LoadedImage, plan: &Plan, bg: [u8; 4]) -> anyhow::Result<RasterBuffer>;

    /// Encode a raster buffer to the requested format's bytes.
    fn encode(&self, buf: &RasterBuffer, fmt: &FormatSpec) -> anyhow::Result<Vec<u8>>;

    /// Rasterize a watermark (text or decoded image) to an RGBA overlay sized for
    /// an output that is `out_w` px wide. Returns `None` when the watermark is
    /// inactive or can't be produced. Default impl: no watermark support.
    fn render_watermark(
        &self,
        _wm: &WatermarkSpec,
        _out_w: u32,
        _out_h: u32,
    ) -> anyhow::Result<Option<WatermarkOverlay>> {
        Ok(None)
    }
}

/* ----------------------- engine-agnostic pixel effects ----------------------- */

/// Apply brightness/contrast/saturation/grayscale in place. Order: grayscale →
/// saturation → contrast → brightness. All inputs are −100..=100 (0 = no-op).
pub fn apply_adjustments(buf: &mut RasterBuffer, adj: &Adjustments) {
    if adj.is_identity() {
        return;
    }
    // Precompute a contrast factor (standard GIMP-style formula).
    let c = (adj.contrast.clamp(-100, 100)) as f32;
    let contrast_factor = (259.0 * (c + 255.0)) / (255.0 * (259.0 - c));
    let bright = (adj.brightness.clamp(-100, 100) as f32) * 1.275; // ±~162 on 0..255
    // Saturation: −100 → fully desaturated, +100 → 2× saturation.
    let sat = 1.0 + (adj.saturation.clamp(-100, 100) as f32) / 100.0;

    for px in buf.rgba.chunks_exact_mut(4) {
        let (mut r, mut g, mut b) = (px[0] as f32, px[1] as f32, px[2] as f32);

        if adj.grayscale {
            let l = 0.299 * r + 0.587 * g + 0.114 * b;
            r = l;
            g = l;
            b = l;
        } else if (sat - 1.0).abs() > f32::EPSILON {
            // Mix each channel toward luma by the saturation factor.
            let l = 0.299 * r + 0.587 * g + 0.114 * b;
            r = l + (r - l) * sat;
            g = l + (g - l) * sat;
            b = l + (b - l) * sat;
        }

        let adj_ch = |v: f32| -> u8 {
            let mut x = v;
            // contrast around mid-gray
            x = contrast_factor * (x - 128.0) + 128.0;
            x += bright;
            x.round().clamp(0.0, 255.0) as u8
        };
        px[0] = adj_ch(r);
        px[1] = adj_ch(g);
        px[2] = adj_ch(b);
        // alpha (px[3]) untouched
    }
}

/// Composite straight-alpha RGBA over an opaque `bg`, making every pixel opaque.
/// Used when the user asks to flatten transparency for *all* formats.
pub fn flatten_in_place(buf: &mut RasterBuffer, bg: [u8; 4]) {
    for px in buf.rgba.chunks_exact_mut(4) {
        let a = px[3] as f32 / 255.0;
        for ch in 0..3 {
            let v = px[ch] as f32 * a + bg[ch] as f32 * (1.0 - a);
            px[ch] = v.round().clamp(0.0, 255.0) as u8;
        }
        px[3] = 255;
    }
}

/// Alpha-blend a watermark overlay onto `base` at the anchor/margin/opacity in
/// `wm`. `overlay` is already scaled to its target size by the engine.
pub fn composite_watermark(base: &mut RasterBuffer, overlay: &WatermarkOverlay, wm: &WatermarkSpec) {
    let ov = &overlay.buf;
    if ov.width == 0 || ov.height == 0 {
        return;
    }
    let margin = ((wm.margin_percent.min(25) as f32 / 100.0) * base.width as f32).round() as i64;
    let bw = base.width as i64;
    let bh = base.height as i64;
    let ow = ov.width as i64;
    let oh = ov.height as i64;

    let (ox, oy) = match wm.anchor {
        WatermarkAnchor::TopLeft => (margin, margin),
        WatermarkAnchor::TopRight => (bw - ow - margin, margin),
        WatermarkAnchor::BottomLeft => (margin, bh - oh - margin),
        WatermarkAnchor::BottomRight => (bw - ow - margin, bh - oh - margin),
        WatermarkAnchor::Center => ((bw - ow) / 2, (bh - oh) / 2),
    };

    let global_alpha = (wm.opacity.clamp(0, 100) as f32) / 100.0;
    if global_alpha <= 0.0 {
        return;
    }

    for row in 0..oh {
        let by = oy + row;
        if by < 0 || by >= bh {
            continue;
        }
        for col in 0..ow {
            let bx = ox + col;
            if bx < 0 || bx >= bw {
                continue;
            }
            let oi = ((row * ow + col) * 4) as usize;
            let a = (ov.rgba[oi + 3] as f32 / 255.0) * global_alpha;
            if a <= 0.0 {
                continue;
            }
            let bi = ((by * bw + bx) * 4) as usize;
            for ch in 0..3 {
                let src = ov.rgba[oi + ch] as f32;
                let dst = base.rgba[bi + ch] as f32;
                base.rgba[bi + ch] = (src * a + dst * (1.0 - a)).round().clamp(0.0, 255.0) as u8;
            }
            // Keep/raise destination alpha so the mark shows on transparent areas.
            let dsta = base.rgba[bi + 3] as f32 / 255.0;
            let outa = a + dsta * (1.0 - a);
            base.rgba[bi + 3] = (outa * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
}

/// Resolve the flatten background to use for a given format. Returns `Some(bg)`
/// when the buffer should be flattened to opaque, or `None` to keep alpha.
/// `format_has_alpha` is whether the *target* format can store transparency.
pub fn flatten_bg(spec: &FlattenSpec, format_has_alpha: bool) -> Option<[u8; 4]> {
    if spec.flatten_all || !format_has_alpha {
        Some(parse_color(spec.background.as_deref()))
    } else {
        None
    }
}

/// Compute the render geometry for an original `ow×oh` image and a [`SizeSpec`].
/// Intentionally free of any image-library types so it can be unit-reasoned about.
pub fn resolve_plan(ow: u32, oh: u32, s: &SizeSpec) -> Plan {
    let ow = ow.max(1);
    let oh = oh.max(1);
    let owf = ow as f64;
    let ohf = oh as f64;

    // 1) Percentage scale wins over explicit dimensions.
    if let Some(pct) = s.scale_percent {
        let mut f = (pct as f64) / 100.0;
        if !s.allow_upscale && f > 1.0 {
            f = 1.0;
        }
        let w = (owf * f).round().max(1.0) as u32;
        let h = (ohf * f).round().max(1.0) as u32;
        return Plan::exact(w, h);
    }

    match (s.width, s.height) {
        // 2) No dimensions: keep original (re-encode / optimize only).
        (None, None) => Plan::exact(ow, oh),

        // 3) One dimension: keep aspect ratio.
        (Some(w), None) => {
            let mut w = w.max(1);
            if !s.allow_upscale && w > ow {
                w = ow;
            }
            let h = ((w as f64) * ohf / owf).round().max(1.0) as u32;
            Plan::exact(w, h)
        }
        (None, Some(h)) => {
            let mut h = h.max(1);
            if !s.allow_upscale && h > oh {
                h = oh;
            }
            let w = ((h as f64) * owf / ohf).round().max(1.0) as u32;
            Plan::exact(w, h)
        }

        // 4) Both dimensions: behavior depends on the resize mode.
        (Some(bw), Some(bh)) => {
            let bw = bw.max(1);
            let bh = bh.max(1);
            let bwf = bw as f64;
            let bhf = bh as f64;
            match s.mode {
                ResizeMode::Stretch => Plan::exact(bw, bh),

                ResizeMode::Fit => {
                    let mut f = (bwf / owf).min(bhf / ohf);
                    if !s.allow_upscale && f > 1.0 {
                        f = 1.0;
                    }
                    let w = (owf * f).round().max(1.0) as u32;
                    let h = (ohf * f).round().max(1.0) as u32;
                    Plan::exact(w, h)
                }

                ResizeMode::Pad => {
                    let mut f = (bwf / owf).min(bhf / ohf);
                    if !s.allow_upscale && f > 1.0 {
                        f = 1.0;
                    }
                    let cw = (owf * f).round().max(1.0) as u32;
                    let ch = (ohf * f).round().max(1.0) as u32;
                    Plan {
                        content_w: cw,
                        content_h: ch,
                        canvas_w: bw,
                        canvas_h: bh,
                        off_x: (bw as i64 - cw as i64) / 2,
                        off_y: (bh as i64 - ch as i64) / 2,
                    }
                }

                ResizeMode::Cover => {
                    let f = (bwf / owf).max(bhf / ohf);
                    // Cover must fill the box; if upscaling is disallowed and the
                    // box is larger than the source, shrink the canvas instead.
                    if !s.allow_upscale && f > 1.0 {
                        let canvas_w = bw.min(ow);
                        let canvas_h = bh.min(oh);
                        return Plan {
                            content_w: ow,
                            content_h: oh,
                            canvas_w,
                            canvas_h,
                            off_x: (canvas_w as i64 - ow as i64) / 2,
                            off_y: (canvas_h as i64 - oh as i64) / 2,
                        };
                    }
                    let cw = (owf * f).round().max(1.0) as u32;
                    let ch = (ohf * f).round().max(1.0) as u32;
                    Plan {
                        content_w: cw,
                        content_h: ch,
                        canvas_w: bw,
                        canvas_h: bh,
                        off_x: (bw as i64 - cw as i64) / 2,
                        off_y: (bh as i64 - ch as i64) / 2,
                    }
                }
            }
        }
    }
}

/// Parse `#rrggbb`, `#rrggbbaa` or `#rgb` into RGBA. Falls back to opaque white.
pub fn parse_color(hex: Option<&str>) -> [u8; 4] {
    let default = [255u8, 255, 255, 255];
    let Some(h) = hex else { return default };
    let h = h.trim().trim_start_matches('#').to_string();
    let parse = |s: &str| u8::from_str_radix(s, 16).ok();

    let attempt = || -> Option<[u8; 4]> {
        match h.len() {
            3 => Some([
                parse(&h[0..1].repeat(2))?,
                parse(&h[1..2].repeat(2))?,
                parse(&h[2..3].repeat(2))?,
                255,
            ]),
            6 => Some([parse(&h[0..2])?, parse(&h[2..4])?, parse(&h[4..6])?, 255]),
            8 => Some([
                parse(&h[0..2])?,
                parse(&h[2..4])?,
                parse(&h[4..6])?,
                parse(&h[6..8])?,
            ]),
            _ => None,
        }
    };
    attempt().unwrap_or(default)
}
