import type { Band, BandText } from './types';

export function bt(text: BandText, band: Band): string {
  if (typeof text === 'string') return text;
  return text[band] ?? text.builder;
}

export const BANDS: { id: Band; label: string; grades: string; tagline: string }[] = [
  { id: 'explorer', label: 'Explorer', grades: 'Grades K–5', tagline: 'Pictures, friendly names, and lots of hints' },
  { id: 'builder', label: 'Builder', grades: 'Grades 6–8', tagline: 'Friendly names plus the real AWS names' },
  { id: 'architect', label: 'Architect', grades: 'Grades 9–12', tagline: 'Real AWS names, numbers, and how it works' },
];
