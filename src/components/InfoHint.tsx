import type { ReactNode } from 'react';
import { showTooltip, hideTooltip } from 'fluxo-ui';

import { Icon } from './Icon';

export interface HintContent {
  /** Short bold heading shown at the top of the tooltip. */
  title: string;
  /** The main explanation. */
  body: ReactNode;
  /** Optional highlighted call-out (e.g. a recommended value). */
  tip?: ReactNode;
}

/** Renders the rich tooltip body — a small titled card with an optional tip. */
function RichHint({ title, body, tip }: HintContent) {
  return (
    <div className="rich-hint">
      <div className="rich-hint__title">{title}</div>
      <div className="rich-hint__body">{body}</div>
      {tip != null && (
        <div className="rich-hint__tip">
          <Icon name="sparkles" size={12} />
          <span>{tip}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A small "?" affordance that reveals a rich, nicely-styled tooltip on hover —
 * so panels stay compact and explanations appear only on demand. Pass either a
 * structured {@link HintContent} or any ReactNode for full control.
 */
export function InfoHint({
  hint,
  size = 13,
}: {
  hint: HintContent | ReactNode;
  size?: number;
}) {
  const content =
    hint && typeof hint === 'object' && 'title' in (hint as HintContent) ? (
      <RichHint {...(hint as HintContent)} />
    ) : (
      <div className="rich-hint">
        <div className="rich-hint__body">{hint as ReactNode}</div>
      </div>
    );

  return (
    <button
      type="button"
      className="info-hint"
      aria-label="More info"
      tabIndex={-1}
      onClick={(e) => e.preventDefault()}
      onMouseEnter={(e) => showTooltip(e, content)}
      onMouseLeave={() => hideTooltip({ timeout: 0 })}
      onFocus={(e) => showTooltip(e as unknown as React.MouseEvent, content)}
      onBlur={() => hideTooltip({ timeout: 0 })}
    >
      <Icon name="help" size={size} />
    </button>
  );
}

/**
 * A field label with an inline {@link InfoHint}. Replaces the old pattern of a
 * label followed by a permanent block of hint text.
 */
export function LabelWithHint({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: HintContent | ReactNode;
  children?: ReactNode;
}) {
  return (
    <span className="label-hint">
      <span className="field__label">{label}</span>
      {hint != null && <InfoHint hint={hint} />}
      {children}
    </span>
  );
}
