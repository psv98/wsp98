// Калібрування втоми: середній пробіг і витрата сил за повний матч.
import { MatchEngine } from '../src/simulation/engine';
import { mkTeam } from './mk';
let dist = 0, n = 0, drop = 0, gkDrop = 0, gk = 0;
for (let i = 0; i < 8; i++) {
  const m = new MatchEngine({ home: mkTeam('a', 75), away: mkTeam('b', 75), seed: 100 + i, autoVar: true });
  while (!m.finished) { if (m.phase === 'half') m.startSecondHalf(); m.step(); }
  for (const p of m.players) if (p.played && p.timeOn > 170) { if (p.nat === 'GK') { gkDrop += p.stamina0 - p.stamina; gk++; } else { dist += p.dist; drop += p.stamina0 - p.stamina; n++; } }
}
console.log({ avgDist: Math.round(dist / n), avgDrop: (drop / n).toFixed(1), gkDrop: (gkDrop / gk).toFixed(1) });
