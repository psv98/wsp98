import { describe, expect, it } from 'vitest';
import { CLUBS } from '../src/data/clubs';
import { generateSchedule, validateSchedule } from '../src/systems/schedule';
import { computeTable } from '../src/systems/table';
import type { MatchSummary } from '../src/systems/types';

const ids = CLUBS.map((c) => c.id);

describe('календар', () => {
  it('18 клубів у конфігурації з унікальними id', () => {
    expect(CLUBS).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
    expect(CLUBS[0].strength).toBeGreaterThan(CLUBS[17].strength);
  });

  it('34 тури по 9 матчів, 306 матчів, кожен з кожним удома і на виїзді', () => {
    for (const seed of [1, 2, 3, 99, 12345, 777777]) {
      const s = generateSchedule(ids, seed);
      expect(s).toHaveLength(34);
      expect(s.every((r) => r.length === 9)).toBe(true);
      expect(s.flat()).toHaveLength(306);
      expect(validateSchedule(s, ids)).toEqual([]);
      for (const id of ids) {
        expect(s.flat().filter((f) => f.home === id)).toHaveLength(17);
        expect(s.flat().filter((f) => f.away === id)).toHaveLength(17);
      }
    }
  });

  it('у межах одного кола пари не повторюються', () => {
    const s = generateSchedule(ids, 5);
    const first = new Set<string>();
    for (const f of s.slice(0, 17).flat()) {
      const k = [f.home, f.away].sort().join('-');
      expect(first.has(k)).toBe(false);
      first.add(k);
    }
    expect(first.size).toBe(153);
  });

  it('валідатор знаходить зіпсований календар', () => {
    const s = generateSchedule(ids, 5);
    s[3][0] = { ...s[3][1] };
    expect(validateSchedule(s, ids).length).toBeGreaterThan(0);
  });
});

describe('турнірна таблиця', () => {
  const m = (home: string, away: string, a: number, b: number): MatchSummary => ({ round: 0, home, away, score: [a, b] });
  it('очки: 3 за перемогу, 1 за нічию, 0 за поразку', () => {
    const t = computeTable(['a', 'b', 'c'], [[m('a', 'b', 2, 0)], [m('b', 'c', 1, 1)], [m('c', 'a', 0, 1)]]);
    const row = (id: string) => t.find((r) => r.id === id)!;
    expect(row('a')).toMatchObject({ p: 2, w: 2, d: 0, l: 0, gf: 3, ga: 0, gd: 3, pts: 6 });
    expect(row('b')).toMatchObject({ p: 2, w: 0, d: 1, l: 1, pts: 1 });
    expect(row('c')).toMatchObject({ p: 2, w: 0, d: 1, l: 1, pts: 1 });
    expect(t[0].id).toBe('a');
  });
  it('сортування: очки → різниця → забиті', () => {
    const t = computeTable(['a', 'b', 'c', 'd'], [[m('a', 'b', 1, 0), m('c', 'd', 3, 0)], [m('b', 'd', 4, 3)]]);
    expect(t.map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
    const t2 = computeTable(['a', 'b', 'c', 'd'], [[m('a', 'b', 2, 1), m('c', 'd', 1, 0)]]);
    expect(t2.map((r) => r.id).slice(0, 2)).toEqual(['a', 'c']); // однакова різниця, більше забитих
  });
  it('сума очок і голів узгоджена', () => {
    const t = computeTable(['a', 'b'], [[m('a', 'b', 2, 2)], [m('b', 'a', 0, 5)]]);
    expect(t.reduce((s, r) => s + r.gf, 0)).toBe(t.reduce((s, r) => s + r.ga, 0));
    expect(t.reduce((s, r) => s + r.gd, 0)).toBe(0);
  });
});
