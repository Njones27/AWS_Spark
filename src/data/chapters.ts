import { ADVANCED } from './advanced';
import { CHAPTER_2 } from './chapter2';
import { CHAPTER_1, type Chapter, type Level } from './levels';

export const CHAPTERS: Chapter[] = [CHAPTER_1, CHAPTER_2, ADVANCED];

/** Story Mode chapters, in order. Each one opens when the one before it is finished. */
export const STORY: Chapter[] = [CHAPTER_1, CHAPTER_2];

export const ALL_LEVELS: Level[] = CHAPTERS.flatMap((c) => c.levels);

export function levelById(id: string): Level | undefined {
  return ALL_LEVELS.find((l) => l.id === id);
}

export function chapterOf(level: Level): Chapter {
  return CHAPTERS.find((c) => c.levels.includes(level))!;
}
