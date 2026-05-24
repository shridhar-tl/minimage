import { useEffect, useState } from 'react';

import { CompareSlider } from './CompareSlider';
import { Icon } from './Icon';
import { useBackend } from '../backend/context';
import { formatBytes, pctChange } from '../lib/util';
import { toImageInput, useStore } from '../store/useStore';

export function PreviewModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const backend = useBackend();
  const summary = useStore((s) => s.summary);
  // Read the live item from the store so saved crops/annotations show here
  // immediately — a snapshot taken when the modal opened would be stale.
  const item = useStore((s) => s.images.find((i) => i.id === itemId));
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [single, setSingle] = useState<string | null>(item?.previewUrl ?? null);

  const result = summary?.results.find((r) => r.inputId === itemId && r.status === 'ok');

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    (async () => {
      try {
        if (result && item.path) {
          const [b, a] = await Promise.all([
            backend.preview({ id: item.id, path: item.path, bytesBase64: null, name: item.name }, 1600),
            backend.preview({ id: 'out', path: result.outputPath, bytesBase64: null, name: result.outputPath }, 1600),
          ]);
          if (!cancelled) {
            setBefore(b);
            setAfter(a);
          }
        } else if (item.annotated && item.path) {
          const [b, a] = await Promise.all([
            backend.preview({ id: item.id, path: item.path, bytesBase64: null, name: item.name }, 1600),
            backend.preview(toImageInput(item), 1600),
          ]);
          if (!cancelled) {
            setBefore(b);
            setAfter(a);
          }
        } else {
          const url = await backend.preview(toImageInput(item), 1800);
          if (!cancelled) {
            setBefore(null);
            setAfter(null);
            setSingle(url);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-runs when the item's edited bytes change so saved edits show up live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, item?.id, item?.bytesBase64, item?.annotated, result]);

  // The image was removed (e.g. cleared) while the modal was open.
  if (!item) return null;

  const showCompare = Boolean(before && after);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">
            <Icon name="eye" size={18} /> {item.name}
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__body">
          {showCompare ? (
            <CompareSlider before={before as string} after={after as string} />
          ) : single ? (
            <div className="compare">
              <img src={single} alt={item.name} />
            </div>
          ) : (
            <div className="empty">Loading…</div>
          )}

          {result && (
            <div className="row spread" style={{ marginTop: 14 }}>
              <span className="muted">
                {result.width}×{result.height} · {result.format.toUpperCase()} · {result.sizeLabel}
              </span>
              <span>
                {formatBytes(result.originalBytes)} → <b>{formatBytes(result.bytes)}</b>{' '}
                <span className={`delta ${result.bytes <= result.originalBytes ? 'good' : 'bad'}`}>
                  {pctChange(result.originalBytes, result.bytes).toFixed(0)}%
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
