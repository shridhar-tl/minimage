//! Concrete [`ImageEngine`](crate::engine::ImageEngine) implementations.
//!
//! `image_rs` is the default, built on the pure-Rust `image` crate plus
//! `resvg` (SVG), `ravif` (AVIF), `webp` and `oxipng`.

pub mod image_rs;
