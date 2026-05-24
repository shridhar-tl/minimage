import { useRef } from 'react';

import { CollapsibleSection } from './CollapsibleSection';
import { Icon } from './Icon';
import { InfoHint } from './InfoHint';
import { Segmented, SliderRow, Toggle } from './controls';
import { WATERMARK_ANCHORS } from '../lib/catalog';
import { HINTS } from '../lib/hints';
import { blobToDataUrl } from '../lib/util';
import { useStore } from '../store/useStore';
import type { WatermarkAnchor, WatermarkKind } from '../backend/types';

/** A signed adjustment value formatted as +N / −N / 0. */
const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/** True when any advanced effect would change the output (drives the badge). */
function effectsActive(opts: ReturnType<typeof useStore.getState>['options']): boolean {
  const a = opts.adjustments;
  const adj = a.brightness !== 0 || a.contrast !== 0 || a.saturation !== 0 || a.grayscale;
  return adj || opts.flatten.flattenAll || opts.watermark.enabled;
}

function AdjustmentsGroup() {
  const adj = useStore((s) => s.options.adjustments);
  const setAdjustments = useStore((s) => s.setAdjustments);

  return (
    <div className="adv-group">
      <div className="adv-group__head">
        <Icon name="wand" size={15} />
        <span>Color &amp; light</span>
      </div>
      <SliderRow
        label="Brightness"
        hint={<InfoHint hint={HINTS.brightness} />}
        value={adj.brightness}
        min={-100}
        max={100}
        format={signed}
        onChange={(v) => setAdjustments({ brightness: v })}
      />
      <SliderRow
        label="Contrast"
        hint={<InfoHint hint={HINTS.contrast} />}
        value={adj.contrast}
        min={-100}
        max={100}
        format={signed}
        onChange={(v) => setAdjustments({ contrast: v })}
      />
      <SliderRow
        label="Saturation"
        hint={<InfoHint hint={HINTS.saturation} />}
        value={adj.saturation}
        min={-100}
        max={100}
        format={signed}
        onChange={(v) => setAdjustments({ saturation: v })}
        suffix={adj.grayscale ? ' (off)' : undefined}
      />
      <div className="row-card__foot" style={{ marginTop: 6 }}>
        <span className="label-hint">
          <Toggle
            checked={adj.grayscale}
            onChange={(v) => setAdjustments({ grayscale: v })}
            label={<span className="muted">Grayscale</span>}
          />
          <InfoHint hint={HINTS.grayscale} />
        </span>
      </div>
    </div>
  );
}

function TransparencyGroup() {
  const flatten = useStore((s) => s.options.flatten);
  const setFlatten = useStore((s) => s.setFlatten);

  return (
    <div className="adv-group">
      <div className="adv-group__head">
        <Icon name="droplet" size={15} />
        <span>Transparency</span>
      </div>
      <div className="row spread">
        <span className="label-hint">
          <Toggle
            checked={flatten.flattenAll}
            onChange={(v) => setFlatten({ flattenAll: v })}
            label={<span className="muted">Flatten for all formats</span>}
          />
          <InfoHint hint={HINTS.flattenAll} />
        </span>
        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span className="label-hint">
            <span className="field__label" style={{ marginBottom: 0 }}>
              Background
            </span>
            <InfoHint hint={HINTS.flattenBg} />
          </span>
          <input
            type="color"
            value={flatten.background}
            onChange={(e) => setFlatten({ background: e.target.value })}
            className="color-swatch"
            aria-label="Flatten background color"
          />
        </span>
      </div>
    </div>
  );
}

function WatermarkGroup() {
  const wm = useStore((s) => s.options.watermark);
  const setWatermark = useStore((s) => s.setWatermark);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await blobToDataUrl(file);
    setWatermark({ imageBase64: dataUrl, imageName: file.name });
  };

  return (
    <div className="adv-group">
      <div className="adv-group__head">
        <Icon name="stamp" size={15} />
        <span>Watermark</span>
        <InfoHint hint={HINTS.watermark} />
        <div style={{ marginLeft: 'auto' }}>
          <Toggle checked={wm.enabled} onChange={(v) => setWatermark({ enabled: v })} />
        </div>
      </div>

      {wm.enabled && (
        <div className="adv-group__body">
          <Segmented<WatermarkKind>
            value={wm.kind}
            onChange={(v) => setWatermark({ kind: v })}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'image', label: 'Logo / image' },
            ]}
          />

          {wm.kind === 'text' ? (
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input
                className="input input--sm"
                style={{ flex: 1 }}
                value={wm.text}
                placeholder="© My Brand"
                onChange={(e) => setWatermark({ text: e.target.value })}
              />
              <input
                type="color"
                value={wm.color}
                onChange={(e) => setWatermark({ color: e.target.value })}
                className="color-swatch"
                aria-label="Text color"
              />
            </div>
          ) : (
            <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
              <button className="btn btn--sm btn--subtle" onClick={() => fileRef.current?.click()}>
                <Icon name="image" size={15} /> {wm.imageBase64 ? 'Change image' : 'Choose image'}
              </button>
              <span className="hint truncate" style={{ flex: 1 }} title={wm.imageName ?? ''}>
                {wm.imageName || 'No image chosen'}
              </span>
              {wm.imageBase64 && (
                <img src={wm.imageBase64} alt="" className="wm-preview" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void pickImage(e.target.files?.[0])}
              />
            </div>
          )}

          <div className="field" style={{ marginTop: 10 }}>
            <span className="field__label">Position</span>
            <Segmented<WatermarkAnchor>
              value={wm.anchor}
              onChange={(v) => setWatermark({ anchor: v })}
              options={WATERMARK_ANCHORS.map((a) => ({ value: a.id, label: a.label }))}
            />
          </div>

          <SliderRow
            label="Size"
            hint={<InfoHint hint={HINTS.watermarkScale} />}
            value={wm.scalePercent}
            min={1}
            max={100}
            suffix="%"
            onChange={(v) => setWatermark({ scalePercent: v })}
          />
          <SliderRow
            label="Opacity"
            hint={<InfoHint hint={HINTS.watermarkOpacity} />}
            value={wm.opacity}
            min={1}
            max={100}
            suffix="%"
            onChange={(v) => setWatermark({ opacity: v })}
          />
          <SliderRow
            label="Margin"
            hint={<InfoHint hint={HINTS.watermarkMargin} />}
            value={wm.marginPercent}
            min={0}
            max={25}
            suffix="%"
            onChange={(v) => setWatermark({ marginPercent: v })}
          />
        </div>
      )}
    </div>
  );
}

export function AdvancedPanel() {
  const options = useStore((s) => s.options);
  const resetOptions = useStore((s) => s.resetOptions);
  const active = effectsActive(options);

  return (
    <CollapsibleSection
      icon="sparkles"
      title="Advanced"
      defaultOpen={false}
      badge={active ? 'on' : undefined}
      action={
        active ? (
          <button className="btn btn--sm btn--subtle" onClick={resetOptions} title="Reset all advanced effects">
            <Icon name="refresh" size={14} /> Reset
          </button>
        ) : undefined
      }
    >
      <p className="adv-intro">
        Optional effects applied to every output, after resizing.
      </p>
      <AdjustmentsGroup />
      <TransparencyGroup />
      <WatermarkGroup />
    </CollapsibleSection>
  );
}
