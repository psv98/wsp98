// Допоміжний скрипт для перевірки екрана чемпіона: грає сезон автоматично й зберігає файл для імпорту.
// Запуск: npx vite-node scripts/mk-champion-save.ts <шлях.json>
import { writeFileSync } from 'node:fs';
import { exportSave } from '../src/storage/db';
import { ackPostMatch, claimCard } from '../src/systems/actions';
import { ROUNDS, newGame, playRoundAuto } from '../src/systems/season';

let s = newGame('suspilne', 20260101);
// сильний склад, щоб клуб гарантовано претендував на титул
for (const p of s.clubs.suspilne.players) p.q += 30;
for (let r = 0; r < ROUNDS; r++) {
  s = playRoundAuto(s);
  if (s.pending?.card) s = claimCard(s, true);
  if (r < ROUNDS - 1) s = ackPostMatch(s);
}
s = ackPostMatch(s);
const rec = s.history[0];
console.log('чемпіон:', rec.champion, 'місце користувача:', rec.userPos, 'очки:', rec.userPts);
writeFileSync(process.argv[2] ?? 'champion-save.json', exportSave(s));
