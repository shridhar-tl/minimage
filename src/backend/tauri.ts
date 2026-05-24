// Tauri implementation of `ProcessorBackend`.
// This is the ONLY file that imports @tauri-apps/* — the swap point.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath as openerOpenPath, openUrl as openerOpenUrl, revealItemInDir } from '@tauri-apps/plugin-opener';

import type {
  ImageFileEntry,
  ImageInput,
  ProbeInfo,
  ProcessRequest,
  ProcessSummary,
  ProcessorBackend,
  ProgressEvent,
} from './types';

const IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'ico', 'svg',
];

function toArray(sel: string | string[] | null): string[] {
  if (!sel) return [];
  return Array.isArray(sel) ? sel : [sel];
}

export const tauriBackend: ProcessorBackend = {
  kind: 'tauri',

  async pickFiles() {
    const sel = await open({
      multiple: true,
      directory: false,
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
    });
    return toArray(sel as string | string[] | null);
  },

  async pickFolder() {
    const sel = await open({ directory: true, multiple: false, title: 'Add a folder of images' });
    return typeof sel === 'string' ? sel : null;
  },

  async pickOutputFolder() {
    const sel = await open({ directory: true, multiple: false, title: 'Choose output folder' });
    return typeof sel === 'string' ? sel : null;
  },

  inspectPaths(paths, recursive) {
    return invoke<ImageFileEntry[]>('inspect_paths', { paths, recursive });
  },

  probe(input: ImageInput) {
    return invoke<ProbeInfo>('probe_image', { input });
  },

  preview(input: ImageInput, max: number) {
    return invoke<string>('read_preview', { input, max });
  },

  async process(request: ProcessRequest, onProgress: (e: ProgressEvent) => void) {
    const unlisten = await listen<ProgressEvent>('process-progress', (event) => {
      if (event.payload.jobId === request.jobId) onProgress(event.payload);
    });
    try {
      return await invoke<ProcessSummary>('process_batch', { request });
    } finally {
      unlisten();
    }
  },

  async openPath(path: string) {
    await openerOpenPath(path);
  },

  async openUrl(url: string) {
    await openerOpenUrl(url);
  },

  async revealInFolder(path: string) {
    await revealItemInDir(path);
  },

  async onFileDrop(handler: (paths: string[]) => void) {
    const webview = getCurrentWebview();
    const unlisten = await webview.onDragDropEvent((event) => {
      if (event.payload.type === 'drop') handler(event.payload.paths);
    });
    return unlisten;
  },
};
