import { useId } from 'react';
import type { Mood } from '../../data/levels';

/** Sparky: the guide. A little cloud with a lightning-spark tuft. */
export function Sparky({ mood = 'happy', size = 96, bob = true }: { mood?: Mood; size?: number; bob?: boolean }) {
  const look = mood === 'think' ? -3 : 0;
  const shade = `sparky-shade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={bob ? 'sparky bob' : 'sparky'}
      width={size}
      height={(size * 100) / 120}
      viewBox="0 0 120 100"
      role="img"
      aria-label={`Sparky looks ${mood === 'worried' ? 'worried' : mood === 'think' ? 'thoughtful' : 'happy'}`}
    >
      <defs>
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe9f3" />
        </linearGradient>
      </defs>
      {/* spark tuft */}
      <path d="M71 2 L58 24 L66 24 L60 38 L78 15 L69 15 L75 2 Z" fill="var(--sun)" stroke="#e8a800" strokeWidth="1.5" strokeLinejoin="round" />
      {/* body */}
      <g fill={`url(#${shade})`} stroke="#c9d6e3" strokeWidth="2">
        <circle cx="38" cy="60" r="24" />
        <circle cx="64" cy="46" r="30" />
        <circle cx="90" cy="62" r="21" />
        <rect x="18" y="60" width="92" height="32" rx="16" />
      </g>
      {/* cover inner seams */}
      <g fill={`url(#${shade})`}>
        <circle cx="38" cy="60" r="22.5" />
        <circle cx="64" cy="46" r="28.5" />
        <circle cx="90" cy="62" r="19.5" />
        <rect x="19.5" y="61.5" width="89" height="29" rx="14.5" />
      </g>
      {/* cheeks */}
      <ellipse cx="42" cy="72" rx="7" ry="4" fill="var(--coral)" opacity="0.3" />
      <ellipse cx="88" cy="72" rx="7" ry="4" fill="var(--coral)" opacity="0.3" />
      {/* eyes */}
      {mood === 'cheer' ? (
        <g stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M48 62 Q54 54 60 62" />
          <path d="M70 62 Q76 54 82 62" />
        </g>
      ) : (
        <g>
          <ellipse cx="54" cy={60 + look} rx="5" ry="7" fill="var(--ink)" />
          <ellipse cx="76" cy={60 + look} rx="5" ry="7" fill="var(--ink)" />
          <circle cx="56" cy={57 + look} r="1.8" fill="#fff" />
          <circle cx="78" cy={57 + look} r="1.8" fill="#fff" />
        </g>
      )}
      {mood === 'worried' && (
        <g stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M47 49 L58 46" />
          <path d="M83 49 L72 46" />
        </g>
      )}
      {/* mouth */}
      {mood === 'happy' && <path d="M58 73 Q65 80 72 73" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" fill="none" />}
      {mood === 'cheer' && (
        <g>
          <path d="M55 70 Q65 88 75 70 Z" fill="var(--ink)" />
          <path d="M60 78 Q65 83 70 78 Q65 75 60 78 Z" fill="var(--coral)" />
        </g>
      )}
      {mood === 'think' && <circle cx="65" cy="76" r="3.2" fill="var(--ink)" />}
      {mood === 'worried' && (
        <path d="M56 78 Q60 74 64 78 Q68 82 72 78" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}

/** Baker Rosa's portrait for story beats. */
export function Rosa({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label="Baker Rosa">
      <circle cx="40" cy="44" r="34" fill="var(--sun-soft)" />
      {/* hair */}
      <path d="M17 46 Q16 26 40 24 Q64 26 63 46 L63 56 Q58 50 58 42 L22 42 Q22 50 17 56 Z" fill="#6b3f2a" />
      {/* face */}
      <circle cx="40" cy="47" r="19" fill="#e8b48f" />
      {/* hat */}
      <g fill="#fff" stroke="#e4d8c2" strokeWidth="1.5">
        <circle cx="29" cy="16" r="9" />
        <circle cx="40" cy="11" r="11" />
        <circle cx="51" cy="16" r="9" />
        <rect x="24" y="18" width="32" height="12" rx="3" />
      </g>
      <circle cx="33" cy="46" r="2.4" fill="var(--ink)" />
      <circle cx="47" cy="46" r="2.4" fill="var(--ink)" />
      <ellipse cx="29" cy="53" rx="4" ry="2.4" fill="var(--coral)" opacity="0.35" />
      <ellipse cx="51" cy="53" rx="4" ry="2.4" fill="var(--coral)" opacity="0.35" />
      <path d="M34 55 Q40 61 46 55" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* flour smudge */}
      <ellipse cx="50" cy="40" rx="3" ry="1.6" fill="#fff" opacity="0.8" />
    </svg>
  );
}
