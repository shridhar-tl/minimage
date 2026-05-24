import { useState, type ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

/**
 * A `.section` whose body collapses when its header is clicked. The header keeps
 * the familiar title + icon + optional badge, and an optional `action` slot on
 * the right stays independently clickable (it doesn't toggle the section).
 */
export function CollapsibleSection({
  icon,
  title,
  badge,
  action,
  defaultOpen = true,
  children,
}: {
  icon: IconName;
  title: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="section">
      <div className="section__head">
        <button
          type="button"
          className="section__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon
            name="chevronRight"
            size={15}
            className="section__chevron"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          />
          <span className="section__title">
            <Icon name={icon} size={16} /> {title}
            {badge != null && <span className="badge">{badge}</span>}
          </span>
        </button>
        {action && <div className="section__action">{action}</div>}
      </div>

      {open && <div className="section__content">{children}</div>}
    </div>
  );
}
