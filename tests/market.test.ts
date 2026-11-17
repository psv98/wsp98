import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from '../src/data/balance';
import { CLUBS, CLUB_BY_ID } from '../src/data/clubs';
import { SPECIAL_BY_ID } from '../src/data/specials';
import { exportSave, importSave, migrate, validateSave } from '../src/storage/db';
import { devCost } from '../src/systems/development';
import { acceptCounter, closeOffseason, developPlayer, listForSale, marketList, openOffseason, placeBid, playerValue, respondOffer, startDeal } from '../src/systems/market';
import { ROUNDS, clone, newGame, nextSeason, playRoundAuto } from '../src/systems/season';
import { ackPostMatch, claimCard } from '../src/systems/actions';
import { playerQ } from '../src/systems/squad';
import { giveUnit, userCandidates } from '../src/systems/transfers';
import type { SaveState } from '../src/systems/types';

/** Стан після 34-го туру (результати — нічиї, щоб тест був швидким). */
function endOfSeason(club = 'texty', seed = 4): SaveState {
  const s = newGame(club, seed, 1000);
  s.round = ROUNDS;
  s.results = s.schedule.map((r, i) => r.map((f) => ({ round: i, home: f.home, away: f.away, score: [1, 1] as [number, number] })));
  s.history.push({ season: 1, champion: 'suspilne', table: [], userPos: 5, userPts: 34, topScorers: [], transfers: [], achievements: [], userResults: [], coinsEarned: 0 });
  for (const c of Object.values(s.clubs)) c.coins = 60000;
  s.coins = 200000;
  return s;
}
const specials = (s: SaveState) => { const out: string[] = []; for (const c of Object.values(s.clubs)) for (const p of c.players) if (p.special) out.push(p.special); return out; };
const noDupes = (s: SaveState) => { const l = specials(s); expect(new Set(l).size).toBe(l.length); for (const id of l) expect(s.clubs[s.transfers.owners[id]].players.some((p) => p.special === id)).toBe(true); };
const total = (s: SaveState) => s.coins + Object.values(s.clubs).filter((c) => c.id !== s.userClub).reduce((a, c) => a + c.coins, 0);

describe('перейменування клубів', () => {
  it('18 клубів, ID не змінилися, шість нових назв', () => {
    expect(CLUBS).toHaveLength(18);
    const want: Record<string, string> = { pravda: 'УП Альянс', texty: 'Тексти Фенікс', graty: 'Ґрати Бастіон', dzerkalo: 'Дзеркало Мадрид', rubryka: 'Рубрика Бліц', slovoidilo: 'СіД Атлетіко' };
    for (const [id, name] of Object.entries(want)) { expect(CLUB_BY_ID[id].name).toBe(name); expect(CLUB_BY_ID[id].logo).toBe(`assets/clubs/${id}.png`); }
    expect(CLUB_BY_ID.suspilne.name).toBe('Суспільне Юнайтед');
    expect(new Set(CLUBS.map((c) => c.abbr)).size).toBe(18);
    expect(CLUB_BY_ID.dzerkalo.abbr).toBe('ДЗМ');
  });

  it('старе збереження (v1) мігрує без втрат і повторна міграція нічого не змінює', () => {
    let s = newGame('rubryka', 9, 1000);
    for (let i = 0; i < 3; i++) { s = playRoundAuto(s); if (s.pending?.card) s = claimCard(s, true); s = ackPostMatch(s); }
    const v1 = clone(s) as SaveState & Record<string, unknown>;
    v1.version = 1;
    for (const c of Object.values(v1.clubs)) { delete (c as Partial<typeof c>).coins; delete (c as Partial<typeof c>).finance; }
    delete (v1 as Partial<SaveState>).offseason;
    v1.events.push({ season: 1, round: 3, text: 'Сенсація туру: Тексти Арсенал 2:1 Рубрика Боруссія' });
    const m = migrate(clone(v1));
    expect(validateSave(m)).toBeNull();
    expect(m.version).toBe(2);
    expect(m.round).toBe(3); expect(m.results).toEqual(s.results); expect(m.coins).toBe(s.coins); expect(m.userClub).toBe('rubryka');
    expect(m.transfers.owners).toEqual(s.transfers.owners);
    expect(m.events.at(-1)!.text).toBe('Сенсація туру: Тексти Фенікс 2:1 Рубрика Бліц');
    expect(Object.keys(m.clubs)).toHaveLength(18);
    expect(migrate(clone(m))).toEqual(m);
    // імпорт старого файлу
    const imported = importSave(JSON.stringify(v1));
    expect(imported.version).toBe(2); expect(Object.keys(imported.clubs)).toHaveLength(18);
    expect(importSave(exportSave(imported))).toEqual(imported);
  });
});

describe('економіка всіх клубів', () => {
  it('суперники мають різні бюджети й заробляють за матчі', () => {
    const s = newGame('lb', 3);
    expect(s.clubs.suspilne.coins).toBeGreaterThan(s.clubs.frontliner.coins);
    const before = Object.fromEntries(Object.values(s.clubs).map((c) => [c.id, c.coins]));
    const n = playRoundAuto(s);
    for (const c of Object.values(n.clubs)) if (c.id !== 'lb') { expect(c.coins).toBeGreaterThanOrEqual(before[c.id] - 20000); expect(c.finance.income).toBeGreaterThan(0); }
  });
});

describe('розвиток футболістів', () => {
  it('+2 за міжсезоння, 9 000 і 19 000 MC, ліміт 99', () => {
    let s = openOffseason(endOfSeason());
    giveUnit(s, 'texty', 'troian', 'mega');
    const p = s.clubs.texty.players.find((x) => x.special === 'troian')!;
    const q0 = playerQ(p, true);
    expect(devCost(p, true, s.season)).toBe(B.development.costs[0]);
    const c0 = s.coins;
    s = developPlayer(s, p.id, 'intercept').state;
    expect(s.coins).toBe(c0 - 9000);
    const p1 = s.clubs.texty.players.find((x) => x.special === 'troian')!;
    expect(playerQ(p1, true)).toBe(q0 + 1);
    expect(devCost(p1, true, s.season)).toBe(19000);
    const r = developPlayer(s, p.id, 'passing');
    expect(r.text).toContain('Валентина Троян підвищила рейтинг');
    s = r.state;
    expect(s.coins).toBe(c0 - 28000);
    expect(() => developPlayer(s, p.id, 'passing')).toThrow(/\+2/);
    expect(() => developPlayer(s, p.id, 'finish')).toThrow(); // напрям не для опорної півзахисниці
    // наступне міжсезоння — знову доступно
    const n = nextSeason(s);
    const p2 = n.clubs.texty.players.find((x) => x.special === 'troian')!;
    expect(playerQ(p2, true)).toBe(q0 + 2);
    // Оксана 99 — максимум
    const t = openOffseason(endOfSeason());
    giveUnit(t, 'texty', 'oksana', 'mega');
    const ok = t.clubs.texty.players.find((x) => x.special === 'oksana')!;
    expect(devCost(ok, true, t.season)).toBeNull();
  });
});

describe('трансферний ринок', () => {
  it('вартість залежить від рідкісності, розвитку й статистики', () => {
    const s = endOfSeason();
    giveUnit(s, 'nv', 'troian', 'mega'); giveUnit(s, 'nv', 'zakhar', 'mega'); giveUnit(s, 'babel', 'oksana', 'mega'); giveUnit(s, 'lb', 'hanna', 'mega');
    const v = (id: string) => playerValue(s, id);
    expect(v('troian')).toBeGreaterThanOrEqual(8000); expect(v('troian')).toBeLessThanOrEqual(18000);
    expect(v('zakhar')).toBeGreaterThanOrEqual(18000); expect(v('zakhar')).toBeLessThanOrEqual(35000);
    expect(v('hanna')).toBeGreaterThanOrEqual(50000); expect(v('hanna')).toBeLessThanOrEqual(90000);
    expect(v('oksana')).toBeGreaterThan(100000);
    const before = v('troian');
    const p = s.clubs.nv.players.find((x) => x.special === 'troian')!;
    p.dev = { gained: 6, season: 1, count: 0, focus: {}, log: [] }; p.s.goals = 12;
    expect(v('troian')).toBeGreaterThan(before * 1.4);
  });

  it('купівля окремого учасника комплекту; без дублікатів; гроші переходять атомарно', () => {
    let s = endOfSeason();
    giveUnit(s, 'rubryka', 'trio', 'mega');
    s = openOffseason(s);
    const sum0 = total(s);
    const { state, dealId } = startDeal(s, 'barkar');
    s = state;
    let d = s.offseason!.deals.find((x) => x.id === dealId)!;
    d.rivals = []; // без конкурентів
    s = placeBid(s, dealId, d.ask);
    d = s.offseason!.deals.find((x) => x.id === dealId)!;
    expect(d.status).toBe('won');
    expect(s.transfers.owners.barkar).toBe('texty');
    expect(s.transfers.owners.mashkova).toBe('rubryka');
    expect(total(s)).toBe(sum0); // гроші не зникають і не зʼявляються
    noDupes(s);
    // розкиданий комплект більше не випадає як мегатрансфер
    expect(userCandidates(s).map((c) => c.unit.id)).not.toContain('trio');
  });

  it('клуб не продає за будь-яку суму: відмова або зустрічна ціна', () => {
    let s = endOfSeason();
    giveUnit(s, 'rubryka', 'zakhar', 'mega');
    s = openOffseason(s);
    const r = startDeal(s, 'zakhar'); s = r.state;
    s.offseason!.deals[0].rivals = [];
    const ask = s.offseason!.deals[0].ask;
    s = placeBid(s, r.dealId, Math.round(ask * 0.5));
    expect(s.offseason!.deals[0].status).toBe('open');
    expect(s.transfers.owners.zakhar).toBe('rubryka');
    s = placeBid(s, r.dealId, Math.round(ask * 0.9));
    expect(s.offseason!.deals[0].status).toBe('countered');
    s = acceptCounter(s, r.dealId);
    expect(s.offseason!.deals[0].status).toBe('won');
    expect(s.transfers.owners.zakhar).toBe('texty');
  });

  it('аукціон: конкурент перебиває, максимум три раунди, переможець отримує гравця', () => {
    let s = endOfSeason();
    giveUnit(s, 'rubryka', 'zakhar', 'mega');
    s = openOffseason(s);
    const r = startDeal(s, 'zakhar'); s = r.state;
    const d0 = s.offseason!.deals[0];
    d0.rivals = [{ club: 'babel', bid: 38000, max: 45000 }, { club: 'espreso', bid: 40000, max: 41000 }];
    d0.ask = 30000;
    s = placeBid(s, r.dealId, 35000);
    expect(s.offseason!.deals[0].status).toBe('outbid');
    expect(s.offseason!.deals[0].message).toContain('Інший клуб запропонував вищу суму за Захара Давиденка');
    s = placeBid(s, r.dealId, 42000);
    s = placeBid(s, r.dealId, 43000);
    const d = s.offseason!.deals[0];
    expect(['won', 'lost']).toContain(d.status);
    expect(d.round).toBeLessThanOrEqual(B.market.maxRounds);
    expect(s.transfers.owners.zakhar).toBe(d.winner);
    noDupes(s);
  });

  it('продаж гравця користувача — лише після підтвердження', () => {
    let s = endOfSeason();
    giveUnit(s, 'texty', 'zemliana', 'mega');
    s = openOffseason(s);
    if (!s.offseason!.incoming.length) s = listForSale(s, 'zemliana');
    const of = s.offseason!.incoming[0];
    expect(s.transfers.owners.zemliana).toBe('texty'); // без рішення нічого не продається
    const rej = respondOffer(s, of.id, 'reject');
    expect(rej.transfers.owners.zemliana).toBe('texty');
    const coins = s.coins;
    const acc = respondOffer(s, of.id, 'accept');
    expect(acc.transfers.owners.zemliana).toBe(of.buyer);
    expect(acc.coins).toBe(coins + of.amount);
    noDupes(acc);
    // зустрічна сума понад межу покупця → остаточна пропозиція
    const cnt = respondOffer(s, of.id, 'counter', of.max + 100000);
    expect(cnt.offseason!.incoming[0].status).toBe('countered');
    expect(cnt.transfers.owners.zemliana).toBe('texty');
  });

  it('не можна купити дорожче за баланс; вільних ІМІ немає на ринку', () => {
    let s = endOfSeason(); s.coins = 5000;
    giveUnit(s, 'nv', 'zakhar', 'mega');
    s = openOffseason(s);
    expect(marketList(s).some((x) => x.sp.id === 'diachuk')).toBe(false); // ще не має клубу
    expect(marketList(s).some((x) => x.sp.id === 'messi')).toBe(true);
    const r = startDeal(s, 'zakhar');
    expect(() => placeBid(r.state, r.dealId, 9000)).toThrow(/Недостатньо/);
    expect(() => startDeal(s, 'diachuk')).toThrow();
  });

  it('завершення міжсезоння: угоди суперників без дублікатів, бюджети не відʼємні, історія зберігається', () => {
    let s = endOfSeason();
    for (const [c, u] of [['nv', 'zakhar'], ['babel', 'dudka'], ['lb', 'trio'], ['graty', 'messi']] as const) giveUnit(s, c, u, 'mega');
    s = openOffseason(s);
    const t = clone(s);
    closeOffseason(t);
    noDupes(t);
    for (const c of Object.values(t.clubs)) expect(c.coins).toBeGreaterThanOrEqual(0);
    const n = nextSeason(s);
    expect(n.offseason).toBeNull();
    expect(n.history[0].offseason).toBeDefined();
    expect(n.season).toBe(2); expect(n.round).toBe(0);
    noDupes(n);
    expect(validateSave(n)).toBeNull();
  });

  it('міжсезоння переживає перезавантаження (експорт/імпорт)', () => {
    let s = endOfSeason();
    giveUnit(s, 'nv', 'zakhar', 'mega');
    s = openOffseason(s);
    s = startDeal(s, 'zakhar').state;
    const back = importSave(exportSave(s));
    expect(back.offseason?.deals).toHaveLength(1);
    expect(back.offseason?.incoming).toEqual(s.offseason?.incoming);
  });

  void SPECIAL_BY_ID;
});
