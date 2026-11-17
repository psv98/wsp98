// Частота «Європейських ножиць» у клубі користувача.
import { simulateMatch } from '../src/simulation/engine';
import { mkTeam } from './mk';
let att = 0, g = 0, kg = 0; const n = 80;
for (let i = 0; i < n; i++) {
  const r = simulateMatch({ home: mkTeam('a', 75, true, { 9: 'katarina-mathernova' }), away: mkTeam('b', 75), seed: 900 + i });
  att += r.events.filter((e) => e.type === 'scissors').length; g += r.goals.filter((x) => x.scissors).length;
  kg += r.players.find((p) => p.special === 'katarina-mathernova')!.goals;
}
console.log({ attemptsPerMatch: (att / n).toFixed(2), scissorsGoalsPerMatch: (g / n).toFixed(2), conversion: (g / Math.max(1, att)).toFixed(2), katarinaGoalsPerMatch: (kg / n).toFixed(2) });
