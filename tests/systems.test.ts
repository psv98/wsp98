import { describe, expect, it } from 'vitest';
import { BALANCE as B } from '../src/data/balance';
import { CLUBS } from '../src/data/clubs';
import { IMI_SPECIALS, TRANSFER_UNITS } from '../src/data/specials';
import { makeRng } from '../src/simulation/rng';
import { restoreCost } from '../src/simulation/fatigue';
import { GameError, ackPostMatch, buyStar, claimCard, restoreStamina, setFormation, setLineupSlot, treatPlayer } from '../src/systems/actions';
import { addCoins, matchRewards, spend } from '../src/systems/economy';
import { ROUNDS, applyRound, clone, newGame, nextSeason, playRoundAuto } from '../src/systems/season';
import { validateSchedule } from '../src/systems/schedule';
import { ALL_CLUB_IDS, buildTeamSetup, resolveLineup } from '../src/systems/squad';
import { computeTable } from '../src/systems/table';
import { aiTransfers, giveUnit, rollCard, userCandidates } from '../src/systems/transfers';
import type { SaveState, UserMatchRecord } from '../src/systems/types';

const fresh = (club = 'texty', seed = 123) => newGame(club, seed, 1000);

describe('нова гра', () => {
  it('18 клубів по 24 гравці, 11 у стартовому складі', () => {
    const s = fresh();
    expect(Object.keys(s.clubs)).toHaveLength(18);
    for (const c of Object.values(s.clubs)) {
      expect(c.players).toHaveLength(24);
      expect(c.lineup.filter(Boolean)).toHaveLength(11);
      expect(new Set(c.lineup).size).toBe(11);
      expect(c.players.filter((p) => p.role === 'GK').length).toBe(3);
    }
    expect(validateSchedule(s.schedule, ALL_CLUB_IDS)).toEqual([]);
    expect(s.coins).toBe(B.economy.startCoins);
  });
  it('команда для матчу: 11 стартових + 13 запасних', () => {
    const s = fresh();
    const t = buildTeamSetup(s, 'texty', true);
    expect(t.starters).toHaveLength(11); expect(t.bench).toHaveLength(13); expect(t.isUser).toBe(true);
    expect(t.starters[0].role).toBe('GK');
  });
  it('травмовані й дискваліфіковані не потрапляють у склад', () => {
    const s = fresh();
    const c = s.clubs.texty;
    const a = c.players.find((p) => p.id === c.lineup[3])!; a.injured = 2;
    const b = c.players.find((p) => p.id === c.lineup[9])!; b.suspended = 1;
    const l = resolveLineup(c, true);
    expect(l).not.toContain(a.id); expect(l).not.toContain(b.id);
    expect(l.filter(Boolean)).toHaveLength(11);
    const t = buildTeamSetup(s, 'texty', true);
    expect([...t.starters, ...t.bench].some((p) => p.pid === a.id || p.pid === b.id)).toBe(false);
  });
});

describe('економіка', () => {
  const rec = (score: [number, number], goals: UserMatchRecord['goals'] = []): UserMatchRecord => ({ round: 0, home: 'texty', away: 'nv', score, goals, stats: [] as never, motm: null, abilities: {}, injuries: [], cards: [], subs: [] });
  it('нарахування за перемогу, нічию, поразку, голи', () => {
    const s = fresh();
    const sum = (r: ReturnType<typeof matchRewards>) => r.reduce((a, e) => a + e.amount, 0);
    const E = B.economy;
    expect(sum(matchRewards(s, rec([2, 1]), 0, false))).toBe(E.win + 2 * E.perGoal);
    expect(sum(matchRewards(s, rec([0, 0]), 0, false))).toBe(E.draw + E.cleanSheet);
    expect(sum(matchRewards(s, rec([0, 2]), 0, false))).toBe(E.loss);
    expect(sum(matchRewards(s, rec([1, 0]), -6, false))).toBe(E.win + E.perGoal + E.cleanSheet + E.upsetWin);
    expect(sum(matchRewards(s, rec([4, 0]), 0, false))).toBe(E.win + 4 * E.perGoal + E.cleanSheet + E.bigWin);
  });
  it('не можна витратити більше, ніж є', () => {
    const s = fresh();
    expect(spend(s, s.coins + 1, 'x')).toBe(false);
    expect(s.coins).toBe(B.economy.startCoins);
    expect(spend(s, 500, 'x')).toBe(true);
    expect(s.coins).toBe(B.economy.startCoins - 500);
    expect(s.coinLog.at(-1)).toMatchObject({ amount: -500 });
    expect(spend(s, -5, 'x')).toBe(false);
    expect(spend(s, NaN, 'x')).toBe(false);
  });
  it('лікування та відновлення реально змінюють стан і коштують медіакоїнів', () => {
    let s = fresh();
    const p = s.clubs.texty.players[5];
    p.injured = 2; p.stamina = 40;
    s.coins = 5000;
    const s2 = treatPlayer(s, p.id);
    expect(s2.clubs.texty.players[5].injured).toBe(0);
    expect(s2.coins).toBe(5000 - 2 * B.injuries.treatCostPerMatch);
    const s3 = restoreStamina(s2, p.id);
    expect(s3.clubs.texty.players[5].stamina).toBe(100);
    expect(s3.coins).toBe(s2.coins - restoreCost(40));
    s = clone(s); s.coins = 10;
    expect(() => treatPlayer(s, p.id)).toThrow(GameError);
    expect(s.clubs.texty.players[5].injured).toBe(2);
    expect(() => treatPlayer(s3, p.id)).toThrow(GameError); // уже здоровий
  });
  it('ринок зірок закритий без джекпоту; купівля списує кошти і додає гравця', () => {
    let s = fresh();
    s.coins = 50000;
    expect(() => buyStar(s, 'messi')).toThrow(/закрито/);
    s.transfers.marketOpenUntil = 5;
    s = buyStar(s, 'messi');
    expect(s.coins).toBe(40000);
    expect(s.transfers.owners.messi).toBe('texty');
    expect(s.clubs.texty.players.filter((p) => p.special === 'messi')).toHaveLength(1);
    expect(s.clubs.texty.players).toHaveLength(24);
    expect(() => buyStar(s, 'messi')).toThrow(GameError); // без дублікатів
    s.coins = 100;
    expect(() => buyStar(s, 'ronaldo')).toThrow(/Недостатньо/);
  });
});

describe('мегатрансфери', () => {
  it('гарантоване випадіння не пізніше третього матчу', () => {
    const rng = makeRng(9);
    const s = fresh();
    let maxGap = 0, gap = 0, drops = 0;
    for (let i = 0; i < 3000; i++) {
      const c = rollCard(s, rng);
      if (c) { s.transfers.pity = 0; gap = 0; drops++; } else { s.transfers.pity++; gap++; maxGap = Math.max(maxGap, gap); }
    }
    expect(maxGap).toBeLessThanOrEqual(B.transfers.pityMatches - 1);
    expect(drops).toBeLessThan(3000); // але не після кожного матчу
  });
  it('рідкісність: Оксана — найрідкісніша, рідкісні та епічні — найчастіші', () => {
    const rng = makeRng(4);
    const s = fresh(); s.transfers.pity = 5;
    const cnt: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) { const c = rollCard(s, rng)!; const k = c.kind === 'unit' ? c.unitId : c.kind; cnt[k] = (cnt[k] ?? 0) + 1; }
    expect(cnt.sponsor).toBeGreaterThan(0);
    expect(cnt.oksana).toBeGreaterThan(0);
    for (const u of TRANSFER_UNITS) if (u.id !== 'oksana') expect(cnt[u.id]).toBeGreaterThan(cnt.oksana);
    expect(cnt.troian).toBeGreaterThan(cnt.zakhar);
    expect(cnt.zakhar).toBeGreaterThan(cnt.ihor);
    expect(cnt.jackpot).toBeGreaterThan(0);
  });
  it('без дублікатів: персонаж користувача більше не випадає', () => {
    const s = fresh();
    giveUnit(s, 'texty', 'zakhar', 'mega');
    giveUnit(s, 'texty', 'trio', 'mega');
    const ids = userCandidates(s).map((c) => c.unit.id);
    expect(ids).not.toContain('zakhar'); expect(ids).not.toContain('trio');
    const rng = makeRng(1); s.transfers.pity = 9;
    for (let i = 0; i < 2000; i++) { const c = rollCard(s, rng)!; if (c.kind === 'unit') { expect(c.unitId).not.toBe('zakhar'); expect(c.unitId).not.toBe('trio'); expect(c.unitId).not.toBe('duo'); } }
  });
  it('комплекти видаються цілком; супертріо та мегадуо взаємовиключні в сезоні', () => {
    const s = fresh();
    giveUnit(s, 'nv', 'trio', 'mega');
    expect(s.clubs.nv.players.filter((p) => ['barkar', 'mashkova', 'holub'].includes(p.special ?? ''))).toHaveLength(3);
    expect(s.transfers.legendaryLock).toBe('trio');
    expect(userCandidates(s).map((c) => c.unit.id)).not.toContain('duo');
    const rng = makeRng(2);
    for (let i = 0; i < 300; i++) { s.round = 10; s.transfers.aiCount = 0; for (const t of aiTransfers(s, rng)) expect(t.unitId).not.toBe('duo'); }
    expect(s.transfers.owners.zelenchuk).toBeUndefined();
    // у новому сезоні подія переініціалізується
    s.round = ROUNDS; s.results = s.schedule.map((r, i) => r.map((f) => ({ round: i, home: f.home, away: f.away, score: [0, 0] as [number, number] })));
    const n = nextSeason(s);
    expect(n.transfers.legendaryLock).toBeNull();
    expect(n.clubs.nv.players.filter((p) => p.special).length).toBe(3); // гравці зберігаються
  });
  it('унікальний персонаж грає лише за один клуб; перехід забирає його в колишнього клубу', () => {
    const s = fresh();
    giveUnit(s, 'suspilne', 'oksana', 'mega');
    expect(s.clubs.suspilne.megaTransfers).toContain('oksana');
    const e = giveUnit(s, 'texty', 'oksana', 'mega');
    expect(e.kind).toBe('steal'); expect(e.from).toBe('suspilne');
    expect(s.clubs.suspilne.players.some((p) => p.special === 'oksana')).toBe(false);
    expect(s.clubs.suspilne.megaTransfers).not.toContain('oksana');
    expect(s.clubs.suspilne.players).toHaveLength(24);
    let owners = 0;
    for (const c of Object.values(s.clubs)) owners += c.players.filter((p) => p.special === 'oksana').length;
    expect(owners).toBe(1);
    expect(s.transfers.owners.oksana).toBe('texty');
  });
  it('суперники не отримують трансфери в перших чотирьох турах', () => {
    const rng = makeRng(3);
    const s = fresh();
    for (let i = 0; i < 500; i++) for (const r of [0, 1, 2, 3]) { s.round = r; expect(aiTransfers(s, rng)).toHaveLength(0); }
    let got = 0;
    for (let i = 0; i < 200; i++) { s.round = 4; got += aiTransfers(s, rng).length; }
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThanOrEqual(B.transfers.aiMaxPerSeason + 1); // +1 — обовʼязкова поява Оксани в «Суспільному»
    expect(Object.values(s.transfers.owners).every((c) => c !== 'texty')).toBe(true);
  });
  it('Оксана Романюк завжди починає в «Суспільне Юнайтед» і переходить до користувача саме звідти', () => {
    const rng = makeRng(11);
    const s = fresh();
    s.round = 3; aiTransfers(s, rng);
    expect(s.transfers.owners.oksana).toBeUndefined(); // до 5-го туру суперники без трансферів
    s.round = 4; aiTransfers(s, rng);
    expect(s.transfers.owners.oksana).toBe('suspilne');
    for (let i = 0; i < 300; i++) { s.round = 10; s.transfers.aiCount = 0; for (const t of aiTransfers(s, rng)) expect(t.unitId).not.toBe('oksana'); }
    s.transfers.pity = 9;
    let seen = 0;
    for (let i = 0; i < 6000; i++) { const c = rollCard(s, rng)!; if (c.kind === 'unit' && c.unitId === 'oksana') { seen++; expect(c.from).toBe('suspilne'); } }
    expect(seen).toBeGreaterThan(0);
    // ще до появи в «Суспільному» картка також оформлюється як перехід звідти
    const early = fresh(); early.transfers.pity = 9;
    for (let i = 0; i < 6000; i++) { const c = rollCard(early, rng)!; if (c.kind === 'unit' && c.unitId === 'oksana') expect(c.from).toBe('suspilne'); }
    // менеджер «Суспільного»: Оксана не йде до суперників і гарантовано зʼявляється наприкінці сезону
    const own = fresh('suspilne'); own.round = 10; aiTransfers(own, rng);
    expect(own.transfers.owners.oksana).toBeUndefined();
    own.round = 30; own.transfers.pity = 9;
    expect(rollCard(own, rng)).toEqual({ kind: 'unit', unitId: 'oksana' });
  });

  it('всі 14 персонажів ІМІ присутні в пулі', () => {
    expect(IMI_SPECIALS).toHaveLength(14);
    expect(new Set(TRANSFER_UNITS.flatMap((u) => u.members)).size).toBe(14);
  });
});

describe('сезон', () => {
  let s: SaveState = fresh('rubryka', 2026);
  const coinsByRound: number[] = [];

  it('повний сезон: 34 тури, 306 матчів, коректна таблиця, без повторних нагород', () => {
    let maxNoDrop = 0, noDrop = 0;
    for (let r = 0; r < ROUNDS; r++) {
      const before = s;
      const after = playRoundAuto(s);
      expect(after.round).toBe(r + 1);
      expect(after.results).toHaveLength(r + 1);
      expect(after.results[r]).toHaveLength(9);
      expect(before.round).toBe(r); // вихідний стан не змінено
      expect(() => applyRound(after, {} as never, new Map())).toThrow(); // тур не можна застосувати двічі
      const post = after.pending!;
      expect(post.others).toHaveLength(8);
      const earned = post.rewards.reduce((a, e) => a + e.amount, 0);
      const bonus = post.seasonFinished ? after.coinLog.filter((c) => c.round === ROUNDS && /Чемпіон|Призове/.test(c.reason)).reduce((a, c) => a + c.amount, 0) : 0;
      expect(after.coins).toBe(before.coins + earned + bonus);
      if (post.card) { noDrop = 0; } else { noDrop++; maxNoDrop = Math.max(maxNoDrop, noDrop); }
      let st = after;
      if (post.card) {
        expect(() => ackPostMatch(st)).toThrow(GameError);
        st = claimCard(st, true);
        expect(() => claimCard(st, true)).toThrow(GameError); // картку не можна отримати двічі
      }
      st = ackPostMatch(st);
      expect(st.pending).toBeNull();
      for (const c of Object.values(st.clubs)) { expect(c.players).toHaveLength(24); for (const p of c.players) { expect(p.stamina).toBeGreaterThanOrEqual(0); expect(p.stamina).toBeLessThanOrEqual(100); } }
      coinsByRound.push(st.coins);
      s = st;
    }
    expect(maxNoDrop).toBeLessThanOrEqual(2);
    expect(s.results.flat()).toHaveLength(306);
    const t = computeTable(ALL_CLUB_IDS, s.results);
    expect(t.every((r) => r.p === 34)).toBe(true);
    expect(t.reduce((a, r) => a + r.gd, 0)).toBe(0);
    expect(t.reduce((a, r) => a + r.w, 0)).toBe(t.reduce((a, r) => a + r.l, 0));
    for (const r of t) expect(r.pts).toBe(r.w * 3 + r.d);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].champion).toBe(t[0].id);
    expect(s.userMatches).toHaveLength(34);
    // Оксана зʼявилася хоча б в одному клубі
    expect(s.transfers.owners.oksana).toBeDefined();
    // унікальність персонажів у всій лізі
    const seen = new Map<string, number>();
    for (const c of Object.values(s.clubs)) for (const p of c.players) if (p.special) seen.set(p.special, (seen.get(p.special) ?? 0) + 1);
    for (const n of seen.values()) expect(n).toBe(1);
    const hasTrio = seen.has('barkar'), hasDuo = seen.has('zelenchuk');
    expect(hasTrio && hasDuo).toBe(false);
    expect(seen.has('barkar')).toBe(seen.has('holub'));
    // користувач зібрав помітну кількість персонажів
    const mine = Object.values(s.transfers.owners).filter((c) => c === 'rubryka').length;
    expect(mine).toBeGreaterThanOrEqual(4);
    expect(s.coinLog.filter((c) => c.season === 1 && c.reason === 'Фінансовий джекпот ІМІ').length).toBeLessThanOrEqual(1);
    expect(() => playRoundAuto(s)).toThrow(/завершено/);
  });

  it('наступний сезон зберігає клуб, гравців і медіакоїни та створює новий календар', () => {
    const n = nextSeason(s);
    expect(n.season).toBe(2); expect(n.round).toBe(0); expect(n.results).toHaveLength(0);
    expect(n.userClub).toBe('rubryka'); expect(n.coins).toBe(s.coins);
    expect(validateSchedule(n.schedule, ALL_CLUB_IDS)).toEqual([]);
    expect(JSON.stringify(n.schedule)).not.toBe(JSON.stringify(s.schedule));
    expect(n.clubs.rubryka.megaTransfers).toEqual(s.clubs.rubryka.megaTransfers);
    expect(n.clubs.nv.boost).toBeGreaterThan(0); expect(n.clubs.rubryka.boost).toBe(0);
    expect(n.history).toHaveLength(1);
    const n2 = playRoundAuto(n);
    expect(n2.round).toBe(1);
    expect(() => nextSeason(n2)).toThrow();
    let x = n; for (let i = 0; i < 10; i++) { x = clone(x); x.round = ROUNDS; x.results = x.schedule.map((r, k) => r.map((f) => ({ round: k, home: f.home, away: f.away, score: [0, 0] as [number, number] }))); x = nextSeason(x); }
    expect(x.clubs.nv.boost).toBeLessThanOrEqual(B.seasons.aiGrowthCap); // складність обмежена
  });

  it('зміна схеми та перестановки зберігають 11 унікальних гравців', () => {
    let st = fresh();
    for (const f of ['4-4-2', '5-3-2', '4-2-3-1', '4-3-3'] as const) {
      st = setFormation(st, f);
      const l = st.clubs.texty.lineup;
      expect(l.filter(Boolean)).toHaveLength(11); expect(new Set(l).size).toBe(11);
    }
    const c = st.clubs.texty;
    const benchP = c.players.find((p) => !c.lineup.includes(p.id) && p.role === 'ST')!;
    const st2 = setLineupSlot(st, 9, benchP.id);
    expect(st2.clubs.texty.lineup[9]).toBe(benchP.id);
    const st3 = setLineupSlot(st2, 5, st2.clubs.texty.lineup[6]); // обмін двох стартових
    expect(new Set(st3.clubs.texty.lineup).size).toBe(11);
    expect(CLUBS.length).toBe(18);
  });
});
