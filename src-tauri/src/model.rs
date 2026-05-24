//! Serializable data contract shared with the frontend.
//!
//! Every type here is the wire format between the TypeScript `ProcessorBackend`
//! interface and the Rust commands. Field names are camelCase to match TS.

use serde::{Deserialize, Serialize};

/// A single image to process. Either a real file on disk (`path`) or an
/// in-memory image (`bytesBase64`) produced by paste / annotation.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInput {
    pub id: String,
    /// Absolute path of the source file, when it exists on disk.
    pub path: Option<String>,
    /// Base64 (optionally a `data:` URL) for in-memory sources.
    pub bytes_base64: Option<String>,
    /// File name *with* extension, used by the `{name}` / `{origext}` tokens.
    pub name: String,
}

/// How an image is fitted into a requested box.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ResizeMode {
    /// Scale to fit *inside* the box, keep aspect ratio (no crop, no pad).
    #[default]
    Fit,
    /// Scale to fill the box, keep aspect ratio, center-crop the overflow.
    Cover,
    /// Scale to exactly the box, ignoring aspect ratio (may distort).
    Stretch,
    /// Like Fit, but pad to the exact box with the background color.
    Pad,
}

/// One row of the size matrix.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeSpec {
    pub id: String,
    #[serde(default)]
    pub label: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// If set, scales relative to the original size and ignores width/height.
    pub scale_percent: Option<f32>,
    #[serde(default)]
    pub mode: ResizeMode,
    #[serde(default)]
    pub allow_upscale: bool,
    /// Background used for Pad and for flattening alpha into opaque formats.
    pub background: Option<String>,
}

/// Output container format.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Webp,
    Avif,
    Jpeg,
    Png,
    Gif,
    Bmp,
    Tiff,
    Ico,
}

impl OutputFormat {
    pub fn ext(self) -> &'static str {
        match self {
            OutputFormat::Webp => "webp",
            OutputFormat::Avif => "avif",
            OutputFormat::Jpeg => "jpg",
            OutputFormat::Png => "png",
            OutputFormat::Gif => "gif",
            OutputFormat::Bmp => "bmp",
            OutputFormat::Tiff => "tiff",
            OutputFormat::Ico => "ico",
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            OutputFormat::Webp => "webp",
            OutputFormat::Avif => "avif",
            OutputFormat::Jpeg => "jpeg",
            OutputFormat::Png => "png",
            OutputFormat::Gif => "gif",
            OutputFormat::Bmp => "bmp",
            OutputFormat::Tiff => "tiff",
            OutputFormat::Ico => "ico",
        }
    }
    /// Whether the format keeps an alpha channel.
    pub fn supports_alpha(self) -> bool {
        matches!(
            self,
            OutputFormat::Webp | OutputFormat::Avif | OutputFormat::Png | OutputFormat::Ico | OutputFormat::Tiff
        )
    }
}

/// One column of the format matrix.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatSpec {
    pub id: String,
    pub format: OutputFormat,
    /// Lossy quality 1..=100 (ignored when `lossless`).
    pub quality: Option<u8>,
    #[serde(default)]
    pub lossless: bool,
    /// PNG: oxipng preset level 0..=6.
    pub png_level: Option<u8>,
    /// AVIF/WebP: encoding effort 1..=9 (higher = smaller/slower).
    pub effort: Option<u8>,
    /// Target file-size budget in KB. When set, quality is auto-tuned (binary
    /// search) so the encoded output lands at or under this size.
    #[serde(default)]
    pub max_kb: Option<u32>,
}

impl FormatSpec {
    /// Whether this format has a lossy quality knob that target-size can tune.
    pub fn has_quality_knob(&self) -> bool {
        matches!(
            self.format,
            OutputFormat::Jpeg | OutputFormat::Webp | OutputFormat::Avif
        ) || (matches!(self.format, OutputFormat::Png) && !self.lossless)
    }

    /// A short, human-readable summary of the settings that actually affected
    /// the output for this format — shown in the results table.
    pub fn options_summary(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        match self.format {
            OutputFormat::Png => {
                if let Some(l) = self.png_level {
                    parts.push(format!("compression {l}"));
                }
            }
            OutputFormat::Webp | OutputFormat::Avif => {
                if self.lossless {
                    parts.push("lossless".into());
                } else {
                    if let Some(q) = self.quality {
                        parts.push(format!("quality {q}"));
                    }
                    if let Some(e) = self.effort {
                        parts.push(format!("effort {e}"));
                    }
                }
            }
            OutputFormat::Jpeg => {
                if let Some(q) = self.quality {
                    parts.push(format!("quality {q}"));
                }
            }
            // GIF / BMP / TIFF / ICO have no user-tunable knobs here.
            _ => {}
        }
        if self.max_kb.is_some() && self.has_quality_knob() && !self.lossless {
            parts.push(format!("≤{} KB", self.max_kb.unwrap()));
        }
        if parts.is_empty() {
            "default".into()
        } else {
            parts.join(" · ")
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OutputMode {
    /// Overwrite the original files in place (single size × format only).
    Replace,
    /// Write next to each source file.
    SameFolder,
    /// Write into a chosen folder (template may contain `/` for subfolders).
    CustomFolder,
}

#[derive(Debug, Clone, Copy, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConflictPolicy {
    Overwrite,
    Skip,
    #[default]
    Rename,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputSpec {
    pub mode: OutputMode,
    pub custom_folder: Option<String>,
    /// e.g. `{name}_{width}x{height}.{ext}` — may include `/` for subfolders.
    pub filename_template: String,
    #[serde(default)]
    pub on_conflict: ConflictPolicy,
}

/// Where a watermark sits on the image.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum WatermarkAnchor {
    TopLeft,
    TopRight,
    BottomLeft,
    #[default]
    BottomRight,
    Center,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum WatermarkKind {
    #[default]
    Text,
    Image,
}

/// Brightness/contrast/saturation/grayscale applied to every output.
#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Adjustments {
    #[serde(default)]
    pub brightness: i32,
    #[serde(default)]
    pub contrast: i32,
    #[serde(default)]
    pub saturation: i32,
    #[serde(default)]
    pub grayscale: bool,
}

impl Adjustments {
    /// True when nothing would change the pixels (lets the pipeline skip work).
    pub fn is_identity(&self) -> bool {
        self.brightness == 0 && self.contrast == 0 && self.saturation == 0 && !self.grayscale
    }
}

/// How transparency is handled when exporting.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FlattenSpec {
    /// Force a solid background behind transparency for *every* format.
    #[serde(default)]
    pub flatten_all: bool,
    /// Background color used when flattening (hex). Defaults to white.
    #[serde(default)]
    pub background: Option<String>,
}

/// A logo or text stamp composited onto every output.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkSpec {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub kind: WatermarkKind,
    #[serde(default)]
    pub text: String,
    /// Base64/data-URL of the overlay image (kind = Image).
    #[serde(default)]
    pub image_base64: Option<String>,
    #[serde(default)]
    pub anchor: WatermarkAnchor,
    /// 1..=100.
    #[serde(default)]
    pub opacity: u8,
    /// Watermark width as a % of the output width (1..=100).
    #[serde(default)]
    pub scale_percent: u8,
    /// Inset from the chosen edge, as a % of the output width (0..=25).
    #[serde(default)]
    pub margin_percent: u8,
    /// Text color (hex), kind = Text.
    #[serde(default)]
    pub color: Option<String>,
}

impl WatermarkSpec {
    /// Whether this watermark would actually draw anything.
    pub fn is_active(&self) -> bool {
        if !self.enabled {
            return false;
        }
        match self.kind {
            WatermarkKind::Text => !self.text.trim().is_empty(),
            WatermarkKind::Image => self.image_base64.as_deref().is_some_and(|s| !s.is_empty()),
        }
    }
}

/// Batch-wide effects applied to every output (after resize, before encode).
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    #[serde(default)]
    pub adjustments: Adjustments,
    #[serde(default)]
    pub flatten: FlattenSpec,
    #[serde(default)]
    pub watermark: WatermarkSpec,
}

/// A full batch request: every input is processed against every size × format.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRequest {
    pub job_id: String,
    pub inputs: Vec<ImageInput>,
    pub sizes: Vec<SizeSpec>,
    pub formats: Vec<FormatSpec>,
    pub output: OutputSpec,
    /// Batch-wide effects. Defaults to "no effects" when absent.
    #[serde(default)]
    pub options: ProcessOptions,
}

/// Lightweight probe result for the intake grid.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFileEntry {
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_bytes: u64,
}

/// Width/height/format probe.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
}

/// One produced output (or a failure for one combination).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputResult {
    pub input_id: String,
    pub input_name: String,
    pub size_label: String,
    pub format: String,
    /// Human-readable summary of the encoding settings used (e.g. "q80 · effort4"),
    /// so results show *why* a given file came out the size it did.
    pub options: String,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
    pub original_bytes: u64,
    /// "ok" | "skipped" | "error"
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSummary {
    pub job_id: String,
    pub total: usize,
    pub ok: usize,
    pub skipped: usize,
    pub failed: usize,
    pub results: Vec<OutputResult>,
}

/// Streamed to the frontend as the batch runs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub job_id: String,
    pub current: usize,
    pub total: usize,
    pub label: String,
    pub last_result: Option<OutputResult>,
}
