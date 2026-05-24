//! Minimage — Tauri application library.
//!
//! Architecture (interface-driven, see `engine.rs`):
//!   model      → the serde data contract shared with the TS frontend
//!   engine     → the `ImageEngine` trait + geometry (the swap-point)
//!   engines    → concrete engines (default: `image_rs`)
//!   filename   → output filename templating
//!   pipeline   → engine-agnostic batch orchestration
//!   commands   → thin Tauri command glue

mod commands;
mod engine;
mod engines;
mod filename;
mod model;
mod pipeline;

use std::sync::Arc;

use commands::EngineState;
use engines::image_rs::ImageRsEngine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // The active engine. Swap this single line to change imaging backends.
        .manage(EngineState(Arc::new(ImageRsEngine)))
        .invoke_handler(tauri::generate_handler![
            commands::inspect_paths,
            commands::probe_image,
            commands::read_preview,
            commands::process_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
