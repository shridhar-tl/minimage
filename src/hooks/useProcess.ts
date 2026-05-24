import { useCallback } from 'react';

import { useBackend } from '../backend/context';
import { detectCollisions } from '../lib/collisions';
import { useToast } from '../lib/toast';
import { uid } from '../lib/util';
import { imagesToProcess, toImageInput, useStore } from '../store/useStore';

export function useProcess() {
  const backend = useBackend();
  const toast = useToast();

  const run = useCallback(async () => {
    const st = useStore.getState();
    const imgs = imagesToProcess(st);

    if (!imgs.length) return toast.warn('Add some images first');
    if (!st.sizes.length) return toast.warn('Add at least one size');
    if (!st.formats.length) return toast.warn('Add at least one format');
    if (st.output.mode === 'customFolder' && !st.output.customFolder)
      return toast.warn('Choose an output folder');
    if (st.output.mode === 'replace' && st.sizes.length * st.formats.length > 1)
      return toast.warn('Replace mode needs exactly one size and one format');

    const collisions = detectCollisions(imgs, st.sizes, st.formats, st.output);
    if (collisions.hasCollisions) {
      const fix = collisions.suggestions[0]?.token ?? '{index}';
      return toast.warn(
        `Some outputs would overwrite each other — add ${fix} to the file name so every file is unique.`,
      );
    }

    const jobId = uid();
    st.resetResults();
    st.setProcessing({
      running: true,
      current: 0,
      total: imgs.length * st.sizes.length * st.formats.length,
      label: 'Starting…',
    });

    try {
      const summary = await backend.process(
        {
          jobId,
          inputs: imgs.map(toImageInput),
          sizes: st.sizes,
          formats: st.formats,
          output: st.output,
          options: st.options,
        },
        (ev) => {
          const store = useStore.getState();
          store.setProcessing({ current: ev.current, total: ev.total, label: ev.label });
          if (ev.lastResult) store.pushResult(ev.lastResult);
        },
      );
      const store = useStore.getState();
      store.setSummary(summary);
      store.setProcessing({ running: false, label: 'Done' });
      if (summary.failed > 0) toast.warn(`Finished with ${summary.failed} error(s)`);
      else toast.success(`Created ${summary.ok} file${summary.ok === 1 ? '' : 's'}`);
    } catch (e) {
      useStore.getState().setProcessing({ running: false });
      toast.error(`Processing failed: ${String(e)}`);
    }
  }, [backend, toast]);

  return { run };
}
