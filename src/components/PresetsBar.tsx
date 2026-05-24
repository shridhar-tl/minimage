import { useEffect, useState } from 'react';

import { Icon } from './Icon';
import { InfoHint } from './InfoHint';
import { HINTS } from '../lib/hints';
import { deletePreset, loadPresets, savePreset, type Preset } from '../lib/presets';
import { useToast } from '../lib/toast';
import { useStore, type ConfigSnapshot } from '../store/useStore';

/** Pull the current settings (minus images) into a snapshot for saving. */
function snapshot(): ConfigSnapshot {
  const s = useStore.getState();
  return { sizes: s.sizes, formats: s.formats, output: s.output, options: s.options };
}

export function PresetsBar() {
  const toast = useToast();
  const applyConfig = useStore((s) => s.applyConfig);
  // Read persisted presets once on mount (localStorage is synchronous here).
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  // Close the menu on an outside click.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const apply = (p: Preset) => {
    applyConfig(p.config);
    setOpen(false);
    toast.success(`Loaded preset “${p.name}”`);
  };

  const save = () => {
    const next = savePreset(name, snapshot());
    setPresets(next);
    setName('');
    toast.success('Preset saved');
  };

  const remove = (e: React.MouseEvent, p: Preset) => {
    e.stopPropagation();
    setPresets(deletePreset(p.id));
    toast.info(`Deleted “${p.name}”`);
  };

  return (
    <div className="presets-bar" onClick={(e) => e.stopPropagation()}>
      <span className="label-hint">
        <Icon name="bookmark" size={15} className="presets-bar__icon" />
        <span className="presets-bar__label">Presets</span>
        <InfoHint hint={HINTS.presets} />
      </span>

      <div className="presets-bar__menu">
        <button className="btn btn--sm btn--subtle" onClick={() => setOpen((v) => !v)}>
          Load
          <Icon name="chevronDown" size={14} />
        </button>
        {open && (
          <div className="presets-pop" role="menu">
            {presets.length === 0 ? (
              <div className="presets-pop__empty">No saved presets yet.</div>
            ) : (
              presets.map((p) => (
                <button key={p.id} className="presets-pop__item" role="menuitem" onClick={() => apply(p)}>
                  <span className="presets-pop__name">{p.name}</span>
                  <span
                    className="iconbtn danger presets-pop__del"
                    role="button"
                    aria-label={`Delete ${p.name}`}
                    onClick={(e) => remove(e, p)}
                  >
                    <Icon name="trash" size={13} />
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <input
        className="input input--sm presets-bar__name"
        placeholder="Name to save…"
        value={name}
        spellCheck={false}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) save();
        }}
      />
      <button className="btn btn--sm" disabled={!name.trim()} onClick={save} title="Save current settings as a preset">
        <Icon name="bookmark" size={14} /> Save
      </button>
    </div>
  );
}
