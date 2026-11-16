// Обчислювані дані для інтерфейсу.
import { CLUB_BY_ID } from '../data/clubs';
import { SPECIAL_BY_ID } from '../data/specials';
import { ROUNDS, userFixture } from '../systems/season';
import { ALL_CLUB_IDS } from '../systems/squad';
import { computeTable, positionOf } from '../systems/table';
import type { PlayerState, SaveState } from '../systems/types';

export const tableOf = (s: SaveState) => computeTable(ALL_CLUB_IDS, s.results);
export const userPos = (s: SaveState) => positionOf(tableOf(s), s.userClub);
export const clubName = (id: string) => CLUB_BY_ID[id]?.name ?? id;
export const playerName = (p: PlayerState) => (p.special ? SPECIAL_BY_ID[p.special]?.name ?? '' : `Гравець №${p.num}`);
export const playerImg = (p: PlayerState, clubId: string) => (p.special ? SPECIAL_BY_ID[p.special].img : CLUB_BY_ID[clubId].logo);

export function nextMatch(s: SaveState) {
  if (s.round >= ROUNDS) return null;
  const fx = userFixture(s);
  if (!fx) return null;
  const home = fx.home === s.userClub;
  return { fx, home, opp: home ? fx.away : fx.home };
}

export function lastResult(s: SaveState) {
  const m = s.userMatches[s.userMatches.length - 1];
  if (!m) return null;
  const home = m.home === s.userClub;
  const us = home ? m.score[0] : m.score[1], them = home ? m.score[1] : m.score[0];
  return { m, home, us, them, opp: home ? m.away : m.home, res: us > them ? 'W' : us === them ? 'D' : 'L' as 'W' | 'D' | 'L' };
}

export const fmtTime = (ts: number) => new Date(ts).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Українська множина: plural(3, 'матч', 'матчі', 'матчів') → «3 матчі». */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  const w = a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
  return `${n} ${w}`;
}
export const matchesWord = (n: number) => plural(n, 'матч', 'матчі', 'матчів');
