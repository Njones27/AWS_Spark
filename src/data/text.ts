import type { Band, BandText } from './types';

export function bt(text: BandText, band: Band): string {
  if (typeof text === 'string') return text;
  return text[band] ?? text.builder;
}

export const BANDS: { id: Band; label: string; grades: string; tagline: string }[] = [
  // Every band sees the real AWS names. What changes is how things are explained, how numbers show, and how much help there is.
  { id: 'explorer', label: 'Explorer', grades: 'Grades K–5', tagline: 'Simple words, pictures, and lots of hints' },
  { id: 'builder', label: 'Builder', grades: 'Grades 6–8', tagline: 'Everyday words and real numbers' },
  { id: 'architect', label: 'Architect', grades: 'Grades 9–12', tagline: 'Technical details and how it works' },
];
