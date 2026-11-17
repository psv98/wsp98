// Міжсезонний трансферний ринок: оцінка гравців, переговори, аукціони, пропозиції від клубів, угоди між суперниками.
// Усі дії — чисті функції: приймають стан і повертають новий. Кожен трансфер атомарний: або змінюється все, або нічого.
import { BALANCE as B } from '../data/balance';
import { CLUB_BY_ID } from '../data/clubs';
import { MSG, person } from '../data/i18n';
import { SPECIAL_BY_ID, SPECIALS } from '../data/specials';
import { hashSeed, makeRng, weightedPick, type Rng } from '../simulation/rng';
import { DEV_OPTIONS, applyDevelopment, devCost, roleGroup } from './development';
import { clubCoins, spend } from './economy';
import { clubStrength, playerQ } from './squad';
import { findSpecial, moveSpecial } from './transfers';
import type { Deal, IncomingOffer, OffseasonState, SaveState } from './types';

const M = B.market;
const clone = <T,>(x: T): T => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const r500 = (v: number) => Math.max(500, Math.round(v / 500) * 500);
export const fmtMC = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} MC`;
const clubName = (id: string) => CLUB_BY_ID[id]?.name ?? id;

export class MarketError extends Error {}

export const isOffseason = (s: SaveState) => s.round >= 34 && !s.pending;
const rngFor = (s: SaveState, ...k: (string | number)[]): Rng => {
  const off = s.offseason;
  if (off) off.nonce++;
  return makeRng(hashSeed(s.seed, 'market', s.season, off?.nonce ?? 0, ...k));
};

// ---------- оцінка ----------
/** Поточний рейтинг персонажа у «нейтральному» вимірі (без бонусу клубу користувача) — для порівняння вартості. */
export function marketRating(s: SaveState, specialId: string): number {
  const sp = SPECIAL_BY_ID[specialId];
  const f = findSpecial(s, specialId);
  return Math.min(99, sp.opp.q + (f?.player.dev?.gained ?? 0));
}

/**
 * Ринкова вартість: базова ціна рідкісності (або зірки) × прогрес розвитку × статистика сезону × попит.
 * Вартість не фіксована кольором картки: рідкісна гравчиня, що виросла з 79 до 85 і забиває, коштуватиме значно дорожче.
 */
export function playerValue(s: SaveState, specialId: string): number {
  const sp = SPECIAL_BY_ID[specialId];
  const base = sp.kind === 'star' ? (sp.price ?? 10000) * M.starValueMul : M.rarityValue[sp.rarity];
  const f = findSpecial(s, specialId);
  const gained = f?.player.dev?.gained ?? 0;
  const st = f?.player.s;
  const stat = st ? Math.min(M.statCap, st.goals * M.perGoal + st.assists * M.perAssist + st.motm * M.perMotm) : 0;
  const demand = 1 + 0.04 * Object.values(s.clubs).filter((c) => c.id !== f?.clubId && c.id !== s.userClub && c.coins > base).length / 17;
  return r500(base * (1 + M.ratingStep * gained) * (1 + stat) * demand);
}

/** Мінімальна ціна, за яку клуб готовий продати: залежить від ролі гравця в команді та фінансів клубу. */
function sellerAsk(s: SaveState, specialId: string, rng: Rng): number {
  const v = playerValue(s, specialId);
  const f = findSpecial(s, specialId);
  if (!f) return v;
  const club = s.clubs[f.clubId];
  const key = club.lineup.includes(f.player.id) ? M.importanceMul : 1;
  const needy = club.coins < 8000 ? 0.92 : club.coins > 60000 ? 1.08 : 1;
  const unique = specialId === 'oksana' ? 1.25 : 1;
  const [lo, hi] = M.sellerAskSpread;
  return r500(v * (lo + rng() * (hi - lo)) * key * needy * unique);
}

// ---------- міжсезоння ----------
export function openOffseason(prev: SaveState): SaveState {
  if (!isOffseason(prev)) throw new MarketError('Міжсезоння відкривається після 34-го туру');
  if (prev.offseason && prev.offseason.season === prev.season) return prev;
  const s = clone(prev);
  s.offseason = {
    season: s.season, startCoins: s.coins, deals: [], incoming: [], news: [], bought: [], sold: [], ratingChanges: [],
    devSpent: 0, transferSpent: 0, transferIncome: 0, nonce: 0,
  };
  generateIncoming(s, userSpecials(s), rngFor(s, 'open'));
  return s;
}

const off = (s: SaveState): OffseasonState => {
  if (!s.offseason || !isOffseason(s)) throw new MarketError('Трансферне вікно зараз закрите');
  return s.offseason;
};

export const userSpecials = (s: SaveState) => SPECIALS.filter((sp) => s.transfers.owners[sp.id] === s.userClub).map((sp) => sp.id);

/** Гравці, яких можна купити: зірки (вільні або в інших клубах) та персонажі ІМІ, що грають за суперників. */
export function marketList(s: SaveState) {
  return SPECIALS.filter((sp) => {
    const o = s.transfers.owners[sp.id];
    if (o === s.userClub) return false;
    return sp.kind === 'star' || !!o; // вільні персонажі ІМІ доступні лише як мегатрансфер
  }).map((sp) => ({ sp, owner: s.transfers.owners[sp.id] ?? null, value: playerValue(s, sp.id), rating: marketRating(s, sp.id) }));
}

// ---------- атомарний трансфер ----------
function executeTransfer(s: SaveState, specialId: string, buyer: string, price: number) {
  const o = s.offseason!;
  const seller = s.transfers.owners[specialId] ?? null;
  if (seller === buyer) throw new MarketError('Гравець уже в цьому клубі');
  if (buyer === s.userClub) { if (!spend(s, price, `Трансфер: ${SPECIAL_BY_ID[specialId].name}`)) throw new MarketError('Недостатньо медіакоїнів'); }
  else { if (s.clubs[buyer].coins < price) throw new MarketError('У покупця недостатньо медіакоїнів'); clubCoins(s, buyer, -price, `Трансфер: ${SPECIAL_BY_ID[specialId].name}`); }
  if (seller) clubCoins(s, seller, price, `Продаж: ${SPECIAL_BY_ID[specialId].name}`);
  moveSpecial(s, specialId, buyer);
  s.transfers.log.push({ season: s.season, round: 34, club: buyer, unitId: specialId, from: seller ?? undefined, kind: 'market', price });
  const p = person(SPECIAL_BY_ID[specialId].name, specialId);
  o.news.push(`${MSG.movedTo(p, clubName(buyer))} за ${fmtMC(price)}${seller ? ` (з «${clubName(seller)}»)` : ''}`);
  if (buyer === s.userClub) { o.bought.push(specialId); o.transferSpent += price; }
  if (seller === s.userClub) { o.sold.push(specialId); o.transferIncome += price; }
  // пропозиції щодо цього гравця більше не актуальні
  for (const d of o.deals) if (d.specialId === specialId && !['won', 'lost', 'rejected', 'withdrawn'].includes(d.status) ) { d.status = buyer === s.userClub ? 'won' : 'lost'; }
  for (const inc of o.incoming) if (inc.specialId === specialId && inc.status === 'pending') { inc.status = 'declined'; inc.message = 'Гравець уже змінив клуб'; }
}

// ---------- купівля користувачем: переговори й аукціон ----------
export function startDeal(prev: SaveState, specialId: string): { state: SaveState; dealId: string } {
  const s = clone(prev);
  const o = off(s);
  const sp = SPECIAL_BY_ID[specialId];
  if (!sp) throw new MarketError('Невідомий гравець');
  const owner = s.transfers.owners[specialId] ?? null;
  if (owner === s.userClub) throw new MarketError('Цей гравець уже у вашому клубі');
  if (!owner && sp.kind !== 'star') throw new MarketError('Цей персонаж ще не має клубу — його можна отримати лише як мегатрансфер');
  const existing = o.deals.find((d) => d.specialId === specialId && ['open', 'countered', 'outbid'].includes(d.status));
  if (existing) return { state: prev, dealId: existing.id };
  const rng = rngFor(s, 'deal', specialId);
  const value = playerValue(s, specialId);
  const ask = owner ? sellerAsk(s, specialId, rng) : value;
  const rivals: Deal['rivals'] = [];
  const pool = Object.values(s.clubs).filter((c) => c.id !== s.userClub && c.id !== owner && c.coins >= value * 0.75);
  for (const c of pool.sort(() => rng() - 0.5)) {
    if (rivals.length >= M.maxRivals) break;
    if (rng() > M.rivalChance / (1 + rivals.length * 0.6)) continue;
    const max = r500(Math.min(c.coins * 0.85, value * (1 + rng() * 0.4)));
    rivals.push({ club: c.id, max, bid: r500(Math.min(max, value * (0.85 + rng() * 0.2))) });
  }
  const id = `d${s.season}-${o.nonce}-${specialId}`;
  o.deals.push({ id, specialId, seller: owner, value, ask, round: 1, userBid: 0, rivals, status: 'open', message: rivals.length ? `Інтерес до гравця виявили ще ${rivals.length} ${rivals.length === 1 ? 'клуб' : 'клуби'}` : 'Зробіть першу пропозицію' });
  return { state: s, dealId: id };
}

const bestRival = (d: Deal) => d.rivals.reduce<{ club: string; bid: number } | null>((b, r) => (!b || r.bid > b.bid ? r : b), null);

export function placeBid(prev: SaveState, dealId: string, amount: number): SaveState {
  const s = clone(prev);
  const o = off(s);
  const d = o.deals.find((x) => x.id === dealId);
  if (!d || !['open', 'countered', 'outbid'].includes(d.status)) throw new MarketError('Ці переговори вже завершено');
  amount = Math.round(amount);
  if (!Number.isFinite(amount) || amount < 1000) throw new MarketError('Мінімальна пропозиція — 1 000 MC');
  if (amount > s.coins) throw new MarketError('Недостатньо медіакоїнів для такої пропозиції');
  if (amount <= d.userBid && d.status === 'outbid') throw new MarketError('Нова пропозиція має бути вищою за попередню');
  const rng = rngFor(s, 'bid', dealId, amount);
  const sp = SPECIAL_BY_ID[d.specialId];
  const p = person(sp.name, sp.id);
  const seller = d.seller ? clubName(d.seller) : 'Агент гравця';
  d.userBid = amount;
  // суперники реагують на пропозицію
  if (d.round > 1 || d.status === 'outbid') for (const r of d.rivals) {
    if (r.bid < amount && r.max > r.bid) r.bid = r500(Math.min(r.max, amount * (1.02 + rng() * 0.06)));
  }
  // хтось із суперників міг вибути через нестачу коштів
  d.rivals = d.rivals.filter((r) => s.clubs[r.club].coins >= r.bid);
  const top = bestRival(d);
  const last = d.round >= M.maxRounds;
  if (top && top.bid > amount) {
    d.status = 'outbid';
    d.message = MSG.outbid(p);
    if (last) finishWithRival(s, d, top, p);
    else d.round++;
    return s;
  }
  if (amount >= d.ask) {
    // власник може віддати перевагу іншій пропозиції, якщо вона майже така сама
    if (top && top.bid >= d.ask && top.bid >= amount * (1 - M.ownerPreference) && d.seller && rng() < 0.3) {
      finishWithRival(s, d, top, p, `«${seller}» віддав перевагу пропозиції «${clubName(top.club)}»`);
      return s;
    }
    executeTransfer(s, d.specialId, s.userClub, amount);
    d.status = 'won'; d.winner = s.userClub; d.price = amount;
    d.message = MSG.joinedClub(p);
    return s;
  }
  if (amount >= d.ask * M.counterFrom && !last) {
    d.status = 'countered'; d.counter = r500(d.ask); d.round++;
    d.message = `«${seller}» не погоджується, але готовий продати за ${fmtMC(d.counter)}`;
    return s;
  }
  if (last) {
    if (top && top.bid >= d.ask) finishWithRival(s, d, top, p);
    else { d.status = 'rejected'; d.message = MSG.refused(seller, p); }
    return s;
  }
  d.status = 'open'; d.round++;
  d.message = `«${seller}» відхилив пропозицію: сума занадто мала`;
  return s;
}

function finishWithRival(s: SaveState, d: Deal, top: { club: string; bid: number }, p: ReturnType<typeof person>, msg?: string) {
  if (top.bid >= d.ask && s.clubs[top.club].coins >= top.bid) {
    executeTransfer(s, d.specialId, top.club, top.bid);
    d.status = 'lost'; d.winner = top.club; d.price = top.bid;
    d.message = msg ?? `${MSG.movedTo(p, clubName(top.club))} за ${fmtMC(top.bid)}`;
  } else {
    d.status = 'rejected'; d.message = MSG.refused(d.seller ? clubName(d.seller) : 'Агент гравця', p);
  }
}

export function acceptCounter(prev: SaveState, dealId: string): SaveState {
  const d = prev.offseason?.deals.find((x) => x.id === dealId);
  if (!d || d.status !== 'countered' || !d.counter) throw new MarketError('Зустрічної пропозиції немає');
  return placeBid(prev, dealId, d.counter);
}

export function withdrawDeal(prev: SaveState, dealId: string): SaveState {
  const s = clone(prev);
  const d = off(s).deals.find((x) => x.id === dealId);
  if (!d || !['open', 'countered', 'outbid'].includes(d.status)) return prev;
  d.status = 'withdrawn'; d.message = 'Ви вийшли з переговорів';
  return s;
}

// ---------- пропозиції від інших клубів ----------
function generateIncoming(s: SaveState, ids: string[], rng: Rng, max: number = M.incomingOffers[1]) {
  const o = s.offseason!;
  const lo = Math.min(max, M.incomingOffers[0] as number);
  const want = Math.min(ids.length, lo + Math.floor(rng() * (max - lo + 1)));
  const pool = ids.slice().sort(() => rng() - 0.5);
  let made = 0;
  for (const id of pool) {
    if (made >= want) break;
    if (o.incoming.some((x) => x.specialId === id && x.status === 'pending')) continue;
    const value = playerValue(s, id);
    const buyers = Object.values(s.clubs).filter((c) => c.id !== s.userClub && c.coins >= value * 0.9);
    const buyer = weightedPick(rng, buyers, (c) => c.coins);
    if (!buyer) continue;
    const amount = r500(Math.min(buyer.coins * 0.8, value * (0.9 + rng() * 0.3)));
    const mx = r500(Math.min(buyer.coins * 0.92, amount * (1.05 + rng() * 0.25)));
    o.incoming.push({ id: `o${s.season}-${o.nonce}-${id}`, specialId: id, buyer: buyer.id, amount, max: Math.max(amount, mx), status: 'pending' });
    made++;
  }
  return made;
}

/** Виставити гравця на продаж — клуби-суперники надсилають пропозиції. */
export function listForSale(prev: SaveState, specialId: string): SaveState {
  const s = clone(prev);
  off(s);
  if (s.transfers.owners[specialId] !== s.userClub) throw new MarketError('Гравець не належить вашому клубу');
  const made = generateIncoming(s, [specialId], rngFor(s, 'list', specialId), 1);
  if (!made) throw new MarketError('Зараз жоден клуб не готовий заплатити за цього гравця');
  return s;
}

export function respondOffer(prev: SaveState, offerId: string, action: 'accept' | 'reject' | 'counter', amount?: number): SaveState {
  const s = clone(prev);
  const o = off(s);
  const of = o.incoming.find((x) => x.id === offerId);
  if (!of || !['pending', 'countered'].includes(of.status)) throw new MarketError('Пропозиція вже неактуальна');
  if (s.transfers.owners[of.specialId] !== s.userClub) throw new MarketError('Гравець уже не у вашому клубі');
  const p = person(SPECIAL_BY_ID[of.specialId].name, of.specialId);
  const buyerName = clubName(of.buyer);
  if (action === 'reject') { of.status = 'rejected'; of.message = MSG.stayed(p); return s; }
  if (action === 'accept') {
    const price = of.status === 'countered' && of.countered ? of.countered : of.amount;
    executeTransfer(s, of.specialId, of.buyer, price);
    of.status = 'accepted'; of.message = `${MSG.movedTo(p, buyerName)} за ${fmtMC(price)}`;
    return s;
  }
  const ask = Math.round(amount ?? 0);
  if (!Number.isFinite(ask) || ask < of.amount) throw new MarketError('Зустрічна сума має бути не меншою за пропозицію клубу');
  if (ask <= of.max && s.clubs[of.buyer].coins >= ask) {
    executeTransfer(s, of.specialId, of.buyer, ask);
    of.status = 'accepted'; of.message = `«${buyerName}» погодився! ${MSG.movedTo(p, buyerName)} за ${fmtMC(ask)}`;
    return s;
  }
  if (of.status === 'countered') { of.status = 'declined'; of.message = `«${buyerName}» відмовився від подальших переговорів. ${MSG.stayed(p)}`; return s; }
  of.status = 'countered'; of.countered = of.max;
  of.message = `«${buyerName}» не готовий платити ${fmtMC(ask)}. Остаточна пропозиція — ${fmtMC(of.max)}`;
  return s;
}

// ---------- розвиток у міжсезоння ----------
export function developPlayer(prev: SaveState, playerId: string, optionId: string): { state: SaveState; text: string } {
  const s = clone(prev);
  const o = off(s);
  const coins = s.coins;
  const r = applyDevelopment(s, s.userClub, playerId, optionId);
  o.devSpent += coins - s.coins;
  const p = s.clubs[s.userClub].players.find((x) => x.id === playerId)!;
  const name = p.special ? SPECIAL_BY_ID[p.special].name : `Гравець №${p.num}`;
  const ex = o.ratingChanges.find((x) => x.id === playerId);
  if (ex) ex.to = r.to; else o.ratingChanges.push({ id: playerId, name, from: r.from, to: r.to });
  return { state: s, text: r.text };
}

// ---------- завершення міжсезоння: угоди та розвиток суперників ----------
export function closeOffseason(s: SaveState) {
  const o = s.offseason;
  if (!o) return;
  const rng = makeRng(hashSeed(s.seed, 'close', s.season));
  // відкриті переговори та пропозиції закриваються
  for (const d of o.deals) if (['open', 'countered', 'outbid'].includes(d.status)) { d.status = 'withdrawn'; d.message = 'Трансферне вікно закрито'; }
  for (const i of o.incoming) if (['pending', 'countered'].includes(i.status)) { i.status = 'rejected'; i.message = 'Трансферне вікно закрито'; }
  // угоди між клубами-суперниками
  for (let k = 0; k < M.aiDealsPerOffseason; k++) {
    const buyers = Object.values(s.clubs).filter((c) => c.id !== s.userClub && c.coins > 15000);
    const buyer = weightedPick(rng, buyers, (c) => c.coins);
    if (!buyer) break;
    const targets = SPECIALS.filter((sp) => {
      const ow = s.transfers.owners[sp.id];
      return ow !== s.userClub && ow !== buyer.id && (sp.kind === 'star' || !!ow) && sp.id !== 'oksana';
    }).map((sp) => ({ sp, price: s.transfers.owners[sp.id] ? sellerAsk(s, sp.id, rng) : playerValue(s, sp.id) })).filter((t) => t.price <= buyer.coins * 0.6);
    const t = weightedPick(rng, targets, (x) => x.price);
    if (!t || rng() < 0.35) continue;
    executeTransfer(s, t.sp.id, buyer.id, t.price);
  }
  // суперники розвивають своїх найкращих гравців
  for (const club of Object.values(s.clubs)) {
    if (club.id === s.userClub) continue;
    let budget = club.coins * B.economy.aiDevBudgetShare;
    const cands = club.players.filter((p) => p.special).sort((a, b) => playerQ(b, false) - playerQ(a, false));
    for (const p of cands) {
      for (let n = 0; n < 2; n++) {
        const cost = devCost(p, false, s.season);
        if (cost == null || cost > budget) break;
        const opts = DEV_OPTIONS[roleGroup(p.role)];
        applyDevelopment(s, club.id, p.id, opts[Math.floor(rng() * opts.length)].id);
        budget -= cost;
      }
    }
  }
}

/** Підсумок перед стартом нового сезону. */
export function offseasonSummary(s: SaveState) {
  const o = s.offseason;
  return {
    bought: o?.bought ?? [], sold: o?.sold ?? [], ratingChanges: o?.ratingChanges ?? [],
    spent: (o?.devSpent ?? 0) + (o?.transferSpent ?? 0), income: o?.transferIncome ?? 0,
    budget: s.coins, strength: Math.round(clubStrength(s, s.userClub) * 10) / 10,
  };
}
