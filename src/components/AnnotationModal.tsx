import { ImageEditor, type EditorState } from 'fluxo-ui';
import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';
import { useBackend } from '../backend/context';
import type { ImageInput } from '../backend/types';
import { useToast } from '../lib/toast';
import { dataUrlByteSize } from '../lib/util';
import { useStore } from '../store/useStore';

export function AnnotationModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const backend = useBackend();
  const toast = useToast();
  const setAnnotated = useStore((s) => s.setAnnotated);
  const resetAnnotation = useStore((s) => s.resetAnnotation);
  const live = useStore((s) => s.images.find((i) => i.id === itemId));
  const [src, setSrc] = useState<string | null>(null);
  const [initialEditState] = useState<EditorState | null>(() => live?.editState ?? null);
  const liveEditState = useRef<EditorState | null>(initialEditState);

  useEffect(() => {
    if (!live) return;
    const original: ImageInput = live.orig?.bytesBase64
      ? { id: live.id, path: null, bytesBase64: live.orig.bytesBase64, name: live.name }
      : { id: live.id, path: live.path, bytesBase64: live.path ? null : live.bytesBase64, name: live.name };
    let cancelled = false;
    (async () => {
      try {
        const url = await backend.preview(original, 2400);
        if (!cancelled) setSrc(url);
      } catch {
        /* keep current src */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, live?.id]);

  const handleDone = () => {
    const state = liveEditState.current;
    if (!state || state === initialEditState) {
      onClose();
      return;
    }
    const flattened = state.flattened;
    const probe = new Image();
    probe.onload = () => {
      setAnnotated(itemId, flattened, probe.naturalWidth, probe.naturalHeight, dataUrlByteSize(flattened), state);
      onClose();
    };
    probe.onerror = () => onClose();
    probe.src = flattened;
  };

  const handleReset = () => {
    resetAnnotation(itemId);
    liveEditState.current = null;
    toast.info('Edits reset to the original.');
    onClose();
  };

  if (!live) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal--editor"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1200px, 97vw)' }}
      >
        <div className="modal__head">
          <div className="modal__title">
            <Icon name="pencil" size={18} /> Edit · {live.name}
          </div>
          <div className="row">
            {live.annotated && (
              <button className="btn btn--sm btn--subtle" onClick={handleReset}>
                <Icon name="refresh" size={15} /> Reset edits
              </button>
            )}
            <button className="btn btn--sm btn--primary" onClick={handleDone}>
              <Icon name="check" size={15} /> Done
            </button>
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="modal__body modal__body--editor">
          {src || initialEditState ? (
            <ImageEditor
              src={src ?? initialEditState?.baseImage ?? ''}
              alt={live.name}
              width="100%"
              height="100%"
              editState={initialEditState}
              onEditStateChange={(state) => {
                liveEditState.current = state;
              }}
            />
          ) : (
            <div className="empty">Loading editor…</div>
          )}
        </div>
      </div>
    </div>
  );
}
