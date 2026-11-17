// Допоміжний скрипт для перевірки інтерфейсу: збереження посеред сезону (з утомленим складом) і після 34-го туру.
// Запуск: npx vite-node scripts/mk-test-saves.ts <тека>
import { writeFileSync } from 'node:fs';
import { exportSave } from '../src/storage/db';
import { ackPostMatch, claimCard } from '../src/systems/actions';
import { ROUNDS, newGame, playRoundAuto } from '../src/systems/season';

const dir = process.argv[2] ?? '.';
let s = newGame('texty', 2027);
for (let r = 0; r < ROUNDS; r++) {
  s = playRoundAuto(s);
  if (s.pending?.card) s = claimCard(s, true);
  s = ackPostMatch(s);
  if (r === 11) {
    const mid = JSON.parse(JSON.stringify(s));
    const xi = mid.clubs.texty.lineup as string[];
    mid.clubs.texty.players.forEach((p: { id: string; stamina: number; special?: string }, i: number) => { if (xi.includes(p.id) && !['oksana', 'ihor'].includes(p.special ?? '')) p.stamina = [72, 55, 38, 26, 14][i % 5]; });
    mid.coins = Math.max(mid.coins, 30000);
    writeFileSync(`${dir}/mid2.json`, exportSave(mid));
  }
}
s.coins = Math.max(s.coins, 150000);
writeFileSync(`${dir}/end2.json`, exportSave(s));
console.log('done', s.round, s.coins, s.clubs.texty.megaTransfers);
