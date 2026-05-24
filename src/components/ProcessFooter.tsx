import { Icon } from './Icon';
import { useProcess } from '../hooks/useProcess';
import { useStore } from '../store/useStore';

export function ProcessFooter({ onShowResults }: { onShowResults: () => void }) {
  const images = useStore((s) => s.images);
  const sizes = useStore((s) => s.sizes);
  const formats = useStore((s) => s.formats);
  const onlySelected = useStore((s) => s.onlySelected);
  const processing = useStore((s) => s.processing);
  const summary = useStore((s) => s.summary);
  const { run } = useProcess();

  const selectedCount = images.filter((i) => i.selected).length;
  const count = onlySelected ? selectedCount || images.length : images.length;
  const total = count * sizes.length * formats.length;
  const pct = processing.total ? Math.round((processing.current / processing.total) * 100) : 0;

  return (
    <footer className="footer">
      <div className="footer__stats">
        <div className="stat">
          <span className="stat__num">{count}</span>
          <span className="stat__label">Images</span>
        </div>
        <Icon name="x" size={13} className="faint" />
        <div className="stat">
          <span className="stat__num">{sizes.length}</span>
          <span className="stat__label">Sizes</span>
        </div>
        <Icon name="x" size={13} className="faint" />
        <div className="stat">
          <span className="stat__num">{formats.length}</span>
          <span className="stat__label">Formats</span>
        </div>
        <Icon name="arrowRight" size={16} className="faint" />
        <div className="stat">
          <span className="stat__num is-grad">{total}</span>
          <span className="stat__label">Outputs</span>
        </div>
      </div>

      {processing.running ? (
        <div className="footer__progress">
          <div className="pbar">
            <div className="pbar__fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="pbar__label">
            {processing.current}/{processing.total} · {processing.label}
          </div>
        </div>
      ) : (
        summary && (
          <button className="btn btn--subtle" onClick={onShowResults}>
            <Icon name="checkCircle" size={16} /> View results
          </button>
        )
      )}

      <button
        className="btn btn--primary btn--lg"
        disabled={processing.running || total === 0}
        onClick={run}
      >
        {processing.running ? (
          <>
            <Icon name="loader" size={18} className="spin" /> Processing…
          </>
        ) : (
          <>
            <Icon name="zap" size={18} /> Process{total > 0 ? ` ${total}` : ''}
          </>
        )}
      </button>
    </footer>
  );
}
