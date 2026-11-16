// Економіка: нарахування медіакоїнів за матч. Усі суми — у data/balance.ts.
import { BALANCE as B } from '../data/balance';
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
