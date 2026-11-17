import { describe, expect, it } from 'vitest';
import { MSG, person, roleName } from '../src/data/i18n';
import { RARITY } from '../src/data/rarity';
import { SPECIAL_BY_ID, TRANSFER_UNITS } from '../src/data/specials';
import { eventLine } from '../src/game/commentary';
import { MatchEngine, simulateMatch } from '../src/simulation/engine';
import { makeRng } from '../src/simulation/rng';
import { openOffseason, marketList, startDeal } from '../src/systems/market';
import { ROUNDS, newGame } from '../src/systems/season';
import { giveUnit, rollCard } from '../src/systems/transfers';
import { mkTeam } from '../scripts/mk';

const K = 'katarina-mathernova';

describe('Катаріна Матернова', () => {
  it('дані персонажа', () => {
    const k = SPECIAL_BY_ID[K];
    expect(k.name).toBe('Катаріна Матернова');
    expect(k.short).toBe('Катаріна М.');
    expect(k.gender).toBe('female');
    expect(k.rarity).toBe('epic');
    expect(RARITY[k.rarity].color).toBe('#347DE0');
    expect(k.user.q).toBe(89);
    expect(k.title).toBe('Повітряна блискавка');
    expect(k.ability).toBe('Європейські ножиці');
    expect(k.img).toBe('assets/specials/eu.png'); // емблема ЄС, не логотип ІМІ
    expect(k.kind).not.toBe('imi');
  });

  it('рейтинг Ганни та Ігоря — 93', () => {
    expect(SPECIAL_BY_ID.hanna.user.q).toBe(93);
    expect(SPECIAL_BY_ID.ihor.user.q).toBe(93);
  });

  it('випадає рідше за середнього епічного персонажа', () => {
    const rng = makeRng(77);
    const s = newGame('lb', 2); s.transfers.pity = 9;
    const cnt: Record<string, number> = {};
    for (let i = 0; i < 40000; i++) { const c = rollCard(s, rng)!; if (c.kind === 'unit') cnt[c.unitId] = (cnt[c.unitId] ?? 0) + 1; }
    const epics = TRANSFER_UNITS.filter((u) => u.rarity === 'epic' && u.id !== K).map((u) => cnt[u.id] ?? 0);
    const avg = epics.reduce((a, b) => a + b, 0) / epics.length;
    expect(cnt[K]).toBeGreaterThan(0);
    expect(cnt[K]).toBeLessThan(avg * 0.7);
  });

  it('унікальна: належить лише одному клубу, переходить без дублікатів, є на міжсезонному ринку', () => {
    const s = newGame('texty', 4);
    giveUnit(s, 'nv', K, 'mega');
    giveUnit(s, 'texty', K, 'mega');
    let n = 0;
    for (const c of Object.values(s.clubs)) n += c.players.filter((p) => p.special === K).length;
    expect(n).toBe(1);
    expect(s.transfers.owners[K]).toBe('texty');
    const t = newGame('texty', 4);
    giveUnit(t, 'babel', K, 'mega');
    t.round = ROUNDS; t.results = t.schedule.map((r, i) => r.map((f) => ({ round: i, home: f.home, away: f.away, score: [0, 0] as [number, number] })));
    t.history.push({ season: 1, champion: 'babel', table: [], userPos: 3, userPts: 60, topScorers: [], transfers: [], achievements: [], userResults: [], coinsEarned: 0 });
    const o = openOffseason(t);
    expect(marketList(o).some((x) => x.sp.id === K)).toBe(true);
    expect(() => startDeal(o, K)).not.toThrow();
  });

  it('«Європейські ножиці» трапляються після навісів, не кожен такий удар — гол, втома знижує шанс', () => {
    let attempts = 0, goals = 0, onT = 0;
    for (let i = 0; i < 40; i++) {
      const r = simulateMatch({ home: mkTeam('a', 75, true, { 9: K }), away: mkTeam('b', 75), seed: 300 + i });
      attempts += r.events.filter((e) => e.type === 'scissors').length;
      goals += r.goals.filter((g) => g.scissors).length;
      onT += r.abilities['Європейські ножиці'] ?? 0;
    }
    expect(attempts).toBeGreaterThan(0);
    expect(goals).toBeLessThan(attempts);
    expect(onT).toBeGreaterThanOrEqual(attempts);
    // проти Ігоря (користувача) діють його правила
    const m = new MatchEngine({ home: mkTeam('a', 75, true, { 0: 'ihor' }), away: mkTeam('b', 75, false, { 9: K }), seed: 1 });
    const k = m.players.find((p) => p.sp?.id === K)!;
    expect(m.goalProb(k, m.keeper(0), 9, 34, false, false, true).pGoal).toBeLessThan(0.05);
    const m2 = new MatchEngine({ home: mkTeam('a', 75, true, { 9: K }), away: mkTeam('b', 75), seed: 1 });
    const k2 = m2.players.find((p) => p.sp?.id === K)!;
    expect(m2.goalProb(k2, m2.keeper(1), 9, 34, false, false, true).pGoal).toBeGreaterThanOrEqual(0.6);
  });

  it('втомлюється й може травмуватися', () => {
    const r = simulateMatch({ home: mkTeam('a', 75, true, { 9: K }), away: mkTeam('b', 75), seed: 5 });
    const k = r.players.find((p) => p.special === K)!;
    expect(k.staminaEnd).toBeLessThan(100);
    expect(SPECIAL_BY_ID[K].noInjury).toBeFalsy();
  });

  it('фемінітиви', () => {
    const p = person('', K);
    expect(MSG.heroLine(p)).toBe('Героїня матчу — Катаріна Матернова');
    expect(MSG.scored(p)).toBe('Катаріна Матернова забила гол');
    expect(MSG.injured(p)).toBe('Катаріна Матернова зазнала травми!');
    expect(MSG.bestOfMatch(p)).toBe('Катаріна Матернова — найкраща гравчиня матчу');
    expect(roleName('ST', p.gender)).toBe('Нападниця');
    expect(eventLine({ type: 'goal', min: 70, minLabel: '70', team: 0, name: 'Катаріна Матернова', special: K, text: 'scissors' }, ['А', 'Б'])!.text)
      .toBe('НЕЙМОВІРНИЙ ГОЛ! КАТАРІНА МАТЕРНОВА ЗАБИВАЄ НОЖИЦЯМИ!');
  });
});
