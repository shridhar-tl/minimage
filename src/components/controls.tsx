import type { ReactNode } from 'react';

import { cx } from '../lib/util';

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" />
      <span className="switch__thumb" />
      {label != null && <span>{label}</span>}
    </label>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label?: ReactNode;
  icon?: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          title={o.title}
          className={cx(o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint != null && <span className="hint">{hint}</span>}
    </label>
  );
}

/**
 * A compact labeled range slider with a live value read-out. Used for the
 * advanced color/watermark controls. `format` customizes the read-out text.
 */
export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  format,
  onChange,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: ReactNode;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-row">
      <div className="row spread" style={{ marginBottom: 4 }}>
        <span className="label-hint">
          <span className="field__label">{label}</span>
          {hint}
        </span>
        <span className="quality-row__val">
          {format ? format(value) : value}
          {suffix}
        </span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  min = 0,
  max,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <input
      className="input input--sm"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value.trim();
        onChange(raw === '' ? null : Math.max(min, Number(raw)));
      }}
    />
  );
}
