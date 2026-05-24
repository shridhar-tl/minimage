import { useCallback, useEffect } from 'react';

import { useBackend } from '../backend/context';
import { useToast } from '../lib/toast';
import { blobToDataUrl } from '../lib/util';
import { useStore } from '../store/useStore';

/** Wires up every way images can enter the app: picker, folder, drop, paste. */
export function useIntake() {
  const backend = useBackend();
  const toast = useToast();
  const addEntries = useStore((s) => s.addEntries);
  const addInMemory = useStore((s) => s.addInMemory);

  const ingestPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      try {
        const entries = await backend.inspectPaths(paths, true);
        if (!entries.length) {
          toast.warn('No images found in the selection');
          return;
        }
        const added = addEntries(entries);
        if (added === 0) toast.info('Those images are already in the list');
        else toast.success(`Added ${added} image${added === 1 ? '' : 's'}`);
      } catch (e) {
        toast.error(`Could not add images: ${String(e)}`);
      }
    },
    [backend, addEntries, toast],
  );

  const addFiles = useCallback(async () => {
    try {
      const paths = await backend.pickFiles();
      await ingestPaths(paths);
    } catch (e) {
      toast.error(`Could not open picker: ${String(e)}`);
    }
  }, [backend, ingestPaths, toast]);

  const addFolder = useCallback(async () => {
    try {
      const folder = await backend.pickFolder();
      if (folder) await ingestPaths([folder]);
    } catch (e) {
      toast.error(`Could not open folder: ${String(e)}`);
    }
  }, [backend, ingestPaths, toast]);

  // Clipboard paste (Ctrl/Cmd+V) of an image.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (!blob) continue;
          const dataUrl = await blobToDataUrl(blob);
          const probe = new Image();
          probe.onload = () =>
            addInMemory({
              name: `pasted-${Date.now()}.png`,
              bytesBase64: dataUrl,
              width: probe.naturalWidth,
              height: probe.naturalHeight,
              sizeBytes: blob.size,
            });
          probe.src = dataUrl;
          toast.success('Pasted image added');
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addInMemory, toast]);

  // OS drag-and-drop of files/folders onto the window (Tauri webview event).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    backend
      .onFileDrop((paths) => {
        void ingestPaths(paths);
      })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => undefined);
    return () => {
      if (unlisten) unlisten();
    };
  }, [backend, ingestPaths]);

  return { addFiles, addFolder, ingestPaths };
}
