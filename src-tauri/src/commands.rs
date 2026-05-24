//! Tauri command glue. Thin wrappers that move work onto a blocking thread and
//! delegate to the engine + pipeline. The frontend only ever sees these.

use std::path::Path;
use std::sync::Arc;

use base64::Engine as _;
use tauri::{AppHandle, Emitter, State};

use crate::engine::{resolve_plan, ImageEngine};
use crate::model::*;
use crate::pipeline::run_process;

/// Holds the active engine implementation behind the trait object.
pub struct EngineState(pub Arc<dyn ImageEngine>);

const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif", "ico", "avif", "svg",
];

fn ext_of(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
}

fn read_bytes(input: &ImageInput) -> anyhow::Result<Vec<u8>> {
    // Prefer in-memory bytes (annotated / pasted) over the on-disk file.
    if let Some(b) = &input.bytes_base64 {
        let raw = b.rsplit(',').next().unwrap_or(b);
        Ok(base64::engine::general_purpose::STANDARD.decode(raw.trim())?)
    } else if let Some(p) = &input.path {
        Ok(std::fs::read(p)?)
    } else {
        anyhow::bail!("input has neither a file path nor image bytes")
    }
}

/// Expand a list of files/folders into image entries with dimensions.
#[tauri::command]
pub async fn inspect_paths(
    state: State<'_, EngineState>,
    paths: Vec<String>,
    recursive: bool,
) -> Result<Vec<ImageFileEntry>, String> {
    let engine = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut entries = Vec::new();
        for p in paths {
            collect_path(engine.as_ref(), Path::new(&p), recursive, &mut entries);
        }
        entries
    })
    .await
    .map_err(|e| e.to_string())
}

fn collect_path(engine: &dyn ImageEngine, path: &Path, recursive: bool, out: &mut Vec<ImageFileEntry>) {
    if path.is_dir() {
        if let Ok(rd) = std::fs::read_dir(path) {
            let mut children: Vec<_> = rd.flatten().map(|e| e.path()).collect();
            children.sort();
            for child in children {
                if child.is_dir() {
                    if recursive {
                        collect_path(engine, &child, recursive, out);
                    }
                } else {
                    try_add_file(engine, &child, out);
                }
            }
        }
    } else if path.is_file() {
        try_add_file(engine, path, out);
    }
}

fn try_add_file(engine: &dyn ImageEngine, p: &Path, out: &mut Vec<ImageFileEntry>) {
    let Some(ext) = p.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()) else {
        return;
    };
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return;
    }
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .to_string();
    let size_bytes = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    let (width, height, format) = match std::fs::read(p) {
        Ok(bytes) => match engine.probe(&bytes, Some(&ext)) {
            Ok(info) => (info.width, info.height, info.format),
            Err(_) => (0, 0, ext.clone()),
        },
        Err(_) => (0, 0, ext.clone()),
    };
    out.push(ImageFileEntry {
        path: p.to_string_lossy().to_string(),
        name,
        width,
        height,
        format,
        size_bytes,
    });
}

/// Probe a single source for width/height/format.
#[tauri::command]
pub async fn probe_image(state: State<'_, EngineState>, input: ImageInput) -> Result<ProbeInfo, String> {
    let engine = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || -> anyhow::Result<ProbeInfo> {
        let bytes = read_bytes(&input)?;
        let ext = ext_of(&input.name);
        engine.probe(&bytes, ext.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Render a downscaled PNG preview (data URL) for display / annotation.
#[tauri::command]
pub async fn read_preview(
    state: State<'_, EngineState>,
    input: ImageInput,
    max: u32,
) -> Result<String, String> {
    let engine = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || -> anyhow::Result<String> {
        let bytes = read_bytes(&input)?;
        let ext = ext_of(&input.name);
        let source = engine.load(&bytes, ext.as_deref())?;
        let (ow, oh) = source.dimensions();

        let size = SizeSpec {
            id: "preview".into(),
            label: "preview".into(),
            width: Some(max.max(1)),
            height: Some(max.max(1)),
            scale_percent: None,
            mode: ResizeMode::Fit,
            allow_upscale: false,
            background: None,
        };
        let plan = resolve_plan(ow, oh, &size);
        let buf = engine.render(source.as_ref(), &plan, [0, 0, 0, 0])?;

        let fmt = FormatSpec {
            id: "preview".into(),
            format: OutputFormat::Png,
            quality: None,
            lossless: true,
            png_level: Some(0),
            effort: None,
            max_kb: None,
        };
        let data = engine.encode(&buf, &fmt)?;
        Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&data)
        ))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Run a full batch. Streams `process-progress` events while it works.
#[tauri::command]
pub async fn process_batch(
    app: AppHandle,
    state: State<'_, EngineState>,
    request: ProcessRequest,
) -> Result<ProcessSummary, String> {
    let engine = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let app = app.clone();
        let on_progress = move |ev: ProgressEvent| {
            let _ = app.emit("process-progress", ev);
        };
        run_process(engine.as_ref(), &request, &on_progress)
    })
    .await
    .map_err(|e| e.to_string())
}
