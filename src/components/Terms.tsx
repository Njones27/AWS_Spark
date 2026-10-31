import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findTerms, type Term } from '../data/glossary';
import { useBand } from '../store';
import { placeTip } from './ServiceTip';

/**
 * Text with its technical words made tappable. Architect wording (which College players also get) keeps the real
 * terms, so each one opens a definition in everyday words. The other bands are already written in everyday words.
 */
export function Terms({ text }: { text: string }) {
  const band = useBand();
  if (band !== 'architect') return <>{text}</>;
  return (
    <>
      {findTerms(text).map((p, i) => (typeof p === 'string' ? p : <TermButton key={`${i}-${p.term.id}`} term={p.term} text={p.text} />))}
    </>
  );
}

function TermButton({ term, text }: { term: Term; text: string }) {
  const id = useId();
  const btn = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (anchor && box.current) setPos(placeTip(anchor, box.current));
  }, [anchor]);

  // Tapping anywhere else, scrolling, or Escape closes it.
  useEffect(() => {
    if (!anchor) return;
    const close = () => {
      setAnchor(null);
      setPos(null);
    };
    const outside = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Don't also close the dialog the word sits in.
      e.stopPropagation();
      close();
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', key, true);
    };
  }, [anchor]);

  const toggle = (el: HTMLElement) => {
    setPos(null);
    // A word that wraps onto two lines has two boxes; anchor the tip to the line that was tapped (the first one).
    setAnchor(anchor ? null : el.getClientRects()[0] ?? el.getBoundingClientRect());
  };

  return (
    <>
      {/* A span rather than a <button>: browsers lay buttons out as unbreakable boxes, so a long term (or the bracket
          or comma after it) jumped to its own line. A span wraps with the sentence like any other word. */}
      <span
        ref={btn}
        role="button"
        tabIndex={0}
        className="term"
        aria-expanded={!!anchor}
        aria-describedby={anchor ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          toggle(e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          toggle(e.currentTarget);
        }}
      >
        {text}
      </span>
      {/* The tip opens beside a button that already has focus, so screen readers hear the definition from here. */}
      <span className="sr-only" role="status">
        {anchor ? `${term.title}: ${term.def}` : ''}
      </span>
      {anchor &&
        createPortal(
          <div
            ref={box}
            id={id}
            role="tooltip"
            className="service-tip"
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            <strong>{term.title}</strong>
            <span>{term.def}</span>
          </div>,
          document.body,
        )}
    </>
  );
}
