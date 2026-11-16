// Турнірна таблиця завжди обчислюється з результатів — її неможливо «розсинхронізувати».
import type { MatchSummary, TableRow } from './types';

export function computeTable(clubIds: string[], results: MatchSummary[][]): TableRow[] {
  const rows: Record<string, TableRow> = {};
  for (const id of clubIds) rows[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] };
  for (const round of results) {
    for (const m of round) {
      const h = rows[m.home], a = rows[m.away];
      if (!h || !a) continue;
      const [hs, as] = m.score;
      h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
      else if (hs < as) { a.w++; h.l++; a.pts += 3; a.form.push('W'); h.form.push('L'); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
    }
  }
  const order = new Map(clubIds.map((id, i) => [id, i]));
  const list = Object.values(rows);
  for (const r of list) { r.gd = r.gf - r.ga; r.form = r.form.slice(-5); }
  // сортування: очки → різниця мʼячів → забиті голи → перемоги → початковий посів
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.w - x.w || order.get(x.id)! - order.get(y.id)!);
  return list;
}

export const positionOf = (table: TableRow[], id: string) => table.findIndex((r) => r.id === id) + 1;
