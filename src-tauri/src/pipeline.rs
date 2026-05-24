//! Batch orchestration: expands inputs × sizes × formats, renders, encodes,
//! writes to disk, and streams progress. Engine-agnostic — talks only to the
//! [`ImageEngine`] trait.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use base64::Engine as _;
use rayon::prelude::*;

use crate::engine::{
    apply_adjustments, composite_watermark, flatten_bg, flatten_in_place, parse_color,
    resolve_plan, ImageEngine, RasterBuffer,
};
use crate::filename::{render_filename, NameCtx};
use crate::model::*;

pub fn run_process(
    engine: &dyn ImageEngine,
    req: &ProcessRequest,
    on_progress: &(dyn Fn(ProgressEvent) + Sync),
) -> ProcessSummary {
    let total = req.inputs.len() * req.sizes.len().max(1) * req.formats.len().max(1);
    let counter = AtomicUsize::new(0);
    let seq = AtomicUsize::new(0);
    let results = Mutex::new(Vec::<OutputResult>::with_capacity(total));

    let emit = |r: OutputResult| {
        let current = counter.fetch_add(1, Ordering::SeqCst) + 1;
        on_progress(ProgressEvent {
            job_id: req.job_id.clone(),
            current,
            total,
            label: format!("{} → {} · {}", r.input_name, r.size_label, r.format),
            last_result: Some(r.clone()),
        });
        results.lock().unwrap().push(r);
    };

    // Parallelize across input files; sizes/formats run per-thread so a source
    // is decoded once and resized once per size.
    req.inputs.par_iter().for_each(|input| {
        process_input(engine, req, input, &seq, &emit);
    });

    let mut results = results.into_inner().unwrap();
    results.sort_by(|a, b| {
        a.input_name
            .cmp(&b.input_name)
            .then(a.size_label.cmp(&b.size_label))
            .then(a.format.cmp(&b.format))
    });

    let ok = results.iter().filter(|r| r.status == "ok").count();
    let skipped = results.iter().filter(|r| r.status == "skipped").count();
    let failed = results.iter().filter(|r| r.status == "error").count();

    ProcessSummary {
        job_id: req.job_id.clone(),
        total,
        ok,
        skipped,
        failed,
        results,
    }
}

fn process_input(
    engine: &dyn ImageEngine,
    req: &ProcessRequest,
    input: &ImageInput,
    seq: &AtomicUsize,
    emit: &(dyn Fn(OutputResult) + Sync),
) {
    let stem_path = Path::new(&input.name);
    let stem = stem_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .to_string();
    let origext = stem_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let ext_hint = if origext.is_empty() { None } else { Some(origext.as_str()) };

    let original_bytes = input
        .path
        .as_ref()
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0);

    // A failure helper that marks every remaining combination for this input.
    let fail_all = |message: String| {
        for size in &req.sizes {
            for fmt in &req.formats {
                emit(OutputResult {
                    input_id: input.id.clone(),
                    input_name: input.name.clone(),
                    size_label: size.label.clone(),
                    format: fmt.format.name().to_string(),
                    options: fmt.options_summary(),
                    output_path: String::new(),
                    width: 0,
                    height: 0,
                    bytes: 0,
                    original_bytes,
                    status: "error".into(),
                    error: Some(message.clone()),
                });
            }
        }
    };

    let bytes = match read_input_bytes(input) {
        Ok(b) => b,
        Err(e) => return fail_all(format!("read failed: {e}")),
    };
    let original_bytes = if original_bytes == 0 { bytes.len() as u64 } else { original_bytes };

    let source = match engine.load(&bytes, ext_hint) {
        Ok(s) => s,
        Err(e) => return fail_all(format!("decode failed: {e}")),
    };
    let (ow, oh) = source.dimensions();

    for size in &req.sizes {
        let plan = resolve_plan(ow, oh, size);
        let bg = parse_color(size.background.as_deref());
        let mut rendered = match engine.render(source.as_ref(), &plan, bg) {
            Ok(r) => r,
            Err(e) => {
                for fmt in &req.formats {
                    emit(err_result(input, size, fmt, original_bytes, format!("resize failed: {e}")));
                }
                continue;
            }
        };
        let (out_w, out_h) = (rendered.width, rendered.height);

        // Batch-wide effects that don't depend on the output format are applied
        // once per size (then shared across every format for this size).
        apply_adjustments(&mut rendered, &req.options.adjustments);
        if req.options.watermark.is_active() {
            // A failed watermark must not abort the whole output — just skip it.
            match engine.render_watermark(&req.options.watermark, out_w, out_h) {
                Ok(Some(overlay)) => {
                    composite_watermark(&mut rendered, &overlay, &req.options.watermark)
                }
                Ok(None) => {}
                Err(_) => {}
            }
        }

        for fmt in &req.formats {
            let index = seq.fetch_add(1, Ordering::SeqCst) + 1;
            let result = encode_and_write(
                engine, &rendered, input, size, fmt, &req.output, &req.options.flatten, &stem,
                &origext, ow, oh, out_w, out_h, original_bytes, index,
            );
            emit(result);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn encode_and_write(
    engine: &dyn ImageEngine,
    rendered: &RasterBuffer,
    input: &ImageInput,
    size: &SizeSpec,
    fmt: &FormatSpec,
    output: &OutputSpec,
    flatten: &FlattenSpec,
    stem: &str,
    origext: &str,
    ow: u32,
    oh: u32,
    out_w: u32,
    out_h: u32,
    original_bytes: u64,
    index: usize,
) -> OutputResult {
    let mk_err = |msg: String| err_result(input, size, fmt, original_bytes, msg);

    let ctx = NameCtx {
        name: stem,
        origext,
        ext: fmt.format.ext(),
        width: out_w,
        height: out_h,
        orig_width: ow,
        orig_height: oh,
        format: fmt.format.name(),
        quality: fmt.quality.unwrap_or(82),
        effort: fmt.effort,
        png_level: fmt.png_level,
        lossless: fmt.lossless,
        size_label: &size.label,
        index,
    };

    let base_path = match build_output_path(input, output, fmt, &ctx) {
        Ok(p) => p,
        Err(e) => return mk_err(e.to_string()),
    };

    let force_overwrite = matches!(output.mode, OutputMode::Replace);
    let final_path = match resolve_conflict(base_path, output.on_conflict, force_overwrite) {
        Some(p) => p,
        None => {
            return OutputResult {
                status: "skipped".into(),
                ..err_result(input, size, fmt, original_bytes, "exists, skipped".into())
            }
        }
    };

    // Per-format transparency handling. `flatten_bg` returns Some(bg) when this
    // output must be opaque (either the user forced flatten-all, or the format
    // can't store alpha). We only clone the buffer when we actually mutate it.
    let flattened;
    let to_encode: &RasterBuffer = match flatten_bg(flatten, fmt.format.supports_alpha()) {
        Some(bg) => {
            let mut b = rendered.clone();
            flatten_in_place(&mut b, bg);
            flattened = b;
            &flattened
        }
        None => rendered,
    };

    let data = match encode_with_target(engine, to_encode, fmt) {
        Ok(d) => d,
        Err(e) => return mk_err(format!("encode failed: {e}")),
    };

    if let Some(parent) = final_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return mk_err(format!("mkdir failed: {e}"));
        }
    }
    if let Err(e) = std::fs::write(&final_path, &data) {
        return mk_err(format!("write failed: {e}"));
    }

    OutputResult {
        input_id: input.id.clone(),
        input_name: input.name.clone(),
        size_label: size.label.clone(),
        format: fmt.format.name().to_string(),
        options: fmt.options_summary(),
        output_path: final_path.to_string_lossy().to_string(),
        width: out_w,
        height: out_h,
        bytes: data.len() as u64,
        original_bytes,
        status: "ok".into(),
        error: None,
    }
}

/// Encode `buf` as `fmt`. When `fmt.max_kb` is set on a lossy, quality-bearing
/// format, binary-search the quality so the result lands at or under the budget;
/// otherwise encode once at the configured quality.
fn encode_with_target(
    engine: &dyn ImageEngine,
    buf: &RasterBuffer,
    fmt: &FormatSpec,
) -> Result<Vec<u8>> {
    let Some(max_kb) = fmt.max_kb else {
        return engine.encode(buf, fmt);
    };
    if max_kb == 0 || fmt.lossless || !fmt.has_quality_knob() {
        return engine.encode(buf, fmt);
    }

    let budget = (max_kb as u64) * 1024;
    let mut lo: u8 = 1;
    let mut hi: u8 = 100;
    // Best (largest) encoding that still fits the budget, and a fallback (the
    // smallest we produced) in case nothing fits.
    let mut best_ok: Option<Vec<u8>> = None;
    let mut smallest: Option<Vec<u8>> = None;

    // ~7 iterations covers the full 1..=100 range.
    for _ in 0..7 {
        if lo > hi {
            break;
        }
        let mid = lo + (hi - lo) / 2;
        let trial = FormatSpec {
            quality: Some(mid),
            ..fmt.clone()
        };
        let data = engine.encode(buf, &trial)?;
        let len = data.len() as u64;

        match &smallest {
            Some(s) if (s.len() as u64) <= len => {}
            _ => smallest = Some(data.clone()),
        }

        if len <= budget {
            best_ok = Some(data);
            if mid == 100 {
                break;
            }
            lo = mid + 1; // try for higher quality while still under budget
        } else {
            if mid == 1 {
                break;
            }
            hi = mid - 1; // too big — drop quality
        }
    }

    Ok(best_ok.or(smallest).unwrap_or_default())
}

fn err_result(
    input: &ImageInput,
    size: &SizeSpec,
    fmt: &FormatSpec,
    original_bytes: u64,
    msg: String,
) -> OutputResult {
    OutputResult {
        input_id: input.id.clone(),
        input_name: input.name.clone(),
        size_label: size.label.clone(),
        format: fmt.format.name().to_string(),
        options: fmt.options_summary(),
        output_path: String::new(),
        width: 0,
        height: 0,
        bytes: 0,
        original_bytes,
        status: "error".into(),
        error: Some(msg),
    }
}

fn read_input_bytes(input: &ImageInput) -> Result<Vec<u8>> {
    // Prefer in-memory bytes (annotated / pasted) so edits win; the path is
    // still used for output location and naming.
    if let Some(b) = &input.bytes_base64 {
        let raw = b.rsplit(',').next().unwrap_or(b); // strip optional data: URL prefix
        Ok(base64::engine::general_purpose::STANDARD.decode(raw.trim())?)
    } else if let Some(p) = &input.path {
        Ok(std::fs::read(p)?)
    } else {
        Err(anyhow!("input has neither a file path nor image bytes"))
    }
}

fn build_output_path(
    input: &ImageInput,
    output: &OutputSpec,
    fmt: &FormatSpec,
    ctx: &NameCtx,
) -> Result<PathBuf> {
    match output.mode {
        OutputMode::Replace => {
            let src = input
                .path
                .as_ref()
                .ok_or_else(|| anyhow!("Replace mode needs a source file on disk"))?;
            let p = Path::new(src);
            let dir = p.parent().unwrap_or_else(|| Path::new("."));
            Ok(dir.join(format!("{}.{}", ctx.name, fmt.format.ext())))
        }
        OutputMode::SameFolder => {
            let src = input.path.as_ref().ok_or_else(|| {
                anyhow!("'Same folder' needs a source file on disk; choose a custom folder for pasted images")
            })?;
            let dir = Path::new(src).parent().unwrap_or_else(|| Path::new("."));
            Ok(dir.join(render_filename(&output.filename_template, ctx)))
        }
        OutputMode::CustomFolder => {
            let dir = output
                .custom_folder
                .as_ref()
                .filter(|d| !d.trim().is_empty())
                .ok_or_else(|| anyhow!("No output folder selected"))?;
            Ok(Path::new(dir).join(render_filename(&output.filename_template, ctx)))
        }
    }
}

fn resolve_conflict(path: PathBuf, policy: ConflictPolicy, force: bool) -> Option<PathBuf> {
    if force || !path.exists() {
        return Some(path);
    }
    match policy {
        ConflictPolicy::Overwrite => Some(path),
        ConflictPolicy::Skip => None,
        ConflictPolicy::Rename => {
            let dir = path.parent().map(Path::to_path_buf).unwrap_or_default();
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("output")
                .to_string();
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|e| format!(".{e}"))
                .unwrap_or_default();
            for n in 1..10_000 {
                let candidate = dir.join(format!("{stem} ({n}){ext}"));
                if !candidate.exists() {
                    return Some(candidate);
                }
            }
            None
        }
    }
}
