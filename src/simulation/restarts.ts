// Стандартні положення: розстановка і виконання (початковий удар, аут, кутовий, штрафний, пенальті, удар від воріт).
import { BALANCE as B } from '../data/balance';
import { FORMATIONS } from '../data/formations';
import type { MatchEngine } from './engine';
import { CY, L, W, clamp, dist } from './engine';
import type { Restart, SimPlayer } from './types';
import { boxTarget } from './ai';

const P = B.pitch;
const S = B.sim;

function pickTaker(m: MatchEngine, r: Restart): SimPlayer | null {
  const ps = m.onPitch(r.team);
  if (!ps.length) return null;
  const field = ps.filter((p) => p.role !== 'GK');
  const near = (arr: SimPlayer[]) => arr.slice().sort((a, b) => dist(a.x, a.y, r.x, r.y) - dist(b.x, b.y, r.x, r.y))[0] ?? null;
  switch (r.type) {
    case 'goalKick': return m.keeper(r.team) ?? near(ps);
    case 'penalty': return field.slice().sort((a, b) => m.attr(b, 'shoot') - m.attr(a, 'shoot'))[0] ?? near(ps);
    case 'kickoff': return field.slice().sort((a, b) => m.adv(r.team, b.x) - m.adv(r.team, a.x) + (b.role === 'ST' ? 50 : 0) - (a.role === 'ST' ? 50 : 0))[0] ?? near(ps);
    case 'corner': {
      const c = field.filter((p) => p.role === 'W' || p.role === 'FB' || p.role === 'AM' || p.role === 'CM');
      return (c.length ? c : field).slice().sort((a, b) => m.attr(b, 'pass') * (b.fx?.cross ? 1.2 : 1) - m.attr(a, 'pass') * (a.fx?.cross ? 1.2 : 1) + (dist(a.x, a.y, r.x, r.y) - dist(b.x, b.y, r.x, r.y)) * 0.15)[0] ?? near(ps);
    }
    case 'freeKick': {
      const a = m.adv(r.team, r.x);
      if (a < 30) return near(ps);
      if (a > L - 32) return field.slice().sort((x, y) => m.attr(y, 'shoot') + m.attr(y, 'pass') - m.attr(x, 'shoot') - m.attr(x, 'pass'))[0] ?? near(ps);
      return near(field.length ? field : ps);
    }
    default: return near(field.length ? field : ps);
  }
}

/** Примусові позиції гравців на час стандарту. Викликається періодично, поки триває підготовка. */
export function setupRestartPositions(m: MatchEngine, r: Restart) {
  if (!r.taker || !r.taker.on) r.taker = pickTaker(m, r);
  const tk = r.taker;
  const att = m.teams[r.team], def = m.teams[1 - r.team];
  if (tk) tk.force = { x: clamp(r.x - (r.type === 'penalty' || r.type === 'freeKick' ? att.dir * 1.2 : 0), 0.3, L - 0.3), y: r.y };

  if (r.type === 'kickoff') {
    for (const team of m.teams) {
      const slots = FORMATIONS[team.formation];
      for (const p of team.players) {
        if (!p.on || p === tk) continue;
        const sl = slots[p.slot];
        const a = Math.min(sl.x * L * 0.62 + 2, L / 2 - (team.id === r.team ? 0.8 : 9.5));
        const y = sl.y * W;
        p.force = { x: team.dir > 0 ? a : L - a, y: team.dir > 0 ? y : W - y };
      }
    }
    return;
  }

  if (r.type === 'corner') {
    const gx = m.goalX(r.team), dir = att.dir;
    // «Повітряний штурм Ісиченка»
    if (r.storm === undefined) {
      r.storm = null;
      const ihor = att.players.find((p) => p.on && p.sp?.id === 'ihor' && p.role === 'GK');
      if (ihor && att.stormArmed && !att.stormDone && m.rng() < 0.6) {
        att.stormDone = true;
        r.storm = ihor;
        m.stormHappened[r.team] = true;
        m.emit('storm', r.team, ihor);
      }
    }
    const spots: [number, number][] = [[7, -3], [9, 3.5], [11, 0], [6, 5.5], [12, -5], [15, 3], [19, -2]];
    const order = m.onPitch(r.team).filter((p) => p !== tk && p.role !== 'GK')
      .sort((a, b) => m.attr(b, 'header') + (b.role === 'CB' || b.role === 'ST' ? 6 : 0) - m.attr(a, 'header') - (a.role === 'CB' || a.role === 'ST' ? 6 : 0));
    let si = 0;
    if (r.storm) { r.storm.force = { x: gx - dir * 8, y: CY + (r.y < CY ? 2 : -2) }; }
    order.forEach((p, k) => {
      if (k < 6 && si < spots.length) { const s = spots[si++]; p.force = { x: gx - dir * s[0], y: CY + s[1] }; }
      else p.force = { x: gx - dir * (38 + (k - 6) * 6), y: CY + (k % 2 ? 9 : -9) };
    });
    const dps = m.onPitch((1 - r.team) as 0 | 1);
    let k = 0;
    for (const p of dps) {
      if (p.role === 'GK') { p.force = { x: gx - dir * 0.8, y: CY }; continue; }
      if (k < 7) { const s = spots[k]; p.force = { x: gx - dir * Math.max(2.5, s[0] - 1.6), y: CY + s[1] * 0.9 }; }
      else p.force = { x: gx - dir * (20 + (k - 7) * 8), y: CY + (k % 2 ? 6 : -6) };
      k++;
    }
    return;
  }

  if (r.type === 'penalty') {
    const gx = m.goalX(r.team), dir = att.dir;
    let k = 0;
    for (const team of m.teams) {
      for (const p of team.players) {
        if (!p.on || p === tk) continue;
        if (p.role === 'GK' && team !== att) { p.force = { x: gx - dir * 0.5, y: CY }; continue; }
        if (p.role === 'GK') continue;
        const ang = -1.1 + (k % 10) * 0.24;
        p.force = { x: gx - dir * (P.boxDepth + 2.5 + (k >= 10 ? 4 : 0) + Math.abs(Math.sin(ang)) * 2), y: CY + Math.sin(ang) * 17 };
        k++;
      }
    }
    return;
  }

  // аут, штрафний, удар від воріт: суперники тримають дистанцію
  const minD = r.type === 'freeKick' ? 9.15 : 5;
  for (const p of def.players) {
    if (!p.on || p.role === 'GK') continue;
    const d = dist(p.tx, p.ty, r.x, r.y);
    if (d < minD) {
      const ux = (p.tx - r.x) / (d || 1), uy = (p.ty - r.y) / (d || 1);
      const ox = d < 0.1 ? -att.dir : ux, oy = d < 0.1 ? 0 : uy;
      p.force = { x: clamp(r.x + ox * (minD + 0.3), 1, L - 1), y: clamp(r.y + oy * (minD + 0.3), 1, W - 1) };
    } else p.force = null;
  }
}

function shortOption(m: MatchEngine, tk: SimPlayer, maxD: number): SimPlayer | null {
  let best: SimPlayer | null = null, bs = -1e9;
  for (const mt of m.teams[tk.team].players) {
    if (!mt.on || mt === tk || mt.role === 'GK') continue;
    const d = dist(tk.x, tk.y, mt.x, mt.y);
    if (d < 3 || d > maxD) continue;
    let open = 9;
    for (const q of m.teams[1 - tk.team].players) if (q.on) open = Math.min(open, dist(q.x, q.y, mt.x, mt.y));
    const sc = open * 1.5 - Math.abs(d - 12) * 0.3 + (m.adv(tk.team, mt.x) - m.adv(tk.team, tk.x)) * 0.15 + m.rng() * 3;
    if (sc > bs) { bs = sc; best = mt; }
  }
  return best;
}

export function executeRestart(m: MatchEngine, r: Restart) {
  const tk = r.taker!;
  const b = m.ball;
  const t = r.team;
  const dir = m.teams[t].dir;
  b.x = r.x; b.y = r.y; b.z = 0; b.vx = b.vy = b.vz = 0;
  b.lastTouch = tk.i; b.lastTeam = t;
  b.owner = tk;
  tk.holdT = 0; tk.immune = 0.6;
  m.poss = t;
  const gx = m.goalX(t);
  switch (r.type) {
    case 'kickoff': {
      m.emit('kickoff', t);
      m.sfx = 'whistle';
      const mate = shortOption(m, tk, 22);
      if (mate) m.pass(tk, mate); 
      break;
    }
    case 'throwIn': {
      const mate = shortOption(m, tk, 20);
      if (mate) m.pass(tk, mate); else m.clear(tk);
      break;
    }
    case 'goalKick': {
      const mate = shortOption(m, tk, 30);
      if (mate && m.rng() < 0.6) m.pass(tk, mate);
      else {
        let tg: SimPlayer | null = null, bd = 1e9;
        for (const mt of m.teams[t].players) {
          if (!mt.on || mt === tk) continue;
          const d = Math.abs(m.adv(t, mt.x) - 52) + m.rng() * 12;
          if (d < bd) { bd = d; tg = mt; }
        }
        if (tg) m.loft(tk, tg.x, tg.y, tg.i, false, 1.2); else m.clear(tk);
      }
      break;
    }
    case 'corner': {
      let target: SimPlayer | null = null;
      const storm = r.storm && r.storm.on ? r.storm : null;
      if (storm && m.rng() < S.stormCrossToIhor) target = storm;
      const tg = boxTarget(m, tk, target);
      const fl = tg ? m.loft(tk, tg.x, tg.y, tg.i, true) : m.loft(tk, gx - dir * 9, CY, -1, true);
      if (storm) fl.storm = true;
      break;
    }
    case 'freeKick': {
      const a = m.adv(t, r.x);
      const dG = dist(r.x, r.y, gx, CY);
      if (dG < 27 && Math.abs(r.y - CY) < 20) { m.shoot(tk, { freeKick: true }); }
      else if (a > L - 48) {
        const tg = boxTarget(m, tk);
        if (tg) m.loft(tk, tg.x, tg.y, tg.i, true); else m.loft(tk, gx - dir * 10, CY, -1, true);
      } else {
        const mate = shortOption(m, tk, 26);
        if (mate) m.pass(tk, mate); else m.clear(tk);
      }
      break;
    }
    case 'penalty': {
      m.sfx = 'whistle';
      m.shoot(tk, { penalty: true });
      break;
    }
  }
}
