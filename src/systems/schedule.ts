// Календар: двоколовий турнір (кожен із кожним удома та на виїзді). Для 18 клубів — 34 тури по 9 матчів.
import { makeRng } from '../simulation/rng';
import type { Fixture } from './types';

export function generateSchedule(clubIds: string[], seed: number): Fixture[][] {
  const n = clubIds.length;
  if (n % 2 !== 0) throw new Error('Кількість клубів має бути парною');
  const rng = makeRng(seed);
  const ids = clubIds.slice();
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const rounds: Fixture[][] = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    const round: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      // чергування господарів, щоб домашні й виїзні матчі розподілялися рівномірно
      const flip = i === 0 ? r % 2 === 1 : (r + i) % 2 === 1;
      round.push(flip ? { home: b, away: a } : { home: a, away: b });
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  const second = rounds.map((round) => round.map((f) => ({ home: f.away, away: f.home })));
  return [...rounds, ...second];
}

/** Перевірка коректності календаря. Повертає список помилок (порожній — усе гаразд). */
export function validateSchedule(schedule: Fixture[][], clubIds: string[]): string[] {
  const errs: string[] = [];
  const n = clubIds.length;
  if (schedule.length !== 2 * (n - 1)) errs.push(`Турів: ${schedule.length}, очікувалося ${2 * (n - 1)}`);
  const pairs = new Map<string, number>();
  schedule.forEach((round, r) => {
    if (round.length !== n / 2) errs.push(`Тур ${r + 1}: матчів ${round.length}`);
    const seen = new Set<string>();
    for (const f of round) {
      if (f.home === f.away) errs.push(`Тур ${r + 1}: клуб грає сам із собою`);
      for (const c of [f.home, f.away]) { if (seen.has(c)) errs.push(`Тур ${r + 1}: ${c} грає двічі`); seen.add(c); }
      const k = `${f.home}>${f.away}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    if (seen.size !== n) errs.push(`Тур ${r + 1}: грають не всі клуби`);
  });
  for (const a of clubIds) for (const b of clubIds) if (a !== b && pairs.get(`${a}>${b}`) !== 1) errs.push(`Пара ${a} (вдома) — ${b}: ${pairs.get(`${a}>${b}`) ?? 0} матчів`);
  return errs;
}
