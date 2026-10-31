import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { iconUrl, SERVICES, shortName } from '../data/services';
import type { ServiceId } from '../data/types';
import { useBand } from '../store';

const DELAY = 350;
const GAP = 8;
const EDGE = 12;

/** Where a tip goes: above the element (or below, if there's no room), kept inside the window. */
export function placeTip(anchor: DOMRect, box: HTMLElement) {
  const { width, height } = box.getBoundingClientRect();
  const left = Math.min(Math.max(EDGE, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - EDGE);
  const top = anchor.top - height - GAP >= EDGE ? anchor.top - height - GAP : anchor.bottom + GAP;
  return { left, top };
}

/**
 * Hover (mouse) or keyboard-focus explanation for a service: its full name and the blurb for the current band.
 * Spread `props` on the element that triggers it and render `tip` next to it. Touch doesn't open it: tapping a
 * piece opens its info card instead.
 */
export function useServiceTip(service: ServiceId) {
  const band = useBand();
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setAnchor(null);
    setPos(null);
  }, []);

  useEffect(() => {
    if (!anchor) return;
    const close = () => hide();
    window.addEventListener('scroll', close, true);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('wheel', close);
      window.removeEventListener('keydown', close);
    };
  }, [anchor, hide]);

  useEffect(() => {
    if (anchor && box.current) setPos(placeTip(anchor, box.current));
  }, [anchor]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const props = {
    'aria-describedby': anchor ? id : undefined,
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const el = e.currentTarget;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setAnchor(el.getBoundingClientRect()), DELAY);
    },
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) setAnchor(e.currentTarget.getBoundingClientRect());
    },
    onBlur: hide,
  };

  const def = SERVICES[service];
  const tip = anchor
    ? createPortal(
        <div
          ref={box}
          id={id}
          role="tooltip"
          className="service-tip"
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
        >
          <strong>{def.name}</strong>
          <span>{def.blurb[band]}</span>
        </div>,
        document.body,
      )
    : null;

  return { props, tip };
}

/** A chip with a service's icon and short name that explains the service on hover. */
export function ServiceChip({ service, full }: { service: ServiceId; full?: boolean }) {
  const { props, tip } = useServiceTip(service);
  return (
    <>
      <span className="chip" {...props}>
        <img src={iconUrl(service)} alt="" />
        {full ? SERVICES[service].name : shortName(service)}
      </span>
      {tip}
    </>
  );
}
