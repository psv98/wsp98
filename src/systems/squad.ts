// Склади клубів: створення заявки, вибір стартових 11, підготовка команди до матчу.
import { BALANCE as B } from '../data/balance';
import { CLUB_BY_ID, CLUBS, type ClubDef } from '../data/clubs';
import { FORMATIONS, FORMATION_IDS, SQUAD_ROLES, roleFit, type FormationId, type Role } from '../data/formations';
import { SPECIAL_BY_ID } from '../data/specials';
import { hashSeed, makeRng } from '../simulation/rng';
import { restoreCost } from '../simulation/fatigue';
import type { PlayerInit, TeamSetup } from '../simulation/types';
import type { ClubState, PlayerState, SaveState } from './types';

const emptyStats = () => ({ apps: 0, goals: 0, assists: 0, yc: 0, rc: 0, saves: 0, motm: 0 });

function roleRating(def: ClubDef, role: Role): number {
  switch (role) {
    case 'GK': return def.keeper;
    case 'CB': case 'FB': return def.defense;
    case 'DM': return (def.defense + def.passing) / 2;
    case 'CM': return def.passing;
    default: return def.attack;
  }
}

export function genericPlayer(def: ClubDef, idx: number, seed: number): PlayerState {
  const rng = makeRng(hashSeed(seed, def.id, idx));
  const role = SQUAD_ROLES[idx];
  const q = Math.round((roleRating(def, role) + (rng() - 0.5) * 5 - (idx >= 11 ? 3 : 0)) * 10) / 10;
  return { id: `${def.id}-${idx}`, num: idx + 1, role, q, stamina: 100, injured: 0, suspended: 0, yellows: 0, s: emptyStats() };
}

export function createClub(def: ClubDef, seed: number): ClubState {
  const players = SQUAD_ROLES.map((_, i) => genericPlayer(def, i, seed));
  const formation: FormationId = FORMATION_IDS[hashSeed(def.id) % FORMATION_IDS.length];
  const club: ClubState = { id: def.id, boost: 0, formation, players, lineup: [], megaTransfers: [], coins: clubStartCoins(def), finance: { season: 1, income: 0, spend: 0, log: [] } };
  club.lineup = autoLineup(club, false);
  return club;
}

/** Стартовий бюджет клубу-суперника: сильніші клуби мають більше, але слабші теж можуть розвиватися. */
export function clubStartCoins(def: ClubDef): number {
  const E = B.economy;
  return Math.round((E.clubStartTop - ((def.seed - 1) / 17) * (E.clubStartTop - E.clubStartBottom)) / 100) * 100;
}

export const isAvailable = (p: PlayerState) => p.injured <= 0 && p.suspended <= 0;

/** Рейтинг гравця з урахуванням здібностей (для вибору складу та відображення). */
export function playerQ(p: PlayerState, isUser: boolean): number {
  const gain = p.dev?.gained ?? 0;
  if (p.special) { const sp = SPECIAL_BY_ID[p.special]; if (sp) return Math.min(B.development.cap, (isUser ? sp.user.q : sp.opp.q) + gain); }
  return Math.min(B.development.cap, p.q + gain);
}

/** Рейтинг без розвитку — «стартовий». */
export function baseQ(p: PlayerState, isUser: boolean): number {
  if (p.special) { const sp = SPECIAL_BY_ID[p.special]; if (sp) return isUser ? sp.user.q : sp.opp.q; }
  return p.q;
}

/** Множник для вибору складу: втомлених ставимо неохоче, критично виснажених — лише якщо немає заміни. */
const fitnessFactor = (st: number) => (0.75 + 0.25 * Math.min(1, st / 80)) * (st < B.fatigue.aiBenchBelow ? 0.62 : 1);

/** Найкращі 11 для схеми клубу з доступних гравців. */
export function autoLineup(club: ClubState, isUser: boolean, formation: FormationId = club.formation): string[] {
  const slots = FORMATIONS[formation];
  const used = new Set<string>();
  const res: string[] = new Array(slots.length).fill('');
  // спершу найдефіцитніші позиції: воротар, далі за порядком
  const order = slots.map((_, i) => i).sort((a, b) => (slots[a].role === 'GK' ? -1 : 0) - (slots[b].role === 'GK' ? -1 : 0));
  for (const si of order) {
    let best: PlayerState | null = null, bs = -1;
    for (const p of club.players) {
      if (used.has(p.id) || !isAvailable(p)) continue;
      const fit = roleFit(p.role, slots[si].role);
      const s = playerQ(p, isUser) * fit * fitnessFactor(p.stamina) + (fit === 1 ? 4 : 0);
      if (s > bs) { bs = s; best = p; }
    }
    if (best) { res[si] = best.id; used.add(best.id); }
  }
  return res;
}

/** Стартовий склад користувача: зберігаємо його вибір, але замінюємо недоступних. */
export function resolveLineup(club: ClubState, isUser: boolean): string[] {
  if (!isUser) return autoLineup(club, false);
  const slots = FORMATIONS[club.formation];
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const res = slots.map((_, i) => { const p = byId.get(club.lineup[i] ?? ''); return p && isAvailable(p) ? p.id : ''; });
  const dup = new Set<string>();
  for (let i = 0; i < res.length; i++) { if (res[i] && dup.has(res[i])) res[i] = ''; dup.add(res[i]); }
  for (let i = 0; i < res.length; i++) {
    if (res[i]) continue;
    let best: PlayerState | null = null, bs = -1;
    for (const p of club.players) {
      if (res.includes(p.id) || !isAvailable(p)) continue;
      const s = playerQ(p, true) * roleFit(p.role, slots[i].role) * fitnessFactor(p.stamina);
      if (s > bs) { bs = s; best = p; }
    }
    if (best) res[i] = best.id;
  }
  return res;
}

export function clubStrength(state: SaveState, clubId: string): number {
  const club = state.clubs[clubId];
  const isUser = clubId === state.userClub;
  const ids = resolveLineup(club, isUser);
  const byId = new Map(club.players.map((p) => [p.id, p]));
  let sum = 0, n = 0;
  for (const id of ids) { const p = byId.get(id); if (p) { sum += playerQ(p, isUser) + (isUser ? 0 : club.boost); n++; } }
  return n ? sum / n : 0;
}

export function teamCondition(club: ClubState): number {
  const ps = club.players.filter(isAvailable);
  return ps.length ? Math.round(ps.reduce((a, p) => a + p.stamina, 0) / ps.length) : 0;
}

/** Готує команду до матчу для рушія симуляції. */
export function buildTeamSetup(state: SaveState, clubId: string, isHome: boolean): TeamSetup {
  const club = state.clubs[clubId];
  const def = CLUB_BY_ID[clubId];
  const isUser = clubId === state.userClub;
  const ids = resolveLineup(club, isUser).filter(Boolean);
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const toInit = (p: PlayerState): PlayerInit => ({ pid: p.id, num: p.num, role: p.role, q: p.q + (isUser ? 0 : club.boost), stamina: p.stamina, special: p.special, qBonus: p.dev?.gained ?? 0, boost: p.dev?.focus });
  const starters = ids.map((id) => toInit(byId.get(id)!));
  const bench = club.players.filter((p) => !ids.includes(p.id) && isAvailable(p)).map(toInit);
  const ihorInGoal = starters[0]?.special === 'ihor';
  return {
    clubId, name: def.name, formation: club.formation, discipline: def.discipline, homeBonus: isHome ? def.home : 0,
    starters, bench, isUser,
    stormArmed: ihorInGoal && state.transfers.ihor.count >= state.transfers.ihor.target,
  };
}

export const ALL_CLUB_IDS = CLUBS.map((c) => c.id);
export { emptyStats };
export const staminaCost = (p: PlayerState) => restoreCost(p.stamina);
export const treatCost = (p: PlayerState) => p.injured * B.injuries.treatCostPerMatch;

/** Попередження про втому основного складу користувача перед матчем. */
export function fatigueWarning(state: SaveState): { level: 'tired' | 'critical'; players: { id: string; name: string; stamina: number }[] } | null {
  const club = state.clubs[state.userClub];
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const xi = resolveLineup(club, true).map((id) => byId.get(id)).filter((p): p is PlayerState => !!p);
  const low = xi.filter((p) => p.stamina < B.fatigue.lowThreshold).sort((a, b) => a.stamina - b.stamina);
  if (!low.length) return null;
  return {
    level: low.some((p) => p.stamina < B.fatigue.criticalThreshold) ? 'critical' : 'tired',
    players: low.map((p) => ({ id: p.id, name: p.special ? SPECIAL_BY_ID[p.special].name : `Гравець №${p.num}`, stamina: Math.round(p.stamina) })),
  };
}

/** Загальна вартість відновлення всіх утомлених гравців користувача. */
export const restoreAllCost = (club: ClubState) => club.players.filter((p) => p.stamina < 100).reduce((a, p) => a + staminaCost(p), 0);
