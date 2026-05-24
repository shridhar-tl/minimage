import { useRef, useState } from 'react';

import { Icon } from './Icon';
import { clamp } from '../lib/util';

export function CompareSlider({ before, after }: { before: string; after: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pos, setPos] = useState(50);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(clamp(((clientX - r.left) / r.width) * 100, 0, 100));
  };

  return (
    <div
      className="compare"
      ref={ref}
      onPointerDown={(e) => {
        dragging.current = true;
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) move(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerLeave={() => {
        dragging.current = false;
      }}
    >
      <img src={before} alt="Original" draggable={false} />
      <div className="compare__after" style={{ width: `${pos}%` }}>
        <img src={after} alt="Processed" draggable={false} />
      </div>
      <span className="compare__tag" style={{ left: 10 }}>
        Before
      </span>
      <span className="compare__tag" style={{ right: 10 }}>
        After
      </span>
      <div className="compare__handle" style={{ left: `${pos}%` }}>
        <div className="compare__grip">
          <Icon name="chevronLeft" size={13} />
          <Icon name="chevronRight" size={13} />
        </div>
      </div>
    </div>
  );
}
