import { describe, expect, it } from 'vitest';
import { BALANCE as B } from '../src/data/balance';
import { MatchEngine, simulateMatch } from '../src/simulation/engine';
import { mkTeam } from '../scripts/mk';

const run = (seed: number, a = mkTeam('a', 75), b = mkTeam('b', 75)) => simulateMatch({ home: a, away: b, seed });

describe('симуляція матчу', () => {
  it('детермінована: однаковий seed — однаковий матч', () => {
    const r1 = run(42), r2 = run(42);
    expect(r1.score).toEqual(r2.score);
    expect(r1.events.length).toBe(r2.events.length);
    expect(r1.stats).toEqual(r2.stats);
  });

  it('рахунок завжди дорівнює кількості зафіксованих голів', () => {
    for (let s = 1; s <= 25; s++) {
      const r = run(s * 13);
      expect(r.goals.filter((g) => g.team === 0).length).toBe(r.score[0]);
      expect(r.goals.filter((g) => g.team === 1).length).toBe(r.score[1]);
      expect(r.events.filter((e) => e.type === 'goal' || e.type === 'ownGoal').length).toBe(r.score[0] + r.score[1]);
      expect(r.stats[0].goals).toBe(r.score[0]);
      // удари у площину >= голи + сейви суперника (без автоголів)
      const own0 = r.goals.filter((g) => g.team === 0 && g.own).length;
      expect(r.stats[0].onTarget).toBeGreaterThanOrEqual(r.score[0] - own0);
      expect(r.stats[0].shots).toBeGreaterThanOrEqual(r.stats[0].onTarget);
      expect(r.stats[0].possession + r.stats[1].possession).toBe(100);
    }
  });

  it('матч триває два тайми по 90 секунд ігрового часу (плюс короткі паузи)', () => {
    const m = new MatchEngine({ home: mkTeam('a', 75), away: mkTeam('b', 75), seed: 7, autoVar: true });
    let playT = 0;
    while (!m.finished) { if (m.phase === 'half') m.startSecondHalf(); const c = m.clock; m.step(); if (m.clock > c) playT += m.clock - c; }
    expect(playT).toBeGreaterThanOrEqual(2 * B.match.halfSeconds);
    expect(playT).toBeLessThan(2 * (B.match.halfSeconds + B.match.stoppageMax + B.match.lastAttackMaxExtra) + 1);
    expect(m.time).toBeLessThan(300);
  });

  it('на полі не більше 11 гравців; вилученого не замінюють; замін не більше ліміту', () => {
    let reds = 0;
    for (let s = 1; s <= 40; s++) {
      const m = new MatchEngine({ home: mkTeam('a', 75), away: mkTeam('b', 75), seed: s * 101, autoVar: true });
      while (!m.finished) {
        if (m.phase === 'half') m.startSecondHalf();
        m.step();
        if (m.tick % 600 === 0) for (const t of [0, 1] as const) {
          const on = m.onPitch(t).length;
          const red = m.teams[t].players.filter((p) => p.red).length;
          expect(on).toBeLessThanOrEqual(11 - red);
          expect(m.onPitch(t).filter((p) => p.role === 'GK').length).toBeLessThanOrEqual(1);
        }
      }
      const r = m.result();
      for (const t of [0, 1] as const) {
        expect(r.stats[t].subs).toBeLessThanOrEqual(B.match.maxSubs);
        reds += r.stats[t].reds;
        const redPlayers = r.players.filter((p) => p.team === t && p.red);
        expect(redPlayers.length).toBe(r.stats[t].reds);
      }
    }
    expect(reds).toBeGreaterThan(0); // вилучення справді трапляються
  });

  it('заміна менеджера виконується під час зупинки гри', () => {
    const a = mkTeam('a', 75, true);
    const m = new MatchEngine({ home: a, away: mkTeam('b', 75), seed: 3, autoVar: true });
    for (let i = 0; i < 600; i++) m.step();
    expect(m.queueSub(0, 'a-9', 'a-22')).toBe(true);
    expect(m.queueSub(0, 'a-9', 'a-23')).toBe(false); // той самий гравець двічі
    while (!m.finished) { if (m.phase === 'half') m.startSecondHalf(); m.step(); }
    const r = m.result();
    expect(r.events.some((e) => e.type === 'sub' && e.pid === 'a-9')).toBe(true);
    expect(r.players.find((p) => p.pid === 'a-22')!.played).toBe(true);
  });

  it('втома знижує витривалість, але не виснажує за один матч', () => {
    const r = run(11);
    const field = r.players.filter((p) => p.played && p.minutes > 0.9 && !p.pid.endsWith('-0'));
    expect(field.length).toBeGreaterThan(10);
    for (const p of field) { expect(p.staminaEnd).toBeLessThan(90); expect(p.staminaEnd).toBeGreaterThan(55); }
  });
});

describe('суперздібності', () => {
  const mk = (isUser: boolean, sp: Record<number, string>) => new MatchEngine({ home: mkTeam('a', 75, isUser, sp), away: mkTeam('b', 75, !isUser && false), seed: 1, autoVar: true });

  it('Оксана в клубі користувача: 100% голів з ударів у площину, навіть проти особливого воротаря', () => {
    const m = new MatchEngine({ home: mkTeam('a', 75, true, { 9: 'oksana' }), away: mkTeam('b', 75, false, { 0: 'ihor' }), seed: 1 });
    const ok = m.players.find((p) => p.sp?.id === 'oksana')!;
    const k = m.keeper(1)!;
    expect(k.sp?.id).toBe('ihor');
    expect(m.goalProb(ok, k, 15, 34, false, false).pGoal).toBe(1);
  });

  it('Оксана в клубі суперника: 50%, а проти Ігоря користувача — значно менше', () => {
    const m = new MatchEngine({ home: mkTeam('a', 75, true, { 0: 'ihor' }), away: mkTeam('b', 75, false, { 9: 'oksana' }), seed: 1 });
    const ok = m.players.find((p) => p.sp?.id === 'oksana')!;
    expect(m.goalProb(ok, m.keeper(0), 15, 34, false, false).pGoal).toBeLessThanOrEqual(0.2);
    const m2 = new MatchEngine({ home: mkTeam('a', 75, true), away: mkTeam('b', 75, false, { 9: 'oksana' }), seed: 1 });
    const ok2 = m2.players.find((p) => p.sp?.id === 'oksana')!;
    expect(m2.goalProb(ok2, m2.keeper(0), 15, 34, false, false).pGoal).toBe(0.5);
  });

  it('Ігор: 90% сейвів у користувача, 45–50% у суперника', () => {
    const m = mk(true, { 0: 'ihor' });
    const shooter = m.players.find((p) => p.team === 1 && p.role === 'ST')!;
    expect(m.goalProb(shooter, m.keeper(0), 15, 34, false, false).pGoal).toBeCloseTo(0.1, 5);
    const m2 = new MatchEngine({ home: mkTeam('a', 75, false, { 0: 'ihor' }), away: mkTeam('b', 75, true), seed: 1 });
    const sh2 = m2.players.find((p) => p.team === 1 && p.role === 'ST')!;
    const pg = m2.goalProb(sh2, m2.keeper(0), 15, 34, false, false).pGoal;
    expect(pg).toBeGreaterThanOrEqual(0.5); expect(pg).toBeLessThanOrEqual(0.55);
  });

  it('здібність не спрацьовує без умов: без удару у площину Оксана не забиває', () => {
    // статистично: голи Оксани <= її удари у площину
    let goals = 0, shots = 0;
    for (let s = 1; s <= 12; s++) {
      const r = simulateMatch({ home: mkTeam('a', 75, true, { 9: 'oksana' }), away: mkTeam('b', 75), seed: s * 7 });
      const p = r.players.find((x) => x.special === 'oksana')!;
      goals += p.goals; shots += p.shots;
      expect(p.goals).toBeLessThanOrEqual(p.shots);
    }
    expect(shots).toBeGreaterThan(goals); // не кожен удар — гол (є промахи та блоки)
    expect(goals).toBeGreaterThan(5);
  });

  it('супертріо дає повний командний бонус лише втрьох', () => {
    const full = mk(true, { 5: 'mashkova', 6: 'barkar', 7: 'holub' });
    const two = mk(true, { 5: 'mashkova', 6: 'barkar' });
    expect(full.teams[0].bonus.pass).toBeGreaterThan(two.teams[0].bonus.pass);
    expect(full.teams[0].bonus.pass).toBeLessThanOrEqual(B.sim.teamBonusCap);
  });

  it('VAR доступний лише з Юридичним мегадуо і лише раз за матч', () => {
    expect(mk(true, {}).teams[0].varLeft).toBe(false);
    expect(mk(true, { 6: 'zelenchuk', 7: 'stoinov' }).teams[0].varLeft).toBe(true);
    let used = 0;
    for (let s = 1; s <= 30; s++) {
      const r = simulateMatch({ home: mkTeam('a', 75, true, { 6: 'zelenchuk', 7: 'stoinov' }), away: mkTeam('b', 78), seed: s * 3 });
      const n = r.events.filter((e) => e.type === 'var').length;
      expect(n).toBeLessThanOrEqual(1);
      used += n;
    }
    expect(used).toBeGreaterThan(0);
  });

  it('«Повітряний штурм» трапляється лише коли подія активна і є кутовий', () => {
    let storms = 0, armed = 0;
    for (let s = 1; s <= 30; s++) {
      const a = mkTeam('a', 75, true, { 0: 'ihor' }); a.stormArmed = true;
      const r = simulateMatch({ home: a, away: mkTeam('b', 75), seed: s * 5 });
      armed++;
      const st = r.events.filter((e) => e.type === 'storm').length;
      expect(st).toBeLessThanOrEqual(1);
      if (st) { storms++; expect(r.stats[0].corners).toBeGreaterThan(0); expect(r.stormHappened[0]).toBe(true); }
      const off = simulateMatch({ home: mkTeam('a', 75, true, { 0: 'ihor' }), away: mkTeam('b', 75), seed: s * 5 });
      expect(off.events.some((e) => e.type === 'storm')).toBe(false);
    }
    expect(storms).toBeGreaterThan(0);
    expect(storms).toBeLessThanOrEqual(armed);
  });
});
