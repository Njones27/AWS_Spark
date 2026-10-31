import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

const MIN = 220;
const MAX = 520;
const STEP = 24;

interface Saved {
  width: number;
  open: boolean;
}

function load(key: string, width: number): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Saved> | null;
    return {
      width: typeof raw?.width === 'number' ? clamp(raw.width) : width,
      open: raw?.open !== false,
    };
  } catch {
    return { width, open: true };
  }
}

/** The panel's width on screen, which the CSS caps below the saved one on a narrow window. Resizing starts from it. */
function shownWidth(handle: HTMLElement) {
  return handle.parentElement?.getBoundingClientRect().width ?? MIN;
}

function clamp(w: number) {
  return Math.round(Math.min(MAX, Math.max(MIN, w)));
}

/**
 * A panel down the left of the map that the student can drag wider or narrower, or fold away to give the map the whole
 * screen. Its width and whether it's open are remembered (per panel) on this device.
 */
export function SidePanel({
  id,
  label,
  width,
  className,
  children,
}: {
  /** Names the saved width, so each screen's panel keeps its own. */
  id: string;
  /** What the panel holds, for the show/hide button ("Mission", "Pieces"). */
  label: string;
  /** Starting width in pixels. */
  width: number;
  className: string;
  children: ReactNode;
}) {
  const key = `spark-panel-${id}`;
  const [saved, setSaved] = useState(() => load(key, width));
  const [dragging, setDragging] = useState(false);
  const panelId = useId();
  const start = useRef<{ x: number; width: number } | null>(null);

  // Saved once a drag ends, not on every step of it.
  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(key, JSON.stringify(saved));
    } catch {
      // Storage can be blocked; the panel still works, it just isn't remembered.
    }
  }, [key, saved, dragging]);

  const resize = (w: number) => setSaved((s) => ({ ...s, width: clamp(w) }));
  const toggle = () => setSaved((s) => ({ ...s, open: !s.open }));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, width: shownWidth(e.currentTarget) };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current) resize(start.current.width + e.clientX - start.current.x);
  };
  const onPointerUp = () => {
    start.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const shown = shownWidth(e.currentTarget);
    const next =
      e.key === 'ArrowLeft' ? shown - STEP
      : e.key === 'ArrowRight' ? shown + STEP
      : e.key === 'Home' ? MIN
      : e.key === 'End' ? MAX
      : null;
    if (next === null) return;
    e.preventDefault();
    resize(next);
  };

  const style = { '--panel-w': `${saved.width}px` } as CSSProperties;
  return (
    <div className={`side-panel ${saved.open ? '' : 'is-closed'} ${dragging ? 'is-resizing' : ''}`} style={style}>
      <aside id={panelId} className={className} aria-label={label}>
        {children}
      </aside>
      {saved.open && (
        <div
          className="panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label.toLowerCase()} panel`}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={saved.width}
          tabIndex={0}
          title="Drag to resize. Double-click to reset."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => resize(width)}
          onKeyDown={onKeyDown}
        />
      )}
      <button
        type="button"
        className="panel-toggle"
        aria-controls={panelId}
        aria-expanded={saved.open}
        title={saved.open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        onClick={toggle}
      >
        <span aria-hidden="true">{saved.open ? '‹' : '›'}</span>
        {!saved.open && (
          <span className="panel-toggle-label" aria-hidden="true">
            {label}
          </span>
        )}
        <span className="sr-only">{saved.open ? `Hide ${label}` : `Show ${label}`}</span>
      </button>
    </div>
  );
}
