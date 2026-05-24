import { useRef } from 'react';

import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { Field, Segmented } from './controls';
import { useBackend } from '../backend/context';
import { formatMeta } from '../lib/catalog';
import { detectCollisions } from '../lib/collisions';
import { FILENAME_TOKENS, renderFilename, type NameCtx } from '../lib/tokens';
import { extOf, stemOf } from '../lib/util';
import { useStore } from '../store/useStore';
import type { ConflictPolicy, OutputModeId } from '../backend/types';

const CONFLICT_HINTS: Record<ConflictPolicy, string> = {
  rename: 'Keeps both — adds " (1)", " (2)", … to the new file so nothing is lost.',
  overwrite: 'Replaces the existing file with the new one. The old file is gone.',
  skip: 'Leaves the existing file untouched and does not write the new one.',
};

function useSampleName(): string {
  const images = useStore((s) => s.images);
  const sizes = useStore((s) => s.sizes);
  const formats = useStore((s) => s.formats);
  const template = useStore((s) => s.output.filenameTemplate);

  const img = images[0];
  const size = sizes[0];
  const fmt = formats[0];
  if (!size || !fmt) return '—';

  const ow = img?.width || 1920;
  const oh = img?.height || 1080;
  let w = ow;
  let h = oh;
  if (size.scalePercent != null) {
    w = Math.round((ow * size.scalePercent) / 100);
    h = Math.round((oh * size.scalePercent) / 100);
  } else if (size.width && size.height) {
    w = size.width;
    h = size.height;
  } else if (size.width) {
    w = size.width;
    h = Math.round((oh * size.width) / ow);
  } else if (size.height) {
    h = size.height;
    w = Math.round((ow * size.height) / oh);
  }

  const ctx: NameCtx = {
    name: img ? stemOf(img.name) : 'photo',
    origext: img ? extOf(img.name) : 'jpg',
    ext: formatMeta(fmt.format).ext,
    width: w,
    height: h,
    ow,
    oh,
    format: fmt.format,
    quality: fmt.quality ?? 100,
    effort: fmt.effort,
    pngLevel: fmt.pngLevel,
    lossless: fmt.lossless,
    sizeLabel: size.label,
    index: 1,
  };
  return renderFilename(template, ctx);
}

function useCollisions() {
  const images = useStore((s) => s.images);
  const onlySelected = useStore((s) => s.onlySelected);
  const sizes = useStore((s) => s.sizes);
  const formats = useStore((s) => s.formats);
  const output = useStore((s) => s.output);

  // Mirror imagesToProcess: honor "only selected" (falling back to all).
  const selected = images.filter((i) => i.selected);
  const imgs = onlySelected && selected.length ? selected : images;
  return detectCollisions(imgs, sizes, formats, output);
}

export function OutputPanel() {
  const backend = useBackend();
  const output = useStore((s) => s.output);
  const setOutput = useStore((s) => s.setOutput);
  const inputRef = useRef<HTMLInputElement>(null);
  const sample = useSampleName();
  const collisions = useCollisions();

  const insertToken = (token: string) => {
    const el = inputRef.current;
    const current = output.filenameTemplate;
    if (!el) {
      setOutput({ filenameTemplate: current + token });
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setOutput({ filenameTemplate: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const chooseFolder = async () => {
    const folder = await backend.pickOutputFolder();
    if (folder) setOutput({ customFolder: folder });
  };

  return (
    <CollapsibleSection icon="download" title="Output">
      <Field label="Destination">
        <Segmented<OutputModeId>
          value={output.mode}
          onChange={(v) => setOutput({ mode: v })}
          options={[
            { value: 'customFolder', label: 'Custom folder' },
            { value: 'sameFolder', label: 'Same folder' },
            { value: 'replace', label: 'Replace' },
          ]}
        />
      </Field>

      {output.mode === 'customFolder' && (
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <button className="btn btn--sm btn--subtle" onClick={chooseFolder}>
            <Icon name="folder" size={15} /> Choose folder
          </button>
          <span className="hint truncate" style={{ flex: 1 }} title={output.customFolder ?? ''}>
            {output.customFolder || 'No folder selected'}
          </span>
        </div>
      )}

      {output.mode === 'replace' && (
        <div className="template-preview" style={{ marginTop: 10 }}>
          Replaces each original in place (one size × one format). The original is overwritten with the
          new format extension.
        </div>
      )}

      {output.mode !== 'replace' && (
        <>
          <Field label="File name template" hint="Use / to create sub-folders. Click a token to insert it.">
            <input
              ref={inputRef}
              className="input"
              style={{ fontFamily: 'var(--ip-mono)', fontSize: 12.5 }}
              value={output.filenameTemplate}
              spellCheck={false}
              onChange={(e) => setOutput({ filenameTemplate: e.target.value })}
            />
          </Field>
          <div className="template-preview">
            Example: <b>{sample}</b>
          </div>
          <div className="token-list">
            {FILENAME_TOKENS.map((t) => (
              <button key={t.token} className="token" title={t.desc} onClick={() => insertToken(t.token)}>
                {t.token}
              </button>
            ))}
          </div>
          {collisions.hasCollisions && (
            <div className="warn-box" role="alert">
              <Icon name="alert" size={16} />
              <div>
                <b>
                  {collisions.count} file name{collisions.count === 1 ? '' : 's'} would be reused — outputs
                  would overwrite each other.
                </b>
                <div className="hint" style={{ marginTop: 3 }}>
                  e.g. <code>{collisions.examples[0]}</code> is produced more than once because the outputs
                  differ by something the name doesn’t capture.
                </div>
                {collisions.suggestions.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span className="hint">Add one of these to make every name unique:</span>
                    <div className="token-list" style={{ marginTop: 6 }}>
                      {collisions.suggestions.map((s) => (
                        <button
                          key={s.token}
                          className="token token--fix"
                          title={`Insert ${s.token} — ${s.reason}`}
                          onClick={() => insertToken(s.token)}
                        >
                          <Icon name="plus" size={12} /> {s.token}
                          <span className="token__why"> · {s.reason}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <Field label="If a file already exists" hint={CONFLICT_HINTS[output.onConflict]}>
        <Segmented<ConflictPolicy>
          value={output.onConflict}
          onChange={(v) => setOutput({ onConflict: v })}
          options={[
            { value: 'rename', label: 'Rename' },
            { value: 'overwrite', label: 'Overwrite' },
            { value: 'skip', label: 'Skip' },
          ]}
        />
      </Field>
    </CollapsibleSection>
  );
}
