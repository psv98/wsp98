// Економіка: нарахування медіакоїнів за матч. Усі суми — у data/balance.ts.
import { BALANCE as B, BALANCE } from '../data/balance';
import { CLUB_BY_ID } from '../data/clubs';
import { SPECIAL_BY_ID } from '../data/specials';
import { staminaCost, treatCost } from './squad';
import type { CoinEntry, SaveState, UserMatchRecord } from './types';

const E = B.economy;

export function matchRewards(state: SaveState, rec: UserMatchRecord, strengthDiff: number, wasBehind: boolean): CoinEntry[] {
  const userHome = rec.home === state.userClub;
  const us = userHome ? rec.score[0] : rec.score[1];
  const them = userHome ? rec.score[1] : rec.score[0];
  const mk = (amount: number, reason: string): CoinEntry => ({ season: state.season, round: rec.round + 1, amount, reason });
  const out: CoinEntry[] = [];
  if (us > them) out.push(mk(E.win, 'Перемога'));
  else if (us === them) out.push(mk(E.draw, 'Нічия'));
  else out.push(mk(E.loss, 'Участь у матчі'));
  if (us > 0) out.push(mk(us * E.perGoal, `Забиті голи (${us})`));
  if (them === 0) out.push(mk(E.cleanSheet, 'Сухий матч'));
  if (us > them && strengthDiff <= -4) out.push(mk(E.upsetWin, 'Складна перемога над фаворитом'));
  if (us - them >= 3) out.push(mk(E.bigWin, 'Розгромна перемога'));
  if (us > them && wasBehind) out.push(mk(E.comebackWin, 'Вольова перемога'));
  const side = userHome ? 0 : 1;
  const byPlayer: Record<string, number> = {};
  for (const g of rec.goals) if (g.team === side && !g.own) byPlayer[g.name] = (byPlayer[g.name] ?? 0) + 1;
  for (const [name, n] of Object.entries(byPlayer)) if (n >= 3) out.push(mk(E.hatTrick, `Хет-трик: ${name}`));
  return out;
}

export function addCoins(state: SaveState, entries: CoinEntry[]) {
  for (const e of entries) {
    state.coins = Math.max(0, state.coins + e.amount);
    state.coinLog.push(e);
  }
  if (state.coinLog.length > 400) state.coinLog = state.coinLog.slice(-400);
}

export function spend(state: SaveState, amount: number, reason: string): boolean {
  if (!Number.isFinite(amount) || amount < 0 || state.coins < amount) return false;
  state.coins -= amount;
  state.coinLog.push({ season: state.season, round: state.round + 1, amount: -amount, reason });
  return true;
}

// ---------- Економіка клубів-суперників ----------

/** Нараховує або списує медіакоїни клубу-суперника. Дохід понад «мʼяку межу» зменшується, щоб клуби не накопичували нескінченні суми. */
export function clubCoins(state: SaveState, clubId: string, amount: number, reason: string) {
  if (clubId === state.userClub) { addCoins(state, [{ season: state.season, round: state.round + 1, amount, reason }]); return; }
  const club = state.clubs[clubId];
  let a = Math.round(amount);
  if (a > 0 && club.coins > E.clubSoftCap) a = Math.round(a / 2);
  if (a < 0 && club.coins + a < 0) throw new Error(`Клуб ${clubId}: недостатньо коштів`);
  club.coins += a;
  if (club.finance.season !== state.season) club.finance = { season: state.season, income: 0, spend: 0, log: [] };
  if (a >= 0) club.finance.income += a; else club.finance.spend -= a;
  club.finance.log.push({ season: state.season, round: state.round + 1, amount: a, reason });
  if (club.finance.log.length > 60) club.finance.log = club.finance.log.slice(-60);
}

/** Дохід клубу-суперника за матч (та сама шкала, що й у користувача). */
export function aiMatchIncome(us: number, them: number): number {
  return (us > them ? E.win : us === them ? E.draw : E.loss) + us * E.perGoal + (them === 0 ? E.cleanSheet : 0);
}

/** Призові клубам-суперникам за підсумковим місцем. */
export function aiSeasonPrize(pos: number): number { return E.clubPrize[Math.min(E.clubPrize.length - 1, pos - 1)]; }

/** Сезонний спонсорський дохід клубу-суперника. */
export function aiSponsor(clubId: string): number {
  const seed = CLUB_BY_ID[clubId].seed;
  return Math.round((E.clubSponsorTop - ((seed - 1) / 17) * (E.clubSponsorTop - E.clubSponsorBottom)) / 100) * 100;
}

/**
 * Підготовка суперників до туру: відновлюють виснажених основних гравців за медіакоїни (тримаючи резерв бюджету)
 * і лікують травмованих особливих гравців, якщо можуть собі дозволити. Ротацію складу робить autoLineup.
 */
export function aiPrepareClubs(state: SaveState) {
  const F = BALANCE.fatigue;
  for (const club of Object.values(state.clubs)) {
    if (club.id === state.userClub) continue;
    const spare = () => club.coins - F.aiRestoreReserve;
    for (const p of club.players) {
      if (p.injured > 0 && p.special && SPECIAL_BY_ID[p.special] && treatCost(p) < spare() * 0.5) clubCoins(state, club.id, -treatCost(p), 'Лікування'), (p.injured = 0);
    }
    const inXI = new Set(club.lineup);
    const tired = club.players.filter((p) => p.stamina < F.aiRestoreBelow && p.injured <= 0).sort((a, b) => Number(inXI.has(b.id)) - Number(inXI.has(a.id)) || a.stamina - b.stamina);
    for (const p of tired) {
      const cost = staminaCost(p);
      if (cost <= 0 || cost > spare()) continue;
      clubCoins(state, club.id, -cost, 'Відновлення витривалості');
      p.stamina = 100;
    }
  }
}
