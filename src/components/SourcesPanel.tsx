import { useEffect } from "react";

import { useBackend } from "../backend/context";
import { useStore, type ImageItem } from "../store/useStore";
import { Icon } from "./Icon";
import { ImageGrid } from "./ImageGrid";
import { Segmented, Toggle } from "./controls";

export function SourcesPanel({
  onAddFiles,
  onAddFolder,
  onPreview,
  onAnnotate,
}: {
  onAddFiles: () => void;
  onAddFolder: () => void;
  onPreview: (i: ImageItem) => void;
  onAnnotate: (i: ImageItem) => void;
}) {
  const backend = useBackend();
  const images = useStore((s) => s.images);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selectAll = useStore((s) => s.selectAll);
  const clearImages = useStore((s) => s.clearImages);
  const setPreview = useStore((s) => s.setPreview);
  const onlySelected = useStore((s) => s.onlySelected);
  const setOnlySelected = useStore((s) => s.setOnlySelected);

  const selectedCount = images.filter((i) => i.selected).length;
  const allSelected = images.length > 0 && selectedCount === images.length;

  // Lazily render thumbnails for any image that doesn't have one yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const img of useStore.getState().images) {
        if (cancelled) break;
        if (img.previewUrl) continue;
        try {
          const url = await backend.preview(
            {
              id: img.id,
              path: img.path,
              bytesBase64: img.bytesBase64,
              name: img.name,
            },
            320,
          );
          if (!cancelled) setPreview(img.id, url);
        } catch {
          /* leave placeholder */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [images, backend, setPreview]);

  return (
    <section className="pane">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="layers" size={18} />
          Sources
        </div>
        {images.length > 0 && (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              {
                value: "grid",
                icon: <Icon name="grid" size={15} />,
                title: "Grid view",
              },
              {
                value: "list",
                icon: <Icon name="list" size={15} />,
                title: "List view",
              },
            ]}
          />
        )}
      </div>

      <button
        className="dropzone"
        onClick={onAddFiles}
        aria-label="Add images by clicking, or drag and drop / paste"
      >
        <span className="dropzone__icon">
          <Icon name="download" size={22} />
        </span>
        <span className="dropzone__text">
          <b>Drop images here, click to browse, or paste</b>{" "}
          <span className="hint">
            Drag files/folders onto the window ·{" "}
            <span className="kbd">Ctrl</span>+<span className="kbd">V</span> to
            paste · PNG, JPG, WebP, AVIF, GIF, TIFF, BMP, ICO, SVG
          </span>
        </span>
      </button>

      {images.length === 0 ? (
        <div className="empty">
          <div className="empty__icon">
            <Icon name="image" size={30} />
          </div>
          <div>
            <b>No images yet</b>
            <div className="hint" style={{ marginTop: 4 }}>
              Add images or a whole folder to get started.
            </div>
          </div>
          <div className="row">
            <button className="btn btn--subtle" onClick={onAddFolder}>
              <Icon name="folderPlus" size={16} /> Add folder
            </button>
            <button className="btn btn--primary" onClick={onAddFiles}>
              <Icon name="plus" size={16} /> Add images
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-toolbar">
            <div className="grid-toolbar__count">
              <b>{images.length}</b> image{images.length === 1 ? "" : "s"}
              {selectedCount > 0 && <> · {selectedCount} selected</>}
            </div>
            <div className="row" style={{ gap: 12 }}>
              <Toggle
                checked={onlySelected}
                onChange={setOnlySelected}
                label={<span className="muted">Only selected</span>}
              />
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => selectAll(!allSelected)}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <button className="btn btn--sm btn--danger" onClick={clearImages}>
                <Icon name="trash" size={14} /> Clear
              </button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <ImageGrid onPreview={onPreview} onAnnotate={onAnnotate} />
          </div>
        </>
      )}
    </section>
  );
}
