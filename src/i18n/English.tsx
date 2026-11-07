import type { ReactNode } from 'react';

/**
 * A part of the app whose words aren't translated yet. It tells the browser (and screen readers) the text is English, and
 * keeps it left to right even when the menu language is Arabic, so English sentences don't get their punctuation
 * flipped. It adds no box of its own (`display: contents`). Remove it from a screen once that screen uses `useT()`.
 */
export function English({ children }: { children: ReactNode }) {
  return (
    <div className="i18n-en" lang="en" dir="ltr">
      {children}
    </div>
  );
}
