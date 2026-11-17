import { describe, expect, it } from 'vitest';
import { BALANCE as B } from '../src/data/balance';
import { MatchEngine, simulateMatch } from '../src/simulation/engine';
import { attrMul, fatigueColor, fatigueState, injuryRiskMul, restoreCost, sigmaMul, speedMul } from '../src/simulation/fatigue';
import { restoreStamina } from '../src/systems/actions';
import { fatigueWarning } from '../src/systems/squad';
import { applyRound, clone, newGame, playRoundAuto } from '../src/systems/season';
import { mkTeam } from '../scripts/mk';

const engine = (st: number, specials: Record<number, string> = {}) => new MatchEngine({ home: mkTeam('a', 75, true, specials, st), away: mkTeam('b', 75), seed: 3 });

describe('втома в симуляції', () => {
  it('крива плавна і монотонна; стани за межами 80/60/40/20', () => {
    let prev = speedMul(0);
    for (let st = 1; st <= 100; st += 1) { const v = speedMul(st); expect(v).toBeGreaterThanOrEqual(prev); expect(v - prev).toBeLessThan(0.01); prev = v; }
    expect(fatigueState(85)).toBe('excellent'); expect(fatigueState(65)).toBe('normal'); expect(fatigueState(45)).toBe('tired');
    expect(fatigueState(25)).toBe('heavy'); expect(fatigueState(10)).toBe('critical');
    expect([fatigueColor(70), fatigueColor(50), fatigueColor(30), fatigueColor(10)]).toEqual(['green', 'yellow', 'orange', 'red']);
  });

  it('втомлений гравець рухається повільніше', () => {
    const fresh = engine(100), tired = engine(20);
    const f = fresh.players.find((p) => p.pid === 'a-6')!, t = tired.players.find((p) => p.pid === 'a-6')!;
    expect(tired.speed(t)).toBeLessThan(fresh.speed(f) * 0.92);
  });

  it('втома знижує передачі, удари й захист', () => {
    const fresh = engine(100), tired = engine(20);
    const f = fresh.players.find((p) => p.pid === 'a-6')!, t = tired.players.find((p) => p.pid === 'a-6')!;
    for (const k of ['pass', 'shoot', 'tackle', 'dribble'] as const) expect(tired.attr(t, k)).toBeLessThan(fresh.attr(f, k));
    expect(sigmaMul(20)).toBeGreaterThan(sigmaMul(100));
    expect(attrMul(20)).toBeLessThan(attrMul(80));
  });

  it('спеціальна здібність теж залежить від фізичного стану (Захар із 15%)', () => {
    const m = new MatchEngine({ home: mkTeam('a', 75, true, { 2: 'zakhar' }, 15), away: mkTeam('b', 75), seed: 1 });
    const z = m.players.find((p) => p.sp?.id === 'zakhar')!;
    const m2 = new MatchEngine({ home: mkTeam('a', 75, true, { 2: 'zakhar' }, 100), away: mkTeam('b', 75), seed: 1 });
    const z2 = m2.players.find((p) => p.sp?.id === 'zakhar')!;
    expect(m.speed(z)).toBeLessThan(m2.speed(z2));
    expect(m.attr(z, 'tackle')).toBeLessThan(m2.attr(z2, 'tackle'));
  });

  it('ризик травм зростає з утомою, але ніколи не гарантований', () => {
    expect(injuryRiskMul(100)).toBe(1);
    expect(injuryRiskMul(15)).toBeGreaterThan(injuryRiskMul(50) * 2);
    expect(injuryRiskMul(0)).toBeLessThanOrEqual(B.fatigue.injuryRiskMax);
    expect(B.sim.injuryOnDuel * injuryRiskMul(0)).toBeLessThan(0.05);
    let injT = 0, injF = 0;
    for (let i = 0; i < 25; i++) {
      injT += simulateMatch({ home: mkTeam('a', 75, false, {}, 10), away: mkTeam('b', 75), seed: 40 + i }).stats[0].injuries;
      injF += simulateMatch({ home: mkTeam('a', 75, false, {}, 100), away: mkTeam('b', 75), seed: 40 + i }).stats[0].injuries;
    }
    expect(injT).toBeGreaterThan(injF);
    expect(injT / 25).toBeLessThanOrEqual(B.fatigue.maxInjuriesPerTeam);
  });

  it('виснажена команда програє частіше', () => {
    let wF = 0, wT = 0;
    for (let i = 0; i < 20; i++) {
      const a = simulateMatch({ home: mkTeam('a', 75, false, {}, 100), away: mkTeam('b', 75), seed: 900 + i });
      const b = simulateMatch({ home: mkTeam('a', 75, false, {}, 25), away: mkTeam('b', 75), seed: 900 + i });
      wF += Math.sign(a.score[0] - a.score[1]); wT += Math.sign(b.score[0] - b.score[1]);
    }
    expect(wT).toBeLessThan(wF);
  });

  it('Оксана й Ігор не втомлюються, Ганна — втомлюється', () => {
    const m = engine(30, { 0: 'ihor', 9: 'oksana', 10: 'hanna' });
    while (!m.finished) { if (m.phase === 'half') m.startSecondHalf(); m.step(); }
    const r = m.result();
    expect(r.players.find((p) => p.special === 'oksana')!.staminaEnd).toBe(100);
    expect(r.players.find((p) => p.special === 'ihor')!.staminaEnd).toBe(100);
    expect(r.players.find((p) => p.special === 'hanna')!.staminaEnd).toBeLessThan(30);
  });

  it('за повний матч гравець втрачає ≈20–35%, за 15 хвилин — набагато менше', () => {
    const m = engine(100);
    let queued = false;
    while (!m.finished) { if (m.phase === 'half') m.startSecondHalf(); m.step(); if (!queued && m.half === 2 && m.clock > 62) { queued = m.queueSub(0, 'a-7', 'a-18'); } }
    const r = m.result();
    const full = r.players.find((p) => p.pid === 'a-6')!, sub = r.players.find((p) => p.pid === 'a-18')!;
    expect(100 - full.staminaEnd).toBeGreaterThan(18); expect(100 - full.staminaEnd).toBeLessThan(38);
    if (sub.played) expect(100 - sub.staminaEnd).toBeLessThan((100 - full.staminaEnd) * 0.5);
  });
});

describe('втома між матчами й відновлення', () => {
  it('втома зберігається між турами, запасні відновлюються, суперники теж втомлюються', () => {
    let s = newGame('lb', 5);
    s = playRoundAuto(s); s = { ...s, pending: null };
    const lb = s.clubs.lb;
    const starters = lb.players.filter((p) => p.s.apps > 0 && p.role !== 'GK');
    expect(starters.some((p) => p.stamina < 95)).toBe(true);
    const ai = Object.values(s.clubs).filter((c) => c.id !== 'lb').flatMap((c) => c.players).filter((p) => p.s.apps > 0 && p.role !== 'GK');
    expect(ai.some((p) => p.stamina < 95)).toBe(true);
    const copy = clone(s);
    copy.clubs.lb.players[20].stamina = 50;
    const n = playRoundAuto(copy);
    const bench = n.clubs.lb.players[20];
    if (bench.s.apps === 0) expect(bench.stamina).toBeGreaterThan(50);
  });

  it('відновлення за медіакоїни коштує прогресивно та реально повертає сили', () => {
    expect(restoreCost(100)).toBe(0);
    expect(restoreCost(80)).toBeLessThan(restoreCost(40));
    expect(restoreCost(10) / 90).toBeGreaterThan(restoreCost(80) / 20);
    const s = newGame('lb', 5); s.coins = 100000;
    s.clubs.lb.players[5].stamina = 15;
    const after = restoreStamina(s, s.clubs.lb.players[5].id);
    expect(after.clubs.lb.players[5].stamina).toBe(100);
    expect(after.coins).toBe(100000 - restoreCost(15));
    expect(() => restoreStamina(after, after.clubs.lb.players[5].id)).toThrow();
  });

  it('суперники відновлюють гравців за власні медіакоїни', () => {
    let s = newGame('lb', 8);
    for (const p of s.clubs.nv.players) p.stamina = 20;
    const coins = s.clubs.nv.coins;
    s = playRoundAuto(s);
    expect(s.clubs.nv.coins).not.toBe(coins);
    expect(s.clubs.nv.finance.log.some((e) => e.reason === 'Відновлення витривалості')).toBe(true);
    expect(s.clubs.nv.players.filter((p) => p.stamina >= 99).length).toBeGreaterThan(5);
  });

  it('попередження перед матчем', () => {
    const s = newGame('lb', 5);
    expect(fatigueWarning(s)).toBeNull();
    const xi = s.clubs.lb.lineup;
    s.clubs.lb.players.find((p) => p.id === xi[3])!.stamina = 35;
    expect(fatigueWarning(s)?.level).toBe('tired');
    s.clubs.lb.players.find((p) => p.id === xi[5])!.stamina = 12;
    expect(fatigueWarning(s)?.level).toBe('critical');
  });

  void applyRound;
});
