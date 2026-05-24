# Minimage

> Part of the [Utilsware](https://utilsware.com) suite of tools — product page & more tools at **[utilsware.com](https://utilsware.com)**.

**A modern, fast batch image studio for Windows, macOS and Linux.** Resize, convert, optimize, annotate and compare images in bulk — building a full **matrix of sizes × formats** from any selection of files or folders.

Built with **React + TypeScript** (Vite) on a **Rust / Tauri v2** core, so the installer is tiny (~8–12 MB) instead of the ~80 MB+ an Electron build would weigh. All image work happens natively in Rust (`image`, `resvg`, `ravif`, `webp`, `oxipng`) — no bundled Node runtime, no `node_modules` in the output.

---

## Features

- **Batch matrix** — pick any images/folders, define multiple **sizes** and multiple **formats**, and every image is rendered for every size × every format in one run.
- **Formats** — WebP, AVIF, JPEG, PNG, GIF, TIFF, BMP, ICO. Per-format **quality**, **lossless** toggles, **PNG optimization level** (oxipng) and **AVIF/WebP effort**.
- **Target file size** — set a KB budget per format and quality is auto-tuned per image so each output lands at or under it (JPEG/WebP/AVIF/lossy-PNG).
- **Resize modes** — Fit, Cover (center-crop), Pad (with background color), Stretch, single-dimension (keep aspect), or **scale %**. Optional upscaling.
- **SVG rasterization** — vector files are rendered crisply at each target size.
- **Intake any way** — native file/folder picker, **drag & drop** files or whole folders onto the window, or **paste** (`Ctrl`+`V`) an image from the clipboard.
- **Annotate & edit** — crop, rotate, flip, blur, draw and annotate (fluxo-ui `ImageEditor`); edits are applied on export.
- **Advanced effects** (one collapsible panel, off by default) — batch-wide **color adjustments** (brightness / contrast / saturation / grayscale), **transparency flattening** with a chosen background for every format, and a **watermark** (text caption or logo image, with position / size / opacity / margin).
- **Presets** — save a whole setup (sizes × formats × output × advanced effects) and reload it in one click for repeat jobs.
- **Metadata stripped automatically** — outputs are re-encoded from raw pixels, so camera EXIF, GPS and color profiles are always removed (smaller files, no location leaks).
- **Helpful, uncluttered UI** — settings explanations live behind a small **?** that reveals a rich tooltip on hover, so panels stay compact.
- **Before / after compare slider** and quick preview for every image and every result.
- **Templated file names** — e.g. `{name}_{width}x{height}_{dd}{MM}{YYYY}.{ext}`, with `/` to create sub-folders. Live preview + click-to-insert tokens.
- **Output anywhere** — into a custom folder, next to each source, or **replace** originals in place.
- **Results report** — per-output status, dimensions, and size savings; open files or reveal them in your file manager (Explorer / Finder / etc.).
- Polished, responsive dark/light UI.

---

## Download & install

Go to the repo's **Releases** and grab the latest build for your OS:

- **Windows** — `Minimage-*.exe` (NSIS installer) or `.msi`. Run it; unsigned builds may trigger SmartScreen → **More info → Run anyway**.
- **macOS** — `Minimage-*.dmg` or `.app.tar.gz`. Open the `.dmg` and drag Minimage to Applications; unsigned builds need a right-click → **Open** (or `xattr -dr com.apple.quarantine /Applications/Minimage.app`).
- **Linux** — `Minimage-*.AppImage` (chmod +x and run), `.deb`, or `.rpm`.

> Builds are produced from GitHub Actions, so a maintainer must run the workflow once (below) to publish a release.

---

## Build & develop

### First-time setup (once)

Node 20+ is required. Live dev and native builds also need **Rust (stable)** plus your platform's native toolchain (skip the Rust/native steps if you only do Docker / CI builds). See the [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/) for the authoritative, per-OS list.

**Windows**

```powershell
# Rust
winget install -e --id Rustlang.Rustup
rustup default stable

# C++ build tools (MSVC linker) — installs the "Desktop development with C++" tools
winget install -e --id Microsoft.VisualStudio.2022.BuildTools `
  --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

WebView2 is preinstalled on Windows 11. Restart the terminal after installing Rust.

**macOS**

```bash
xcode-select --install                                   # Xcode command-line tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust
```

**Linux** (Debian/Ubuntu — adjust for your distro)

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust
```

Then install app dependencies on any OS:

```bash
npm install --force
```

### Run live — everyday workflow (no rebuilding)

Hot-reloading app. Edit code and it updates in place; no installer rebuild needed.

```bash
npm run tauri dev
```

- Frontend edits reload instantly.
- Rust edits recompile incrementally (seconds) and relaunch.

UI-only preview in a browser (image processing won't work — the Tauri backend isn't running):

```bash
npm run dev      # http://localhost:1420
```

### Build a native installer locally

With the Rust + native toolchain installed (above), build the installer for the OS you're on:

```bash
npm run tauri build   # output in src-tauri/target/release/bundle
```

This produces the platform's native package(s) — `.exe`/`.msi` on Windows, `.dmg`/`.app` on macOS, `.AppImage`/`.deb`/`.rpm` on Linux. Tauri builds for the host OS only; use GitHub Actions (below) to produce all three.

### Build the Windows installer via Docker (no Rust/MSVC needed)

Cross-compiles the **Windows** installer on Linux via `cargo-xwin` + NSIS; artifacts land in `release/`.

```bash
docker compose run --build --rm windows-build
```

- First run ~7 min; later runs faster while the build cache is warm.
- Output: `release/Minimage.exe` and `release/Minimage_0.1.0_x64-setup.exe`.
- If it fails with `Permission denied` on `/out/Minimage.exe`, the exe is open/running — close it and re-run.
- Note: the Docker build uses Rust-native (lossless) WebP. The CI build uses full lossy WebP.

### Build & publish via GitHub Actions

Push the repo, then **Actions → Build & Release → Run workflow**:

- Tick the OS(es) to build — **Windows / macOS / Linux**. Only ticked ones run.
- Each OS uploads its own artifact (`minimage-windows`, etc.).
- Tick **Publish a GitHub Release** to attach installers to a release; otherwise they're just run artifacts.

### Quick reference

| Task | Command |
|------|---------|
| Live dev (full app) | `npm run tauri dev` |
| UI preview only | `npm run dev` |
| Frontend production build | `npm run build` |
| Native installer (host OS) | `npm run tauri build` |
| Windows installer (Docker) | `docker compose run --build --rm windows-build` |
| Release (all/any OS) | GitHub Actions → Build & Release |

---

## File-name tokens

Use these in the **File name template** (a `/` creates sub-folders):

| Token | Meaning | | Token | Meaning |
|---|---|---|---|---|
| `{name}` | original name (no ext) | | `{format}` | output format |
| `{ext}` | output extension | | `{quality}` | quality used |
| `{origext}` | original extension | | `{sizelabel}` | size preset label |
| `{width}` / `{w}` | output width | | `{index}` / `{idx}` | sequence (idx = 001) |
| `{height}` / `{h}` | output height | | `{dd}` `{d}` | day |
| `{ow}` / `{oh}` | original width / height | | `{MM}` `{M}` | month |
| `{YYYY}` `{YY}` | year | | `{HH}` `{hh}` `{mm}` `{ss}` | time |

Example: `gallery/{name}-{width}w-q{quality}.{ext}` → `gallery/photo-1024w-q80.webp`

---

## Architecture (interface-driven)

The app is built so the **backend is swappable behind a single interface** — moving to Electron later would only touch one implementation file, not the UI.

- **Frontend** talks only to the `ProcessorBackend` TypeScript interface (`src/backend/types.ts`) via the `useBackend()` hook. `src/backend/tauri.ts` is the only file importing `@tauri-apps/*`.
- **Rust** hides the imaging library behind the `ImageEngine` trait (`src-tauri/src/engine.rs`); the pipeline only speaks `RasterBuffer` + geometry. Swap `ImageRsEngine` (one line in `lib.rs`) to change backends.

```
src/
  backend/      ProcessorBackend interface + Tauri impl (the seam)
  store/        zustand app state
  components/   UI (header, sources grid, size/format/output panels, modals)
  lib/          filename tokens, format catalog, utils, toasts
src-tauri/
  src/
    model.rs       serde data contract (shared with TS)
    engine.rs      ImageEngine trait + resize geometry  ← swap point
    engines/       image_rs (image/resvg/ravif/webp/oxipng)
    filename.rs    output filename templating
    pipeline.rs    parallel batch orchestration
    commands.rs    thin Tauri command glue
```

### fluxo-ui integration

The reusable file list/grid lives in the [fluxo-ui](https://github.com/shridhar-tl/fluxo-ui) library as the **`MediaList`** component. For CI reproducibility the app builds against the published `fluxo-ui` npm package; to develop against the live library source, enable source mode:

```bash
EUI_USE_SOURCE=1 EUI_SOURCE_PATH=../../products/fluxo-ui pnpm dev
```

---

## License

MIT
