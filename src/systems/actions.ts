// Дії менеджера. Кожна функція чиста: приймає стан і повертає новий (або кидає помилку з поясненням).
import { BALANCE as B } from '../data/balance';
import { FORMATIONS, type FormationId } from '../data/formations';
import { SPECIAL_BY_ID } from '../data/specials';
import { assignSlots } from '../simulation/engine';
import { addCoins, spend } from './economy';
import { clone } from './season';
import { autoLineup, isAvailable, staminaCost, treatCost } from './squad';
import { UNIT_BY_ID, giveUnit, marketOpen, putInLineup } from './transfers';
import type { SaveState } from './types';

export class GameError extends Error {}

const userClubOf = (s: SaveState) => s.clubs[s.userClub];

export function setFormation(prev: SaveState, f: FormationId): SaveState {
  const state = clone(prev);
  const club = userClubOf(state);
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const cur = club.lineup.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  club.formation = f;
  const slots = assignSlots(cur.map((p) => p.role), f);
  const lineup = new Array(FORMATIONS[f].length).fill('');
  cur.forEach((p, i) => { if (slots[i] >= 0) lineup[slots[i]] = p.id; });
  club.lineup = lineup;
  return state;
}

/** Ставить гравця у слот стартового складу; якщо він уже в складі — міняє місцями. */
export function setLineupSlot(prev: SaveState, slot: number, playerId: string): SaveState {
  const state = clone(prev);
  const club = userClubOf(state);
  const p = club.players.find((x) => x.id === playerId);
  if (!p) throw new GameError('Гравця не знайдено');
  if (!isAvailable(p)) throw new GameError('Гравець недоступний (травма або дискваліфікація)');
  if (slot < 0 || slot >= FORMATIONS[club.formation].length) throw new GameError('Невідома позиція');
  const other = club.lineup.indexOf(playerId);
  const cur = club.lineup[slot] ?? '';
  if (other >= 0) club.lineup[other] = cur;
  club.lineup[slot] = playerId;
  return state;
}

export function autoPickLineup(prev: SaveState): SaveState {
  const state = clone(prev);
  const club = userClubOf(state);
  club.lineup = autoLineup(club, true);
  return state;
}

export function treatPlayer(prev: SaveState, playerId: string): SaveState {
  const state = clone(prev);
  const p = userClubOf(state).players.find((x) => x.id === playerId);
  if (!p || p.injured <= 0) throw new GameError('Гравець не травмований');
  const cost = treatCost(p);
  if (!spend(state, cost, `Лікування: ${p.special ? SPECIAL_BY_ID[p.special].name : `Гравець №${p.num}`}`)) throw new GameError('Недостатньо медіакоїнів');
  p.injured = 0;
  return state;
}

export function restoreStamina(prev: SaveState, playerId: string | 'all'): SaveState {
  const state = clone(prev);
  const club = userClubOf(state);
  const list = playerId === 'all' ? club.players.filter((p) => p.stamina < 100) : club.players.filter((p) => p.id === playerId && p.stamina < 100);
  if (!list.length) throw new GameError('Усі гравці вже відпочили');
  const cost = list.reduce((a, p) => a + staminaCost(p), 0);
  if (!spend(state, cost, playerId === 'all' ? 'Відновлення витривалості команди' : 'Відновлення витривалості гравця')) throw new GameError('Недостатньо медіакоїнів');
  for (const p of list) p.stamina = 100;
  return state;
}

export function buyStar(prev: SaveState, starId: string): SaveState {
  const sp = SPECIAL_BY_ID[starId];
  if (!sp || sp.kind !== 'star' || !sp.price) throw new GameError('Невідомий гравець');
  if (!marketOpen(prev)) throw new GameError('Трансферний ринок закрито');
  if (prev.transfers.owners[starId]) throw new GameError('Цей футболіст уже має клуб');
  const state = clone(prev);
  if (!spend(state, sp.price, `Трансфер: ${sp.name}`)) throw new GameError('Недостатньо медіакоїнів');
  giveUnit(state, state.userClub, starId, 'star');
  return state;
}

/** Підтвердження картки мегатрансферу після матчу. */
export function claimCard(prev: SaveState, toLineup: boolean): SaveState {
  const post = prev.pending;
  if (!post || !post.card || post.cardClaimed) throw new GameError('Немає картки для отримання');
  const state = clone(prev);
  const card = state.pending!.card!;
  if (card.kind === 'unit') {
    giveUnit(state, state.userClub, card.unitId, 'mega');
    if (toLineup) putInLineup(userClubOf(state), UNIT_BY_ID[card.unitId].members);
  } else if (card.kind === 'jackpot') {
    addCoins(state, [{ season: state.season, round: post.round + 1, amount: card.amount, reason: 'Фінансовий джекпот ІМІ' }]);
    state.transfers.marketOpenUntil = state.round + B.economy.marketWindowRounds - 1;
    state.transfers.jackpotSeason = state.season;
    state.events.push({ season: state.season, round: post.round + 1, text: 'Фінансовий джекпот ІМІ: трансферний ринок відкрито' });
  } else {
    addCoins(state, [{ season: state.season, round: post.round + 1, amount: card.amount, reason: 'Спонсорський бонус' }]);
  }
  state.pending!.cardClaimed = true;
  return state;
}

export function ackPostMatch(prev: SaveState): SaveState {
  if (!prev.pending) return prev;
  if (prev.pending.card && !prev.pending.cardClaimed) throw new GameError('Спершу отримайте картку мегатрансферу');
  const state = clone(prev);
  state.pending = null;
  return state;
}
