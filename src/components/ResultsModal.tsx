import { Icon } from './Icon';
import { useBackend } from '../backend/context';
import { useToast } from '../lib/toast';
import { formatBytes, pctChange } from '../lib/util';
import { useStore } from '../store/useStore';

export function ResultsModal({ onClose }: { onClose: () => void }) {
  const backend = useBackend();
  const toast = useToast();
  const summary = useStore((s) => s.summary);
  const live = useStore((s) => s.liveResults);
  const rows = summary?.results ?? live;
  const firstOk = rows.find((r) => r.status === 'ok');

  const openFile = async (path: string) => {
    if (!path) return toast.error('No file path for this result.');
    try {
      await backend.openPath(path);
    } catch (e) {
      toast.error(`Couldn’t open the file: ${String(e)}`);
    }
  };

  const openFolder = async (path: string) => {
    if (!path) return toast.error('No file path for this result.');
    try {
      await backend.revealInFolder(path);
    } catch (e) {
      toast.error(`Couldn’t open the folder: ${String(e)}`);
    }
  };

  const okRows = rows.filter((r) => r.status === 'ok');
  const savedBytes = okRows.reduce((acc, r) => acc + (r.originalBytes - r.bytes), 0);

  // The "best" output for each source image+size = the smallest file. Only flag
  // it when there's more than one variant to compare, so a lone output isn't
  // labelled. Key by inputId + dimensions so different sizes compete fairly.
  const bestRowIdx = new Set<number>();
  const byGroup = new Map<string, { idx: number; bytes: number; count: number }>();
  rows.forEach((r, idx) => {
    if (r.status !== 'ok') return;
    const key = `${r.inputId}|${r.width}x${r.height}`;
    const cur = byGroup.get(key);
    if (!cur) byGroup.set(key, { idx, bytes: r.bytes, count: 1 });
    else {
      cur.count += 1;
      if (r.bytes < cur.bytes) {
        cur.idx = idx;
        cur.bytes = r.bytes;
      }
    }
  });
  for (const g of byGroup.values()) if (g.count > 1) bestRowIdx.add(g.idx);

  // Overall recommendation: among the flagged "best" rows, the format that wins
  // most often is the one to suggest for this batch.
  let recommendation: string | null = null;
  if (bestRowIdx.size > 0) {
    const wins = new Map<string, number>();
    for (const idx of bestRowIdx) {
      const r = rows[idx];
      const label = `${r.format.toUpperCase()} (${r.options})`;
      wins.set(label, (wins.get(label) ?? 0) + 1);
    }
    recommendation = [...wins.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">
            <Icon name="checkCircle" size={18} /> Results
            {summary && (
              <span className="hint" style={{ marginLeft: 10 }}>
                {summary.ok} ok · {summary.skipped} skipped · {summary.failed} failed
              </span>
            )}
          </div>
          <div className="row">
            {firstOk && (
              <button className="btn btn--sm btn--subtle" onClick={() => openFolder(firstOk.outputPath)}>
                <Icon name="folder" size={15} /> Open folder
              </button>
            )}
            <button className="iconbtn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="modal__body" style={{ padding: 0, maxHeight: '68vh' }}>
          <table className="results">
            <thead>
              <tr>
                <th>Status</th>
                <th>File</th>
                <th>Size</th>
                <th>Format</th>
                <th>Options</th>
                <th>Dimensions</th>
                <th>Output</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={bestRowIdx.has(i) ? 'is-best' : undefined}>
                  <td>
                    <span className={`res-status ${r.status}`}>
                      <Icon name={r.status === 'ok' ? 'check' : r.status === 'skipped' ? 'info' : 'alert'} size={14} />
                      {r.status}
                    </span>
                  </td>
                  <td className="truncate" style={{ maxWidth: 200 }} title={r.inputName}>
                    {r.inputName}
                  </td>
                  <td>{r.sizeLabel}</td>
                  <td>{r.format.toUpperCase()}</td>
                  <td className="muted" title={r.options}>
                    {r.options}
                  </td>
                  <td>{r.status === 'ok' ? `${r.width}×${r.height}` : '—'}</td>
                  <td>
                    {r.status === 'ok' ? (
                      <>
                        {formatBytes(r.bytes)}{' '}
                        <span className={`delta ${r.bytes <= r.originalBytes ? 'good' : 'bad'}`}>
                          {pctChange(r.originalBytes, r.bytes).toFixed(0)}%
                        </span>
                        {bestRowIdx.has(i) && (
                          <span className="best-badge" title="Smallest file for this image">
                            <Icon name="sparkles" size={11} /> best
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="muted truncate" style={{ maxWidth: 220, display: 'inline-block' }} title={r.error ?? ''}>
                        {r.error ?? '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.status === 'ok' && (
                      <button className="iconbtn" title="Open file" aria-label="Open file" onClick={() => openFile(r.outputPath)}>
                        <Icon name="external" size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(savedBytes > 0 || recommendation) && (
          <div className="modal__foot" style={{ justifyContent: 'space-between' }}>
            {recommendation ? (
              <span className="muted">
                <Icon name="sparkles" size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Best results for this batch: <b>{recommendation}</b>
              </span>
            ) : (
              <span />
            )}
            {savedBytes > 0 && (
              <span className="muted">
                Total saved: <b className="delta good">{formatBytes(savedBytes)}</b>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
