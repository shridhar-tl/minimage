//! Default image engine.
//!
//! Decoding/encoding/resizing via `image`; SVG via `resvg`; AVIF via `ravif`;
//! WebP via `webp`; lossless PNG optimization via `oxipng`. All of this is an
//! implementation detail hidden behind [`ImageEngine`].

use std::any::Any;
use std::io::Cursor;

use anyhow::{anyhow, Context, Result};
use base64::Engine as _;
use image::{imageops::FilterType, DynamicImage, ExtendedColorType, ImageFormat, Rgba, RgbaImage};
use resvg::{tiny_skia, usvg};

use crate::engine::{
    parse_color, ImageEngine, LoadedImage, Plan, RasterBuffer, WatermarkOverlay,
};
use crate::model::{FormatSpec, OutputFormat, ProbeInfo, WatermarkKind, WatermarkSpec};

/// Decoded source: a raster bitmap, or a parsed vector tree (rendered per size).
enum Src {
    Raster(DynamicImage),
    Vector { tree: usvg::Tree, w: f32, h: f32 },
}

pub struct ImageRsSource {
    src: Src,
    dims: (u32, u32),
}

impl LoadedImage for ImageRsSource {
    fn dimensions(&self) -> (u32, u32) {
        self.dims
    }
    fn as_any(&self) -> &dyn Any {
        self
    }
}

pub struct ImageRsEngine;

fn looks_like_svg(bytes: &[u8], ext_hint: Option<&str>) -> bool {
    if matches!(ext_hint, Some(e) if e.eq_ignore_ascii_case("svg")) {
        return true;
    }
    let head_len = bytes.len().min(1024);
    let head = &bytes[..head_len];
    // Cheap substring scan for "<svg" within the head.
    head.windows(4).any(|w| w.eq_ignore_ascii_case(b"<svg"))
}

fn parse_svg(bytes: &[u8], load_fonts: bool) -> Result<usvg::Tree> {
    let mut opt = usvg::Options::default();
    if load_fonts {
        opt.fontdb_mut().load_system_fonts();
    }
    let tree = usvg::Tree::from_data(bytes, &opt).map_err(|e| anyhow!("invalid SVG: {e}"))?;
    Ok(tree)
}

impl ImageRsEngine {
    /// Build a content-sized RgbaImage (before framing) for a loaded source.
    fn render_content(src: &ImageRsSource, plan: &Plan) -> Result<RgbaImage> {
        match &src.src {
            Src::Raster(img) => Ok(img
                .resize_exact(plan.content_w, plan.content_h, FilterType::Lanczos3)
                .to_rgba8()),
            Src::Vector { tree, w, h } => {
                let mut pixmap = tiny_skia::Pixmap::new(plan.content_w, plan.content_h)
                    .ok_or_else(|| anyhow!("could not allocate {}x{} pixmap", plan.content_w, plan.content_h))?;
                let sx = plan.content_w as f32 / w.max(1.0);
                let sy = plan.content_h as f32 / h.max(1.0);
                let ts = tiny_skia::Transform::from_scale(sx, sy);
                resvg::render(tree, ts, &mut pixmap.as_mut());
                // encode_png unpremultiplies alpha for us; decode back into `image`.
                let png = pixmap.encode_png().context("rasterizing SVG")?;
                Ok(image::load_from_memory(&png)?.to_rgba8())
            }
        }
    }
}

impl ImageEngine for ImageRsEngine {
    fn probe(&self, bytes: &[u8], ext_hint: Option<&str>) -> Result<ProbeInfo> {
        if looks_like_svg(bytes, ext_hint) {
            let tree = parse_svg(bytes, false)?;
            let size = tree.size();
            return Ok(ProbeInfo {
                width: size.width().ceil() as u32,
                height: size.height().ceil() as u32,
                format: "svg".into(),
            });
        }
        let reader = image::ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .context("reading image header")?;
        let format = reader
            .format()
            .map(|f| format!("{f:?}").to_lowercase())
            .unwrap_or_else(|| "unknown".into());
        let (width, height) = reader.into_dimensions().context("reading dimensions")?;
        Ok(ProbeInfo { width, height, format })
    }

    fn load(&self, bytes: &[u8], ext_hint: Option<&str>) -> Result<Box<dyn LoadedImage>> {
        if looks_like_svg(bytes, ext_hint) {
            let tree = parse_svg(bytes, true)?;
            let size = tree.size();
            let (w, h) = (size.width(), size.height());
            return Ok(Box::new(ImageRsSource {
                src: Src::Vector { tree, w, h },
                dims: (w.ceil() as u32, h.ceil() as u32),
            }));
        }
        let img = image::load_from_memory(bytes).context("decoding image")?;
        let dims = (img.width(), img.height());
        Ok(Box::new(ImageRsSource {
            src: Src::Raster(img),
            dims,
        }))
    }

    fn render(&self, src: &dyn LoadedImage, plan: &Plan, bg: [u8; 4]) -> Result<RasterBuffer> {
        let src = src
            .as_any()
            .downcast_ref::<ImageRsSource>()
            .ok_or_else(|| anyhow!("source was produced by a different engine"))?;

        let content = Self::render_content(src, plan)?;

        // Frame the content onto the canvas (pad or center-crop) when needed.
        let framed = if plan.canvas_w == plan.content_w
            && plan.canvas_h == plan.content_h
            && plan.off_x == 0
            && plan.off_y == 0
        {
            content
        } else {
            let mut canvas = RgbaImage::from_pixel(plan.canvas_w, plan.canvas_h, Rgba(bg));
            image::imageops::overlay(&mut canvas, &content, plan.off_x, plan.off_y);
            canvas
        };

        Ok(RasterBuffer {
            width: framed.width(),
            height: framed.height(),
            rgba: framed.into_raw(),
        })
    }

    fn encode(&self, buf: &RasterBuffer, fmt: &FormatSpec) -> Result<Vec<u8>> {
        let (w, h) = (buf.width, buf.height);
        let quality = fmt.quality.unwrap_or(82).clamp(1, 100);

        match fmt.format {
            OutputFormat::Png => encode_png(buf, fmt),

            OutputFormat::Jpeg => {
                // JPEG has no alpha: flatten transparent pixels onto white.
                let rgb = flatten_to_rgb(buf, [255, 255, 255]);
                let mut out = Vec::new();
                let mut enc =
                    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
                enc.encode(&rgb, w, h, ExtendedColorType::Rgb8)
                    .context("encoding JPEG")?;
                Ok(out)
            }

            OutputFormat::Webp => encode_webp(buf, fmt, quality),

            OutputFormat::Avif => {
                let pixels: Vec<ravif::RGBA8> = buf
                    .rgba
                    .chunks_exact(4)
                    .map(|c| ravif::RGBA8::new(c[0], c[1], c[2], c[3]))
                    .collect();
                let q = if fmt.lossless { 100.0 } else { quality as f32 };
                let speed = fmt
                    .effort
                    .map(|e| (10u8.saturating_sub(e.clamp(1, 9))).clamp(1, 10))
                    .unwrap_or(6);
                let res = ravif::Encoder::new()
                    .with_quality(q)
                    .with_speed(speed)
                    .encode_rgba(ravif::Img::new(pixels.as_slice(), w as usize, h as usize))
                    .context("encoding AVIF")?;
                Ok(res.avif_file)
            }

            OutputFormat::Gif | OutputFormat::Bmp | OutputFormat::Tiff | OutputFormat::Ico => {
                let mut dynimg = to_dynamic(buf)?;
                let target = match fmt.format {
                    OutputFormat::Gif => ImageFormat::Gif,
                    OutputFormat::Bmp => ImageFormat::Bmp,
                    OutputFormat::Tiff => ImageFormat::Tiff,
                    OutputFormat::Ico => ImageFormat::Ico,
                    _ => unreachable!(),
                };
                // ICO is capped at 256x256.
                if matches!(fmt.format, OutputFormat::Ico) && (w > 256 || h > 256) {
                    dynimg = dynimg.resize(256, 256, FilterType::Lanczos3);
                }
                let mut out = Vec::new();
                dynimg
                    .write_to(&mut Cursor::new(&mut out), target)
                    .with_context(|| format!("encoding {}", fmt.format.name()))?;
                Ok(out)
            }
        }
    }

    fn render_watermark(
        &self,
        wm: &WatermarkSpec,
        out_w: u32,
        out_h: u32,
    ) -> Result<Option<WatermarkOverlay>> {
        if !wm.is_active() || out_w == 0 || out_h == 0 {
            return Ok(None);
        }
        // Target width for the mark, as a % of the output width (clamped so it
        // can never exceed the canvas).
        let scale = wm.scale_percent.clamp(1, 100) as f32 / 100.0;
        let target_w = ((out_w as f32 * scale).round() as u32)
            .clamp(1, out_w)
            .max(1);

        let buf = match wm.kind {
            WatermarkKind::Image => render_image_watermark(wm, target_w)?,
            WatermarkKind::Text => render_text_watermark(wm, target_w)?,
        };
        match buf {
            Some(b) => Ok(Some(WatermarkOverlay { buf: b })),
            None => Ok(None),
        }
    }
}

/// Decode the user's overlay image and resize it to `target_w` wide (keeping
/// aspect). Returns straight-alpha RGBA.
fn render_image_watermark(wm: &WatermarkSpec, target_w: u32) -> Result<Option<RasterBuffer>> {
    let Some(raw) = wm.image_base64.as_deref() else {
        return Ok(None);
    };
    let raw = raw.rsplit(',').next().unwrap_or(raw).trim();
    if raw.is_empty() {
        return Ok(None);
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw)
        .context("decoding watermark image")?;
    let img = image::load_from_memory(&bytes).context("reading watermark image")?;
    let (iw, ih) = (img.width().max(1), img.height().max(1));
    let target_h = ((target_w as f32) * ih as f32 / iw as f32).round().max(1.0) as u32;
    let resized = img.resize_exact(target_w, target_h, FilterType::Lanczos3).to_rgba8();
    Ok(Some(RasterBuffer {
        width: resized.width(),
        height: resized.height(),
        rgba: resized.into_raw(),
    }))
}

/// Rasterize the watermark text via the existing resvg/usvg pipeline (system
/// fonts), so no font crate or bundled font file is needed. The SVG is sized so
/// the text block is `target_w` px wide.
fn render_text_watermark(wm: &WatermarkSpec, target_w: u32) -> Result<Option<RasterBuffer>> {
    let text = wm.text.trim();
    if text.is_empty() {
        return Ok(None);
    }
    let color = wm.color.as_deref().unwrap_or("#ffffff");
    let [r, g, b, _] = parse_color(Some(color));
    let fill = format!("#{r:02x}{g:02x}{b:02x}");

    // Lay the text out at a nominal font size, measure via the rendered tree,
    // then scale the pixmap so the text block ends up `target_w` wide.
    let font_px = 64.0_f32;
    // A drop shadow keeps light text legible on light images.
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="{h}">
<text x="0" y="{baseline}" font-family="Arial, 'Helvetica', sans-serif" font-size="{fs}" font-weight="700" fill="{fill}" stroke="#00000055" stroke-width="{stroke}" paint-order="stroke">{text}</text>
</svg>"##,
        h = (font_px * 1.6) as u32,
        baseline = (font_px * 1.2) as u32,
        fs = font_px,
        fill = fill,
        stroke = font_px * 0.03,
        text = xml_escape(text),
    );

    let tree = parse_svg(svg.as_bytes(), true)?;
    // Measure the actual ink bounds of the text so we can crop tightly.
    let node_bbox = tree.root().abs_layer_bounding_box();
    let (tw, th) = (node_bbox.width().max(1.0), node_bbox.height().max(1.0));
    let bx = node_bbox.x();
    let by = node_bbox.y();

    let scale = target_w as f32 / tw;
    let px_w = (tw * scale).round().max(1.0) as u32;
    let px_h = (th * scale).round().max(1.0) as u32;

    let mut pixmap = tiny_skia::Pixmap::new(px_w, px_h)
        .ok_or_else(|| anyhow!("could not allocate {px_w}x{px_h} watermark pixmap"))?;
    // Translate so the text's top-left ink corner maps to (0,0), then scale.
    let ts = tiny_skia::Transform::from_scale(scale, scale)
        .pre_translate(-bx, -by);
    resvg::render(&tree, ts, &mut pixmap.as_mut());

    let png = pixmap.encode_png().context("rasterizing watermark text")?;
    let rgba = image::load_from_memory(&png)?.to_rgba8();
    Ok(Some(RasterBuffer {
        width: rgba.width(),
        height: rgba.height(),
        rgba: rgba.into_raw(),
    }))
}

/// Minimal XML escaping for text injected into the SVG above.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// PNG: lossy palette quantization (TinyPNG-style, visually lossless) by default;
/// strict lossless when `fmt.lossless` is set.
fn encode_png(buf: &RasterBuffer, fmt: &FormatSpec) -> Result<Vec<u8>> {
    let level = fmt.png_level.unwrap_or(2).min(6);
    if fmt.lossless {
        return png_lossless(buf, level);
    }
    let quality = fmt.quality.unwrap_or(80).clamp(1, 100);
    quantize_png(buf, quality, level).or_else(|_| png_lossless(buf, level))
}

fn png_lossless(buf: &RasterBuffer, level: u8) -> Result<Vec<u8>> {
    let dynimg = to_dynamic(buf)?;
    let mut raw = Vec::new();
    dynimg
        .write_to(&mut Cursor::new(&mut raw), ImageFormat::Png)
        .context("encoding PNG")?;
    let opts = oxipng::Options::from_preset(level);
    Ok(oxipng::optimize_from_memory(&raw, &opts).unwrap_or(raw))
}

/// libimagequant (the pngquant / TinyPNG engine) → indexed PNG → oxipng.
fn quantize_png(buf: &RasterBuffer, quality: u8, level: u8) -> Result<Vec<u8>> {
    let (w, h) = (buf.width, buf.height);
    let pixels: Vec<imagequant::RGBA> = buf
        .rgba
        .chunks_exact(4)
        .map(|c| imagequant::RGBA::new(c[0], c[1], c[2], c[3]))
        .collect();

    let mut liq = imagequant::new();
    liq.set_speed(4).map_err(|e| anyhow!("imagequant speed: {e:?}"))?;
    liq.set_quality(0, quality)
        .map_err(|e| anyhow!("imagequant quality: {e:?}"))?;

    let mut img = liq
        .new_image(pixels.as_slice(), w as usize, h as usize, 0.0)
        .map_err(|e| anyhow!("imagequant image: {e:?}"))?;
    let mut res = liq
        .quantize(&mut img)
        .map_err(|e| anyhow!("imagequant quantize: {e:?}"))?;
    let _ = res.set_dithering_level(1.0);
    let (palette, indexed) = res
        .remapped(&mut img)
        .map_err(|e| anyhow!("imagequant remap: {e:?}"))?;

    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Indexed);
        enc.set_depth(png::BitDepth::Eight);
        let mut plte = Vec::with_capacity(palette.len() * 3);
        let mut trns = Vec::with_capacity(palette.len());
        for c in &palette {
            plte.push(c.r);
            plte.push(c.g);
            plte.push(c.b);
            trns.push(c.a);
        }
        enc.set_palette(plte);
        if trns.iter().any(|&a| a < 255) {
            enc.set_trns(trns);
        }
        let mut writer = enc.write_header().context("png header")?;
        writer.write_image_data(&indexed).context("png data")?;
        writer.finish().context("png finish")?;
    }

    let opts = oxipng::Options::from_preset(level);
    Ok(oxipng::optimize_from_memory(&out, &opts).unwrap_or(out))
}

#[cfg(feature = "webp-lossy")]
fn encode_webp(buf: &RasterBuffer, fmt: &FormatSpec, quality: u8) -> Result<Vec<u8>> {
    let encoder = webp::Encoder::from_rgba(&buf.rgba, buf.width, buf.height);
    let mem = if fmt.lossless {
        encoder.encode_lossless()
    } else {
        encoder.encode(quality as f32)
    };
    Ok(mem.to_vec())
}

#[cfg(not(feature = "webp-lossy"))]
fn encode_webp(buf: &RasterBuffer, _fmt: &FormatSpec, _quality: u8) -> Result<Vec<u8>> {
    // Pure-Rust fallback (no native libwebp): lossless WebP via the image crate.
    let dynimg = to_dynamic(buf)?;
    let mut out = Vec::new();
    dynimg
        .write_to(&mut Cursor::new(&mut out), ImageFormat::WebP)
        .context("encoding WebP")?;
    Ok(out)
}

fn to_dynamic(buf: &RasterBuffer) -> Result<DynamicImage> {
    let img = RgbaImage::from_raw(buf.width, buf.height, buf.rgba.clone())
        .ok_or_else(|| anyhow!("raster buffer size mismatch"))?;
    Ok(DynamicImage::ImageRgba8(img))
}

/// Composite straight-alpha RGBA over an opaque background, dropping alpha.
fn flatten_to_rgb(buf: &RasterBuffer, bg: [u8; 3]) -> Vec<u8> {
    let mut out = Vec::with_capacity((buf.width * buf.height * 3) as usize);
    for px in buf.rgba.chunks_exact(4) {
        let a = px[3] as f32 / 255.0;
        for ch in 0..3 {
            let v = px[ch] as f32 * a + bg[ch] as f32 * (1.0 - a);
            out.push(v.round().clamp(0.0, 255.0) as u8);
        }
    }
    out
}
