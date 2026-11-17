// Допоміжний скрипт: збереження посеред сезону для перевірки інтерфейсу.
// Запуск: npx vite-node scripts/mk-mid-save.ts <шлях.json> [турів]
import { writeFileSync } from 'node:fs';
import { exportSave } from '../src/storage/db';
import { ackPostMatch, claimCard } from '../src/systems/actions';
import { newGame, playRoundAuto } from '../src/systems/season';

let s = newGame('texty', 777);
const rounds = Number(process.argv[3] ?? 12);
for (let r = 0; r < rounds; r++) {
  s = playRoundAuto(s);
  if (s.pending?.card) s = claimCard(s, true);
  s = ackPostMatch(s);
}
writeFileSync(process.argv[2] ?? 'mid-save.json', exportSave(s));
console.log('тур', s.round, 'монети', s.coins, 'особливих', s.clubs.texty.megaTransfers.length);
