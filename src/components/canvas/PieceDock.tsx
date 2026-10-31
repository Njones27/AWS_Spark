import { useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { iconUrl, SERVICES, shortName } from '../../data/services';
import type { ServiceId } from '../../data/types';
import { useServiceTip } from '../ServiceTip';

export interface DockItemSpec {
  service: ServiceId;
  /** Pieces left; undefined means unlimited. */
  left?: number;
  isNew?: boolean;
}

type Drop = (service: ServiceId, at: { x: number; y: number } | null) => void;
/** Told when a drag out of the tray starts and ends, so a phone's pieces sheet can step aside. */
type DragChange = (dragging: boolean) => void;

/** A tray piece. Drag it onto the map (mouse or touch), or tap/Enter to drop it in a free spot. */
function DockItem({
  item,
  onDrop,
  onDragChange,
  size,
}: {
  item: DockItemSpec;
  onDrop: Drop;
  onDragChange?: DragChange;
  size: 'lg' | 'sm';
}) {
  const def = SERVICES[item.service];
  const { props: tipProps, tip } = useServiceTip(item.service);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const empty = item.left === 0;

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    tipProps.onPointerDown();
    if (empty || e.button > 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!start.current) return;
    if (ghost || Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 6) {
      if (!ghost) onDragChange?.(true);
      setGhost({ x: e.clientX, y: e.clientY });
    }
  };
  const up = (e: PointerEvent) => {
    if (!start.current) return;
    const dragged = !!ghost;
    start.current = null;
    setGhost(null);
    onDrop(item.service, dragged ? { x: e.clientX, y: e.clientY } : null);
    if (dragged) onDragChange?.(false);
  };
  const cancel = () => {
    start.current = null;
    if (ghost) onDragChange?.(false);
    setGhost(null);
  };

  return (
    <>
      <button
        className={`dock-item dock-${size} ${empty ? 'is-empty' : ''} ${item.isNew ? 'is-new' : ''}`}
        disabled={empty}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        // The browser can stop tracking a drag without a pointercancel; end the drag so a hidden tray comes back.
        onLostPointerCapture={cancel}
        // Keyboard activation (pointer clicks are handled on pointer-up).
        onClick={(e) => e.detail === 0 && !empty && onDrop(item.service, null)}
        aria-label={`Add ${def.name}${item.left !== undefined ? `, ${item.left} left` : ''}`}
        aria-describedby={tipProps['aria-describedby']}
        onPointerEnter={tipProps.onPointerEnter}
        onPointerLeave={tipProps.onPointerLeave}
        onFocus={tipProps.onFocus}
        onBlur={tipProps.onBlur}
      >
        <img src={iconUrl(item.service)} alt="" draggable={false} />
        <span className="dock-name">{shortName(item.service)}</span>
        {item.left !== undefined && <span className="dock-count">×{item.left}</span>}
        {item.isNew && <span className="dock-new">new</span>}
      </button>
      {tip}
      {ghost &&
        createPortal(
          <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
            <img src={iconUrl(item.service)} alt="" />
          </div>,
          document.body,
        )}
    </>
  );
}

export function PieceDock({
  items,
  onDrop,
  onDragChange,
  size = 'lg',
}: {
  items: DockItemSpec[];
  onDrop: Drop;
  onDragChange?: DragChange;
  size?: 'lg' | 'sm';
}) {
  return (
    <div className={`dock dock-wrap-${size}`}>
      {items.map((it) => (
        <DockItem key={it.service} item={it} onDrop={onDrop} onDragChange={onDragChange} size={size} />
      ))}
    </div>
  );
}
