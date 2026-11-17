import { describe, expect, it } from 'vitest';
import { BALANCE as B } from '../src/data/balance';
import { MatchEngine, simulateMatch } from '../src/simulation/engine';
import { newGame, buildMatchSetup, weatherFor } from '../src/systems/season';
import { mkTeam } from '../scripts/mk';

const run = (setup: Partial<Parameters<typeof simulateMatch>[0]>, seed: number) =>
  simulateMatch({ home: mkTeam('a', 75, true), away: mkTeam('b', 75), seed, ...setup });

describe('вказівки з бровки', () => {
  it('діє обмежений час, потім перезарядка; одна вказівка за раз', () => {
    const m = new MatchEngine({ home: mkTeam('a', 75, true), away: mkTeam('b', 75), seed: 2 });
    for (let i = 0; i < 120; i++) m.step();
    expect(m.giveOrder(0, 'attack')).toBe(true);
    expect(m.giveOrder(0, 'press')).toBe(false);
    expect(m.orderOf(0)).toBe('attack');
    let t = 0;
    while (m.orderOf(0) && t++ < 60 * 60) { if (m.phase === 'half') m.startSecondHalf(); m.step(); }
    expect(m.orderOf(0)).toBeNull();
    expect(m.teams[0].orderCd).toBeGreaterThan(0);
    expect(m.giveOrder(0, 'hold')).toBe(false); // ще перезарядка
    expect(m.events.some((e) => e.type === 'order' && e.text === 'attack')).toBe(true);
  });

  it('«В атаку!» піднімає команду вище, пресинг коштує більше сил', () => {
    const avgX = (order: 'attack' | 'hold' | null) => {
      let sum = 0, n = 0;
      for (let k = 0; k < 8; k++) {
        const m = new MatchEngine({ home: mkTeam('a', 75, true), away: mkTeam('b', 75), seed: 100 + k });
        for (let i = 0; i < 300; i++) m.step();
        if (order) m.giveOrder(0, order);
        for (let i = 0; i < 600; i++) { m.step(); if (i % 10 === 0) for (const p of m.onPitch(0)) if (p.role !== 'GK') { sum += m.adv(0, p.x); n++; } }
      }
      return sum / n;
    };
    expect(avgX('attack')).toBeGreaterThan(avgX('hold') + 3);
    const drain = (order: 'press' | null) => {
      const m = new MatchEngine({ home: mkTeam('a', 75, true), away: mkTeam('b', 75), seed: 4 });
      for (let i = 0; i < 60; i++) m.step();
      if (order) m.giveOrder(0, order);
      for (let i = 0; i < 60 * B.orders.duration; i++) m.step();
      return m.onPitch(0).filter((p) => p.role !== 'GK').reduce((a, p) => a + (100 - p.stamina), 0);
    };
    expect(drain('press')).toBeGreaterThan(drain(null));
  });

  it('суперник використовує вказівки, коли програє наприкінці', () => {
    let used = 0;
    for (let i = 0; i < 20; i++) used += run({ home: mkTeam('a', 82, true), away: mkTeam('b', 68) }, 50 + i).events.filter((e) => e.type === 'order' && e.team === 1).length;
    expect(used).toBeGreaterThan(0);
  });
});

describe('погода', () => {
  it('визначена заздалегідь, однакова для передматчевого екрана й матчу', () => {
    const s = newGame('lb', 3);
    const fx = s.schedule[0][0];
    expect(buildMatchSetup(s, fx, 1).weather).toBe(weatherFor(s, fx));
    const all = s.schedule.flat().map((f) => weatherFor(s, f));
    for (const w of ['clear', 'night', 'rain', 'snow']) expect(all).toContain(w);
  });

  it('дощ: мʼяч котиться далі; сніг: гравці повільніші', () => {
    const rain = new MatchEngine({ home: mkTeam('a', 75), away: mkTeam('b', 75), seed: 1, weather: 'rain' });
    const clear = new MatchEngine({ home: mkTeam('a', 75), away: mkTeam('b', 75), seed: 1, weather: 'clear' });
    const snow = new MatchEngine({ home: mkTeam('a', 75), away: mkTeam('b', 75), seed: 1, weather: 'snow' });
    expect(rain.wx.friction).toBeLessThan(clear.wx.friction);
    const p = (m: MatchEngine) => m.players.find((x) => x.pid === 'a-6')!;
    expect(snow.speed(p(snow))).toBeLessThan(clear.speed(p(clear)));
    // матчі в будь-яку погоду коректно завершуються, рахунок = кількість голів
    for (const w of ['rain', 'snow', 'night'] as const) {
      const r = run({ weather: w }, 77);
      expect(r.goals.length).toBe(r.score[0] + r.score[1]);
    }
  });
});
