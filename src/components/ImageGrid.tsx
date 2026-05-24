import { FileBrowser, type FileBrowserItem } from 'fluxo-ui';
import { useMemo } from 'react';

import { Icon } from './Icon';
import { formatBytes } from '../lib/util';
import { useStore, type ImageItem } from '../store/useStore';

export function ImageGrid({
  onPreview,
  onAnnotate,
}: {
  onPreview: (i: ImageItem) => void;
  onAnnotate: (i: ImageItem) => void;
}) {
  const images = useStore((s) => s.images);
  const view = useStore((s) => s.view);
  const setSelection = useStore((s) => s.setSelection);
  const removeImage = useStore((s) => s.removeImage);
  const resetAnnotation = useStore((s) => s.resetAnnotation);

  const items = useMemo<FileBrowserItem[]>(
    () =>
      images.map((img) => ({
        id: img.id,
        name: img.name,
        kind: 'image',
        thumbnailUrl: img.previewUrl,
        loading: !img.previewUrl,
        subtitle: `${img.width || '?'}×${img.height || '?'} · ${formatBytes(img.sizeBytes)}`,
        badge: img.annotated ? 'edited' : img.format,
        data: img,
      })),
    [images],
  );

  const selectedIds = useMemo(() => images.filter((i) => i.selected).map((i) => i.id), [images]);

  return (
    <FileBrowser
      className="image-grid"
      items={items}
      view={view === 'list' ? 'list' : 'thumbnail'}
      selectedIds={selectedIds}
      onSelectionChange={setSelection}
      thumbnailFit="contain"
      minTileWidth={150}
      ariaLabel="Source images"
      renderActions={(item) => {
        const img = item.data as ImageItem;
        return (
          <>
            <button className="tile__act" title="Preview / compare" aria-label="Preview" onClick={() => onPreview(img)}>
              <Icon name="eye" size={15} />
            </button>
            <button
              className="tile__act"
              title={img.annotated ? 'Edit again' : 'Crop / annotate'}
              aria-label={img.annotated ? 'Edit again' : 'Annotate'}
              onClick={() => onAnnotate(img)}
            >
              <Icon name="pencil" size={15} />
            </button>
            {img.annotated && (
              <button
                className="tile__act"
                title="Reset edits to original"
                aria-label="Reset edits"
                onClick={() => resetAnnotation(img.id)}
              >
                <Icon name="refresh" size={15} />
              </button>
            )}
            <button className="tile__act" title="Remove" aria-label="Remove" onClick={() => removeImage(img.id)}>
              <Icon name="x" size={15} />
            </button>
          </>
        );
      }}
    />
  );
}
