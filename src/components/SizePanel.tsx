import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { InfoHint } from './InfoHint';
import { Field, NumberInput, Segmented, Toggle } from './controls';
import { RESIZE_MODES, SIZE_PRESETS, newCustomSize, sizeFromPreset } from '../lib/catalog';
import { HINTS } from '../lib/hints';
import { useStore } from '../store/useStore';
import type { ResizeMode, SizeSpec } from '../backend/types';

function SizeCard({ size }: { size: SizeSpec }) {
  const updateSize = useStore((s) => s.updateSize);
  const removeSize = useStore((s) => s.removeSize);
  const duplicateSize = useStore((s) => s.duplicateSize);
  const byScale = size.scalePercent != null;

  return (
    <div className="row-card">
      <div className="row-card__head">
        <input
          className="row-card__title-input"
          value={size.label}
          aria-label="Size label"
          onChange={(e) => updateSize(size.id, { label: e.target.value })}
        />
        <Segmented
          value={byScale ? 'scale' : 'dims'}
          onChange={(v) =>
            updateSize(size.id, v === 'scale' ? { scalePercent: 100 } : { scalePercent: null })
          }
          options={[
            { value: 'dims', label: 'Size' },
            { value: 'scale', label: 'Scale' },
          ]}
        />
        <button className="iconbtn" title="Duplicate" onClick={() => duplicateSize(size.id)}>
          <Icon name="copy" size={15} />
        </button>
        <button className="iconbtn danger" title="Remove" onClick={() => removeSize(size.id)}>
          <Icon name="trash" size={15} />
        </button>
      </div>

      {byScale ? (
        <div className="grid2">
          <Field label="Scale %" hint="Relative to each original">
            <NumberInput
              value={size.scalePercent}
              min={1}
              max={1000}
              onChange={(v) => updateSize(size.id, { scalePercent: v ?? 100 })}
            />
          </Field>
        </div>
      ) : (
        <>
          <div className="grid3">
            <Field label="Width (px)" hint="blank = auto">
              <NumberInput value={size.width} onChange={(v) => updateSize(size.id, { width: v })} placeholder="auto" />
            </Field>
            <Field label="Height (px)" hint="blank = auto">
              <NumberInput value={size.height} onChange={(v) => updateSize(size.id, { height: v })} placeholder="auto" />
            </Field>
            <Field label={<span className="label-hint">Fit mode <InfoHint hint={HINTS.fitMode} /></span>}>
              <select
                className="select input--sm"
                value={size.mode}
                disabled={!(size.width && size.height)}
                onChange={(e) => updateSize(size.id, { mode: e.target.value as ResizeMode })}
              >
                {RESIZE_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {size.mode === 'pad' && size.width && size.height && (
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <span className="field__label">Pad background</span>
              <input
                type="color"
                value={size.background ?? '#ffffff'}
                onChange={(e) => updateSize(size.id, { background: e.target.value })}
                style={{ width: 34, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}
              />
            </div>
          )}
        </>
      )}

      <div className="row-card__foot">
        <span className="label-hint">
          <Toggle
            checked={size.allowUpscale}
            onChange={(v) => updateSize(size.id, { allowUpscale: v })}
            label={<span className="muted">Allow upscaling</span>}
          />
          <InfoHint hint={HINTS.upscale} />
        </span>
      </div>
    </div>
  );
}

export function SizePanel() {
  const sizes = useStore((s) => s.sizes);
  const addSize = useStore((s) => s.addSize);

  return (
    <CollapsibleSection
      icon="ratio"
      title="Sizes"
      badge={sizes.length}
      action={
        <button className="btn btn--sm" onClick={() => addSize(newCustomSize())}>
          <Icon name="plus" size={14} /> Custom
        </button>
      }
    >
      {sizes.map((s) => (
        <SizeCard key={s.id} size={s} />
      ))}

      <div className="preset-pop">
        {SIZE_PRESETS.map((p) => (
          <button key={p.label} className="preset-chip" onClick={() => addSize(sizeFromPreset(p))}>
            {p.label}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}
