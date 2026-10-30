import { ADVANCED } from './advanced';
import { CHAPTER_1, type Chapter, type Level } from './levels';

export const CHAPTERS: Chapter[] = [CHAPTER_1, ADVANCED];

export const ALL_LEVELS: Level[] = CHAPTERS.flatMap((c) => c.levels);

export function levelById(id: string): Level | undefined {
  return ALL_LEVELS.find((l) => l.id === id);
}

export function chapterOf(level: Level): Chapter {
  return CHAPTERS.find((c) => c.levels.includes(level))!;
}
