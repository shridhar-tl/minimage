import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { InfoHint } from './InfoHint';
import { NumberInput, Toggle } from './controls';
import { FORMATS, formatMeta, newFormat, supportsTargetSize } from '../lib/catalog';
import { HINTS } from '../lib/hints';
import { useStore } from '../store/useStore';
import type { FormatSpec, OutputFormatId } from '../backend/types';
import type { HintContent } from './InfoHint';

function QualitySlider({
  label,
  value,
  min,
  max,
  hint,
  valueLabel,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: HintContent;
  valueLabel?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginTop: 10, opacity: disabled ? 0.5 : 1 }}>
      <div className="row spread" style={{ marginBottom: 4 }}>
        <span className="label-hint">
          <span className="field__label">{label}</span>
          {hint && <InfoHint hint={hint} />}
        </span>
        <span className="quality-row__val">{valueLabel ?? value}</span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Human label for the WebP/AVIF effort scale (1 fastest … 9 smallest). */
function effortWord(v: number): string {
  if (v <= 2) return 'fastest';
  if (v <= 4) return 'balanced';
  if (v <= 7) return 'smaller';
  return 'smallest';
}

/** Human label for the PNG compression-effort scale (0 fastest … 6 smallest). */
function pngLevelWord(v: number): string {
  if (v === 0) return 'fastest';
  if (v <= 2) return 'balanced';
  if (v <= 4) return 'smaller';
  return 'smallest';
}

function FormatCard({ fmt }: { fmt: FormatSpec }) {
  const meta = formatMeta(fmt.format);
  const updateFormat = useStore((s) => s.updateFormat);
  const removeFormat = useStore((s) => s.removeFormat);
  const canTarget = supportsTargetSize(fmt.format) && !fmt.lossless;
  const targeting = canTarget && fmt.maxKb != null;

  return (
    <div className="row-card">
      <div className="row-card__head">
        <div className="row-card__title-input" style={{ pointerEvents: 'none', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="tile__fmt" style={{ background: 'var(--ip-gradient)' }}>
            {meta.label}
          </span>
          <span className="hint" style={{ pointerEvents: 'none' }}>
            {meta.blurb}
          </span>
        </div>
        <button className="iconbtn danger" title="Remove" onClick={() => removeFormat(fmt.id)}>
          <Icon name="trash" size={15} />
        </button>
      </div>

      {meta.lossless && (
        <div className="row-card__foot" style={{ marginTop: 4 }}>
          <span className="label-hint">
            <Toggle
              checked={fmt.lossless}
              onChange={(v) => updateFormat(fmt.id, { lossless: v })}
              label={<span className="muted">Lossless</span>}
            />
            <InfoHint hint={HINTS.lossless} />
          </span>
        </div>
      )}

      {meta.quality && !fmt.lossless && (
        <QualitySlider
          label="Quality"
          min={1}
          max={100}
          value={fmt.quality ?? meta.defaultQuality}
          hint={HINTS.quality}
          disabled={targeting}
          valueLabel={targeting ? 'auto' : undefined}
          onChange={(v) => updateFormat(fmt.id, { quality: v })}
        />
      )}

      {meta.effort && !fmt.lossless && (
        <QualitySlider
          label="Compression effort"
          min={1}
          max={9}
          value={fmt.effort ?? 4}
          valueLabel={`${fmt.effort ?? 4} · ${effortWord(fmt.effort ?? 4)}`}
          hint={HINTS.effort}
          onChange={(v) => updateFormat(fmt.id, { effort: v })}
        />
      )}

      {meta.pngLevel && (
        <QualitySlider
          label="Compression effort"
          min={0}
          max={6}
          value={fmt.pngLevel ?? 2}
          valueLabel={`${fmt.pngLevel ?? 2} · ${pngLevelWord(fmt.pngLevel ?? 2)}`}
          hint={HINTS.pngLevel}
          onChange={(v) => updateFormat(fmt.id, { pngLevel: v })}
        />
      )}

      {canTarget && (
        <div className="row spread" style={{ marginTop: 12 }}>
          <span className="label-hint">
            <Toggle
              checked={targeting}
              onChange={(v) => updateFormat(fmt.id, { maxKb: v ? 200 : null })}
              label={<span className="muted">Target file size</span>}
            />
            <InfoHint hint={HINTS.maxKb} />
          </span>
          {targeting && (
            <span className="row" style={{ gap: 6, alignItems: 'center' }}>
              <NumberInput
                value={fmt.maxKb}
                min={1}
                onChange={(v) => updateFormat(fmt.id, { maxKb: v ?? 1 })}
              />
              <span className="field__label" style={{ marginBottom: 0 }}>
                KB
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function FormatPanel() {
  const formats = useStore((s) => s.formats);
  const addFormat = useStore((s) => s.addFormat);
  const used = new Set(formats.map((f) => f.format));

  return (
    <CollapsibleSection icon="layers" title="Formats" badge={formats.length}>
      <div className="fmt-pick">
        {FORMATS.map((m) => (
          <button
            key={m.id}
            onClick={() => addFormat(newFormat(m.id as OutputFormatId))}
            style={used.has(m.id) ? { borderColor: 'var(--ip-accent)' } : undefined}
            title={`Add ${m.label}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {formats.map((f) => (
        <FormatCard key={f.id} fmt={f} />
      ))}
    </CollapsibleSection>
  );
}
