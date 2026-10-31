import { useEffect, useRef, type RefObject } from 'react';

/** While `open`, a press anywhere outside `ref` calls `close`. For drop-down menus. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && latest.current();
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [ref, open]);
}
