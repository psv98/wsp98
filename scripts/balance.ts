// Скрипт перевірки балансу: npm run balance
import { simulateMatch } from '../src/simulation/engine';
import type { TeamSetup } from '../src/simulation/types';
import { mkTeam } from './mk';
import { CLUBS } from '../src/data/clubs';

function run(label: string, home: () => TeamSetup, away: () => TeamSetup, n = 200) {
  let hw = 0, d = 0, aw = 0, g = 0, sh = 0, ot = 0, co = 0, fo = 0, yc = 0, rc = 0, inj = 0, pk = 0, poss = 0, pa = 0, pok = 0, sv = 0, dur = 0, tk = 0, spg = 0, sps = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const r = simulateMatch({ home: home(), away: away(), seed: 1000 + i * 7919 });
    if (r.score[0] > r.score[1]) hw++; else if (r.score[0] === r.score[1]) d++; else aw++;
    g += r.score[0] + r.score[1];
    for (const s of r.stats) { sh += s.shots; ot += s.onTarget; co += s.corners; fo += s.fouls; yc += s.yellows; rc += s.reds; inj += s.injuries; pa += s.passes; pok += s.passesOk; sv += s.saves; }
    for (const x of r.players) if (x.special === 'oksana' || x.special === 'hanna') { spg += x.goals; sps += x.shots; }
    tk += r.players.reduce((a, x) => a + x.tackles, 0); pk += r.goals.filter((x) => x.pen).length; poss += r.stats[0].possession; dur += r.durationPlayed;
  }
  const f = (x: number) => (x / n).toFixed(2);
  console.log(`${label}: H ${((hw / n) * 100).toFixed(0)}% D ${((d / n) * 100).toFixed(0)}% A ${((aw / n) * 100).toFixed(0)}% | goals ${f(g)} shots ${f(sh)} onT ${f(ot)} saves ${f(sv)} corners ${f(co)} fouls ${f(fo)} YC ${f(yc)} RC ${f(rc)} inj ${f(inj)} penG ${f(pk)} possH ${f(poss)} pass ${f(pa)} ok ${((pok / pa) * 100).toFixed(0)}% dur ${f(dur)}s tackles ${f(tk)} spG ${f(spg)}/${f(sps)} | ${((Date.now() - t0) / n).toFixed(0)}ms/match`);
}

const top = CLUBS[0].strength, bot = CLUBS[17].strength, mid = CLUBS[8].strength;
const N = Number(process.argv[2] ?? 200);
run('mid vs mid', () => mkTeam('a', mid), () => mkTeam('b', mid), N);
run('top(H) vs bottom', () => mkTeam('a', top), () => mkTeam('b', bot), N);
run('bottom(H) vs top', () => mkTeam('a', bot), () => mkTeam('b', top), N);
if (process.argv[3]) {
  run('user+Oksana vs mid', () => mkTeam('a', mid, true, { 9: 'oksana' }), () => mkTeam('b', mid), N);
  run('user+Ihor vs mid', () => mkTeam('a', mid, true, { 0: 'ihor' }), () => mkTeam('b', mid), N);
  run('mid vs opp+Oksana', () => mkTeam('a', mid, true), () => mkTeam('b', mid, false, { 9: 'oksana' }), N);
  run('user full IMI vs top', () => mkTeam('a', mid, true, { 0: 'ihor', 9: 'oksana', 2: 'zakhar', 3: 'dudka', 5: 'mashkova', 6: 'barkar', 7: 'holub', 8: 'zemliana', 10: 'ihnatieva' }), () => mkTeam('b', top), N);
  run('user+Hanna vs mid', () => mkTeam('a', mid, true, { 9: 'hanna' }), () => mkTeam('b', mid), N);
  run('user 6 epic/rare vs top', () => mkTeam('a', mid, true, { 2: 'zakhar', 3: 'dudka', 5: 'troian', 8: 'zemliana', 10: 'ihnatieva', 7: 'diachuk' }), () => mkTeam('b', top), N);
  run('tired(40) vs fresh', () => mkTeam('a', mid, false, {}, 40), () => mkTeam('b', mid), N);
}
