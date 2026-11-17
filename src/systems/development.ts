// Розвиток футболістів між сезонами: до +2 загального рейтингу за міжсезоння, з вибором спеціалізації.
import { BALANCE as B } from '../data/balance';
import type { Role } from '../data/formations';
import { MSG, person } from '../data/i18n';
import type { BoostKey } from '../simulation/types';
import { spend } from './economy';
import { baseQ, playerQ } from './squad';
import type { PlayerState, SaveState } from './types';

const D = B.development;

export interface DevOption { id: string; label: string; hint: string; boost: BoostKey[] }
export type RoleGroup = 'attack' | 'mid' | 'def' | 'gk';

export const roleGroup = (r: Role): RoleGroup => (r === 'GK' ? 'gk' : r === 'CB' || r === 'FB' ? 'def' : r === 'ST' || r === 'W' ? 'attack' : 'mid');
export const GROUP_LABEL: Record<RoleGroup, string> = { attack: 'Нападник / вінгер', mid: 'Півзахисник', def: 'Захисник', gk: 'Воротар' };

/** Напрями розвитку залежать від ролі: «неактуальні» характеристики підвищити не можна. */
export const DEV_OPTIONS: Record<RoleGroup, DevOption[]> = {
  attack: [
    { id: 'finish', label: 'Завершення атак', hint: 'Точніші й сильніші удари по воротах', boost: ['shoot'] },
    { id: 'dribble', label: 'Дриблінг', hint: 'Частіше обігрує захисників', boost: ['dribble'] },
    { id: 'speed', label: 'Швидкість', hint: 'Швидше рухається полем', boost: ['speed'] },
    { id: 'header', label: 'Удари головою', hint: 'Сильніший у верхових дуелях', boost: ['header'] },
  ],
  mid: [
    { id: 'passing', label: 'Точність передач', hint: 'Менше неточних передач', boost: ['pass'] },
    { id: 'control', label: 'Контроль мʼяча', hint: 'Утримує мʼяч під тиском', boost: ['dribble'] },
    { id: 'intercept', label: 'Перехоплення', hint: 'Частіше перериває передачі суперника', boost: ['intercept', 'tackle'] },
    { id: 'create', label: 'Створення моментів', hint: 'Гостріші передачі та удари з-за штрафного', boost: ['pass', 'shoot'] },
  ],
  def: [
    { id: 'tackle', label: 'Відбір мʼяча', hint: 'Успішніші підкати й відбори', boost: ['tackle'] },
    { id: 'position', label: 'Позиційна гра', hint: 'Встигає закрити зону та перехопити передачу', boost: ['intercept', 'speed'] },
    { id: 'block', label: 'Блокування ударів', hint: 'Частіше блокує удари', boost: ['block'] },
    { id: 'power', label: 'Силова боротьба', hint: 'Виграє дуелі на землі й у повітрі', boost: ['header', 'tackle'] },
  ],
  gk: [
    { id: 'reflex', label: 'Реакція', hint: 'Більше сейвів після ударів зблизька', boost: ['gk'] },
    { id: 'gkpos', label: 'Позиційна гра', hint: 'Правильно вибирає позицію у воротах', boost: ['gk'] },
    { id: 'claim', label: 'Гра на виходах', hint: 'Забирає навіси у штрафному', boost: ['header', 'gk'] },
    { id: 'parry', label: 'Відбиття ударів', hint: 'Надійніше відбиває сильні удари', boost: ['gk'] },
  ],
};

/** Скільки пунктів уже куплено гравцеві в поточному міжсезонні. */
export const devUsed = (p: PlayerState, season: number) => (p.dev && p.dev.season === season ? p.dev.count : 0);

/** Ціна наступного пункту: 9 000 → 19 000 MC, дорожче для високого рейтингу. */
export function devCost(p: PlayerState, isUser: boolean, season: number): number | null {
  const used = devUsed(p, season);
  if (used >= D.perSeason) return null;
  const q = playerQ(p, isUser);
  if (q >= D.cap) return null;
  const step = D.costs[Math.min(used, D.costs.length - 1)];
  return Math.round((step * (1 + Math.max(0, q - 85) * D.costRatingStep)) / 100) * 100;
}

export class DevError extends Error {}

/** Покращення гравця (мутує стан; викликати на клоні). Повертає текст повідомлення. */
export function applyDevelopment(state: SaveState, clubId: string, playerId: string, optionId: string): { from: number; to: number; text: string; cost: number } {
  const isUser = clubId === state.userClub;
  const p = state.clubs[clubId]?.players.find((x) => x.id === playerId);
  if (!p) throw new DevError('Гравця не знайдено');
  const opt = DEV_OPTIONS[roleGroup(p.role)].find((o) => o.id === optionId);
  if (!opt) throw new DevError('Цей напрям не підходить для позиції гравця');
  const cost = devCost(p, isUser, state.season);
  if (cost == null) throw new DevError(playerQ(p, isUser) >= D.cap ? 'Досягнуто максимального рейтингу 99' : 'Ліміт розвитку на це міжсезоння вичерпано (+2)');
  if (isUser) { if (!spend(state, cost, `Розвиток: ${optionId}`)) throw new DevError('Недостатньо медіакоїнів'); }
  else { const c = state.clubs[clubId]; if (c.coins < cost) throw new DevError('Недостатньо медіакоїнів'); c.coins -= cost; c.finance.spend += cost; }
  const from = playerQ(p, isUser);
  const dev = p.dev ?? { gained: 0, season: state.season, count: 0, focus: {}, log: [] };
  if (dev.season !== state.season) { dev.season = state.season; dev.count = 0; }
  dev.count++;
  dev.gained++;
  for (const k of opt.boost) dev.focus[k] = (dev.focus[k] ?? 0) + D.focusBonus / opt.boost.length;
  const to = Math.min(D.cap, baseQ(p, isUser) + dev.gained);
  dev.log.push({ season: state.season, from, to, focus: opt.label });
  p.dev = dev;
  const name = p.special ? undefined : `Гравець №${p.num}`;
  return { from, to, cost, text: MSG.ratingUp(person(name ?? '', p.special), from, to) };
}
