// Життєвий цикл чемпіонату: нова гра, обробка туру, завершення сезону, наступний сезон.
import { BALANCE as B } from '../data/balance';
import { CLUBS, CLUB_BY_ID } from '../data/clubs';
import { SPECIAL_BY_ID } from '../data/specials';
import { simulateMatch } from '../simulation/engine';
import { hashSeed, makeRng, rndInt } from '../simulation/rng';
import type { MatchResult, MatchSetup } from '../simulation/types';
import { addCoins, matchRewards } from './economy';
import { generateSchedule } from './schedule';
import { ALL_CLUB_IDS, buildTeamSetup, clubStrength, createClub, emptyStats } from './squad';
import { computeTable, positionOf } from './table';
import { aiTransfers, rollCard } from './transfers';
import { SAVE_VERSION, type Fixture, type MatchSummary, type PostMatch, type SaveState, type SeasonRecord, type UserMatchRecord } from './types';

export const ROUNDS = 34;
export const clone = <T,>(x: T): T => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export function newGame(userClub: string, seed: number, now = Date.now()): SaveState {
  if (!CLUB_BY_ID[userClub]) throw new Error('Невідомий клуб');
  const clubs: SaveState['clubs'] = {};
  for (const def of CLUBS) clubs[def.id] = createClub(def, seed);
  const rng = makeRng(hashSeed(seed, 'ihor'));
  return {
    version: SAVE_VERSION, createdAt: now, savedAt: now, seed, userClub, season: 1, round: 0,
    schedule: generateSchedule(ALL_CLUB_IDS, hashSeed(seed, 'schedule', 1)), results: [], clubs,
    coins: B.economy.startCoins, coinLog: [{ season: 1, round: 0, amount: B.economy.startCoins, reason: 'Стартовий бюджет' }],
    transfers: { pity: 0, owners: {}, legendaryLock: null, aiCount: 0, marketOpenUntil: -1, log: [], ihor: { count: 0, target: rndInt(rng, B.transfers.ihorStormMin, B.transfers.ihorStormMax) }, drops: 0 },
    pending: null, userMatches: [], history: [], events: [],
  };
}

export function userFixture(state: SaveState, round = state.round): Fixture | null {
  return state.schedule[round]?.find((f) => f.home === state.userClub || f.away === state.userClub) ?? null;
}

export function matchSeed(state: SaveState, round: number, idx: number) { return hashSeed(state.seed, 's', state.season, 'r', round, 'm', idx); }

export function buildMatchSetup(state: SaveState, fx: Fixture, seed: number): MatchSetup {
  return { home: buildTeamSetup(state, fx.home, true), away: buildTeamSetup(state, fx.away, false), seed };
}

/** Симуляція одного з «чужих» матчів туру тим самим рушієм. */
export function simulateFixture(state: SaveState, round: number, idx: number): MatchResult {
  const fx = state.schedule[round][idx];
  return simulateMatch(buildMatchSetup(state, fx, matchSeed(state, round, idx)));
}

function applyMatch(state: SaveState, fx: Fixture, res: MatchResult, post?: PostMatch) {
  const ids = [fx.home, fx.away];
  for (const pr of res.players) {
    const club = state.clubs[ids[pr.team]];
    const p = club.players.find((x) => x.id === pr.pid);
    if (!p) continue;
    const sp = p.special ? SPECIAL_BY_ID[p.special] : null;
    if (pr.played) {
      p.s.apps++; p.s.goals += pr.goals; p.s.assists += pr.assists; p.s.saves += pr.saves;
      p.stamina = sp && sp.fatigue === 0 ? 100 : Math.max(0, pr.staminaEnd);
      (p as { _played?: boolean })._played = true;
    }
    if (pr.yellow > 0 && pr.red !== 1) {
      p.s.yc += pr.yellow; p.yellows += pr.yellow;
      if (p.yellows >= B.discipline.yellowsForBan) { p.yellows -= B.discipline.yellowsForBan; p.suspended += 1; if (post && ids[pr.team] === state.userClub) post.newBans.push({ name: pr.name, matches: 1, reason: 'перебір жовтих карток' }); }
    }
    if (pr.red) {
      p.s.rc++;
      const n = pr.red === 2 ? B.discipline.directRedBan : B.discipline.redBan;
      p.suspended += n;
      if (post && ids[pr.team] === state.userClub) post.newBans.push({ name: pr.name, matches: n, reason: 'червона картка' });
    }
    if (pr.injury > 0) {
      p.injured = pr.injury;
      if (post && ids[pr.team] === state.userClub) post.newInjuries.push({ pid: p.id, name: pr.name, matches: pr.injury });
    }
  }
  if (res.motm) {
    const p = state.clubs[ids[res.motm.team]].players.find((x) => x.id === res.motm!.pid);
    if (p) p.s.motm++;
  }
}

function toRecord(round: number, fx: Fixture, res: MatchResult): UserMatchRecord {
  const cards: UserMatchRecord['cards'] = [];
  const subs: UserMatchRecord['subs'] = [];
  const injuries: UserMatchRecord['injuries'] = [];
  for (const e of res.events) {
    if (e.type === 'yellow') cards.push({ name: e.name ?? '', team: e.team as 0 | 1, kind: 'yellow' });
    if (e.type === 'red' || e.type === 'secondYellow') cards.push({ name: e.name ?? '', team: e.team as 0 | 1, kind: 'red' });
    if (e.type === 'sub') subs.push({ out: e.name ?? '', in: e.name2 ?? '', team: e.team as 0 | 1, min: e.minLabel });
    if (e.type === 'injury') injuries.push({ name: e.name ?? '', team: e.team as 0 | 1, matches: e.n ?? 1 });
  }
  const keeper = res.players.filter((p) => p.saves > 0).sort((a, b) => b.saves - a.saves)[0];
  return {
    round, home: fx.home, away: fx.away, score: res.score, goals: res.goals, stats: res.stats,
    motm: res.motm ? { name: res.motm.name, team: res.motm.team, special: res.motm.special } : null,
    abilities: res.abilities, injuries, cards, subs, topSaves: keeper ? { name: keeper.name, saves: keeper.saves } : undefined,
  };
}

/**
 * Застосовує результати туру до стану. Чиста функція: повертає новий стан.
 * Нагороди, таблиця, трансфери та перехід туру відбуваються атомарно — повторне нарахування неможливе.
 */
export function applyRound(prev: SaveState, userResult: MatchResult, others: Map<number, MatchResult>): SaveState {
  if (prev.pending) throw new Error('Попередній тур ще не підтверджено');
  if (prev.round >= ROUNDS) throw new Error('Сезон уже завершено');
  const state = clone(prev);
  const round = state.round;
  const fixtures = state.schedule[round];
  const rng = makeRng(hashSeed(state.seed, 'post', state.season, round, userResult.score[0], userResult.score[1], userResult.durationPlayed));
  const strengths: Record<string, number> = {};
  for (const id of ALL_CLUB_IDS) strengths[id] = clubStrength(state, id);

  // 1. Гравці, які пропускали цей тур через травму чи дискваліфікацію
  for (const club of Object.values(state.clubs)) for (const p of club.players) { if (p.injured > 0) p.injured--; if (p.suspended > 0) p.suspended--; }

  const post: PostMatch = { round, user: null as unknown as UserMatchRecord, others: [], rewards: [], card: null, cardClaimed: false, newInjuries: [], newBans: [], aiTransfers: [], sensation: [], seasonFinished: false };
  const summaries: MatchSummary[] = [];
  let userFx: Fixture | null = null;
  fixtures.forEach((fx, i) => {
    const isUser = fx.home === state.userClub || fx.away === state.userClub;
    const res = isUser ? userResult : others.get(i);
    if (!res) throw new Error(`Немає результату матчу ${i} туру ${round + 1}`);
    applyMatch(state, fx, res, post);
    const sum: MatchSummary = { round, home: fx.home, away: fx.away, score: [res.score[0], res.score[1]] };
    summaries.push(sum);
    if (isUser) { userFx = fx; post.user = toRecord(round, fx, res); if (res.stormHappened[0] || res.stormHappened[1]) state.transfers.ihor = { count: 0, target: rndInt(rng, B.transfers.ihorStormMin, B.transfers.ihorStormMax) }; }
    else post.others.push(sum);
    const diff = strengths[fx.home] - strengths[fx.away];
    if ((res.score[0] > res.score[1] && diff <= -B.upsetGap) || (res.score[1] > res.score[0] && diff >= B.upsetGap)) post.sensation.push(sum);
    // лічильник «Повітряного штурму»
    const ihorClub = state.transfers.owners['ihor'];
    if (ihorClub && (fx.home === ihorClub || fx.away === ihorClub)) {
      const ih = res.players.find((p) => p.special === 'ihor' && p.played);
      if (ih) {
        const side = fx.home === ihorClub ? 0 : 1;
        if (res.stormHappened[side]) state.transfers.ihor = { count: 0, target: rndInt(rng, B.transfers.ihorStormMin, B.transfers.ihorStormMax) };
        else state.transfers.ihor.count++;
      }
    }
  });
  if (!userFx) throw new Error('У турі немає матчу користувача');
  const ufx = userFx as Fixture;

  // 2. Відновлення між турами
  for (const club of Object.values(state.clubs)) {
    for (const p of club.players) {
      const played = (p as { _played?: boolean })._played;
      delete (p as { _played?: boolean })._played;
      const sp = p.special ? SPECIAL_BY_ID[p.special] : null;
      if (sp && sp.fatigue === 0) { p.stamina = 100; continue; }
      p.stamina = Math.min(100, Math.round((p.stamina + (played ? B.fatigue.recoverPlayed : B.fatigue.recoverRested)) * 10) / 10);
    }
  }

  // 3. Нагороди
  const userHome = ufx.home === state.userClub;
  const opp = userHome ? ufx.away : ufx.home;
  const side = userHome ? 0 : 1;
  let us = 0, them = 0, wasBehind = false;
  for (const g of userResult.goals) { if (g.team === side) us++; else them++; if (them > us) wasBehind = true; }
  post.rewards = matchRewards(state, post.user, strengths[state.userClub] - strengths[opp], wasBehind);
  addCoins(state, post.rewards);
  state.userMatches.push(post.user);
  state.results.push(summaries);

  // 4. Мегатрансфер користувача (лише кидок; гравець додається після підтвердження картки)
  post.card = rollCard(state, rng);
  if (post.card) { state.transfers.pity = 0; state.transfers.drops++; } else state.transfers.pity++;

  // 5. Трансфери суперників (картка користувача зарезервована; комплект одразу блокує взаємовиключний)
  const reserved = post.card?.kind === 'unit' && !post.card.from ? post.card.unitId : undefined;
  if (reserved === 'trio' || reserved === 'duo') state.transfers.legendaryLock = reserved;
  post.aiTransfers = aiTransfers(state, rng, reserved);

  for (const s of post.sensation) state.events.push({ season: state.season, round: round + 1, text: `Сенсація туру: ${CLUB_BY_ID[s.home].name} ${s.score[0]}:${s.score[1]} ${CLUB_BY_ID[s.away].name}` });
  if (state.events.length > 200) state.events = state.events.slice(-200);

  state.round = round + 1;
  if (state.round >= ROUNDS) { post.seasonFinished = true; finishSeason(state); }
  state.pending = post;
  return state;
}

function finishSeason(state: SaveState) {
  const table = computeTable(ALL_CLUB_IDS, state.results);
  const pos = positionOf(table, state.userClub);
  const E = B.economy;
  const earnedBefore = state.coinLog.filter((c) => c.season === state.season && c.amount > 0).reduce((a, c) => a + c.amount, 0);
  if (pos === 1) addCoins(state, [{ season: state.season, round: ROUNDS, amount: E.champion, reason: 'Чемпіон Білого суперкубка' }]);
  else if (pos <= 3) addCoins(state, [{ season: state.season, round: ROUNDS, amount: E.top3, reason: `Призове місце (${pos})` }]);
  const scorers: SeasonRecord['topScorers'] = [];
  for (const club of Object.values(state.clubs)) for (const p of club.players) if (p.s.goals > 0) scorers.push({ name: p.special ? SPECIAL_BY_ID[p.special].name : `Гравець №${p.num}`, club: club.id, goals: p.s.goals, special: p.special });
  scorers.sort((a, b) => b.goals - a.goals);
  const ur = state.userMatches.map((m) => ({ round: m.round + 1, opp: m.home === state.userClub ? m.away : m.home, home: m.home === state.userClub, score: m.score }));
  const row = table[pos - 1];
  const ach: string[] = [];
  if (pos === 1) ach.push('Чемпіон Білого суперкубка');
  else if (pos <= 3) ach.push(`Призер чемпіонату (${pos} місце)`);
  if (row.l === 0) ach.push('Сезон без поразок');
  if (row.gf >= 100) ach.push('Сотня забитих голів');
  if (row.w >= 25) ach.push('25+ перемог за сезон');
  const big = ur.map((m) => (m.home ? m.score[0] - m.score[1] : m.score[1] - m.score[0])).reduce((a, b) => Math.max(a, b), 0);
  if (big >= 4) ach.push(`Найбільша перемога з різницею +${big}`);
  const owned = Object.values(state.transfers.owners).filter((c) => c === state.userClub).length;
  if (owned >= 5) ach.push(`Колекціонер: ${owned} особливих гравців у складі`);
  if (!ach.length) ach.push('Сезон завершено');
  state.history.push({
    season: state.season, champion: table[0].id, table, userPos: pos, userPts: row.pts, topScorers: scorers.slice(0, 10),
    transfers: state.transfers.log.filter((t) => t.season === state.season), achievements: ach, userResults: ur,
    coinsEarned: earnedBefore + (pos === 1 ? E.champion : pos <= 3 ? E.top3 : 0),
  });
  state.events.push({ season: state.season, round: ROUNDS, text: `Чемпіон сезону ${state.season}: ${CLUB_BY_ID[table[0].id].name}` });
}

/** Наступний сезон: клуб, гравці, мегатрансфери та медіакоїни зберігаються; суперники сильнішають. */
export function nextSeason(prev: SaveState): SaveState {
  if (prev.round < ROUNDS) throw new Error('Сезон ще не завершено');
  const state = clone(prev);
  state.season++;
  state.round = 0;
  state.results = [];
  state.userMatches = [];
  state.pending = null;
  state.schedule = generateSchedule(ALL_CLUB_IDS, hashSeed(state.seed, 'schedule', state.season));
  state.transfers.legendaryLock = null; // глобальна подія комплектів переініціалізується
  state.transfers.aiCount = 0;
  state.transfers.marketOpenUntil = -1;
  const S = B.seasons;
  for (const club of Object.values(state.clubs)) {
    if (club.id !== state.userClub) club.boost = Math.min(S.aiGrowthCap, Math.round((club.boost + S.aiGrowthPerSeason) * 10) / 10);
    for (const p of club.players) { p.stamina = 100; p.injured = 0; p.suspended = 0; p.yellows = 0; p.s = emptyStats(); }
  }
  return state;
}

/** Повністю автоматичний тур (усі 9 матчів симулюються). Використовується в тестах і для миттєвого результату. */
export function playRoundAuto(state: SaveState): SaveState {
  if (state.round >= ROUNDS) throw new Error('Сезон уже завершено');
  const round = state.round;
  const others = new Map<number, MatchResult>();
  let user: MatchResult | null = null;
  state.schedule[round].forEach((fx, i) => {
    const res = simulateFixture(state, round, i);
    if (fx.home === state.userClub || fx.away === state.userClub) user = res; else others.set(i, res);
  });
  return applyRound(state, user!, others);
}
