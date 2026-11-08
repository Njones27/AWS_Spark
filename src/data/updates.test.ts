import { describe, expect, it } from 'vitest';
import { daysAgo, recentUpdates, UPDATES, WINDOW_DAYS, type Update } from './updates';

const entry = (id: string, date: string): Update => ({ id, date, kind: 'new', icon: 'bell', title: id, body: id });

describe("what's new", () => {
  it('counts whole days in local time, even late in the evening', () => {
    expect(daysAgo('2026-11-07', new Date(2026, 10, 7, 23, 59))).toBe(0);
    expect(daysAgo('2026-11-06', new Date(2026, 10, 7, 0, 1))).toBe(1);
    expect(daysAgo('2026-10-31', new Date(2026, 10, 7, 12))).toBe(7);
  });

  it('keeps a week of entries, newest first, shows tomorrow\'s, and holds back later ones', () => {
    const now = new Date(2026, 10, 7, 12);
    const list = [
      entry('old', '2026-10-30'),
      entry('edge', '2026-10-31'),
      entry('today', '2026-11-07'),
      entry('tomorrow', '2026-11-08'),
      entry('later', '2026-11-09'),
      entry('mid', '2026-11-03'),
    ];
    expect(recentUpdates(now, list).map((u) => u.id)).toEqual(['tomorrow', 'today', 'mid', 'edge']);
    expect(WINDOW_DAYS).toBe(7);
  });

  it('has well-formed entries with unique ids', () => {
    const ids = UPDATES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of UPDATES) {
      expect(u.date, u.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(u.title.length, u.id).toBeLessThanOrEqual(60);
      expect(u.body.length, u.id).toBeGreaterThan(0);
    }
  });

  it('lists entries newest first in the file', () => {
    const dates = UPDATES.map((u) => u.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
