// Скільки пропускає Ігор: у клубі користувача та в клубі суперника (звичайні нападники проти нього).
import { simulateMatch } from '../src/simulation/engine';
import { mkTeam } from './mk';
function run(label: string, ihorUser: boolean, n = 60) {
  let conceded = 0, onT = 0;
  for (let i = 0; i < n; i++) {
    const r = ihorUser
      ? simulateMatch({ home: mkTeam('a', 75, true, { 0: 'ihor' }), away: mkTeam('b', 75), seed: 70 + i })
      : simulateMatch({ home: mkTeam('a', 75, true), away: mkTeam('b', 75, false, { 0: 'ihor' }), seed: 70 + i });
    const t = ihorUser ? 1 : 0;
    conceded += r.score[t]; onT += r.stats[t].onTarget;
  }
  console.log(label, 'пропущено за матч', (conceded / n).toFixed(2), '· ударів у площину', (onT / n).toFixed(1), '· частка голів', (conceded / onT).toFixed(3));
}
run('Ігор у користувача:', true);
run('Ігор у суперника: ', false);
