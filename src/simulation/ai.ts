// Футбольний ШІ: позиціювання за ролями, відкривання, пресинг і рішення гравця з мʼячем.
import { BALANCE as B } from '../data/balance';
import { FORMATIONS } from '../data/formations';
import type { MatchEngine } from './engine';
import { CY, L, W, clamp, dist } from './engine';
import type { SimPlayer } from './types';

const P = B.pitch;
const S = B.sim;
const ATT = new Set(['ST', 'W', 'AM']);

function nearestOpp(m: MatchEngine, team: 0 | 1, x: number, y: number): number {
  let best = 99;
  for (const q of m.teams[1 - team].players) {
    if (!q.on) continue;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < best) best = d;
  }
  return best;
}

/** Мінімальна відстань суперників до відрізка передачі. */
function laneClear(m: MatchEngine, team: 0 | 1, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let best = 9;
  for (const q of m.teams[1 - team].players) {
    if (!q.on) continue;
    const t = ((q.x - ax) * dx + (q.y - ay) * dy) / l2;
    if (t < 0.08 || t > 0.97) continue;
    const d = Math.hypot(ax + dx * t - q.x, ay + dy * t - q.y) - t * 1.2; // далі від пасуючого — більше часу на перехоплення
    if (d < best) best = d;
  }
  return best;
}

/** Оновлення індивідуальних забігань («пошук вільного простору»). */
export function updateRuns(m: MatchEngine) {
  for (const p of m.players) {
    if (!p.on || p.role === 'GK') continue;
    p.runT -= 20 * B.match.dt;
    if (p.runT > 0) continue;
    p.runT = 1.3 + m.rng() * 1.6;
    const att = ATT.has(p.role);
    const n = p.sp?.id === 'hanna' ? 7 : att ? 4 : 2;
    const rx = att ? 15 : p.role === 'FB' ? 10 : 7, ry = att ? 10 : 5;
    let best = -1e9, bx = 0, by = 0;
    const dir = m.teams[p.team].dir;
    for (let k = 0; k < n; k++) {
      const dx = (m.rng() * 1.15 - 0.15) * rx, dy = (m.rng() - 0.5) * 2 * ry;
      const x = p.x + dir * dx * 0.5, y = clamp(p.y + dy * 0.5, 3, W - 3);
      const sc = nearestOpp(m, p.team, x, y) * 1.2 + dx * 0.35 - Math.abs(y - CY) * (p.role === 'ST' ? 0.15 : 0);
      if (sc > best) { best = sc; bx = dx; by = dy; }
    }
    p.runDx = bx; p.runDy = by;
  }
}

function ballFuture(m: MatchEngine, t: number): [number, number] {
  const b = m.ball;
  const v = Math.hypot(b.vx, b.vy);
  if (v < 0.01) return [b.x, b.y];
  const fr = S.ballFriction * m.wx.friction;
  const ts = Math.min(t, v / fr);
  const s = v * ts - 0.5 * fr * ts * ts;
  return [b.x + (b.vx / v) * s, b.y + (b.vy / v) * s];
}

/** Точка, де гравець найшвидше перехопить вільний мʼяч, і потрібний час. */
function interceptTime(m: MatchEngine, p: SimPlayer): [number, number, number] {
  const sp = m.speed(p);
  for (let t = 0.1; t <= 3.2; t += 0.15) {
    const [x, y] = ballFuture(m, t);
    if (Math.hypot(x - p.x, y - p.y) <= sp * t + 0.6) return [t, x, y];
  }
  const [x, y] = ballFuture(m, 3.2);
  return [3.2 + Math.hypot(x - p.x, y - p.y) / sp, x, y];
}

export function updateTargets(m: MatchEngine) {
  const b = m.ball;
  const fl = b.flight;
  const dead = m.phase !== 'play';
  for (const team of m.teams) {
    const t = team.id;
    const dir = team.dir;
    const inPoss = m.poss === t;
    const ballAdv = clamp(m.adv(t, b.x), 0, L);
    const ballYo = dir > 0 ? b.y : W - b.y;
    const slots = FORMATIONS[team.formation];
    const opp = m.teams[1 - t];
    // умовна лінія офсайду: найглибший польовий захисник суперника
    let line = ballAdv;
    for (const q of opp.players) if (q.on && q.role !== 'GK') { const a = m.adv(t, q.x); if (a > line) line = a; }
    line = Math.min(line, L - 2);

    // хто біжить до мʼяча
    let chaser: SimPlayer | null = null, chaser2: SimPlayer | null = null;
    let cx = b.x, cy = b.y;
    if (!dead) {
      if (!b.owner) {
        if (fl?.kind === 'loft' && fl.land) {
          let bd = 1e9, bd2 = 1e9;
          for (const p of team.players) {
            if (!p.on || p.role === 'GK') continue;
            const d = dist(p.x, p.y, fl.land.x, fl.land.y) - (p.i === fl.target ? 6 : 0);
            if (d < bd) { bd2 = bd; chaser2 = chaser; bd = d; chaser = p; } else if (d < bd2) { bd2 = d; chaser2 = p; }
          }
          cx = fl.land.x; cy = fl.land.y;
          if (!fl.cross) chaser2 = null;
        } else {
          let bt = 1e9;
          for (const p of team.players) {
            if (!p.on || p.stun > 0) continue;
            if (fl && fl.by === p.i && fl.t < 0.45) continue;
            if (p.role === 'GK' && !(m.adv(t, b.x) < P.boxDepth + 4 && Math.abs(b.y - CY) < P.boxHalf + 2)) continue;
            const [tt, x, y] = interceptTime(m, p);
            const adj = tt - (fl && fl.target === p.i ? 0.35 : 0);
            if (adj < bt) { bt = adj; chaser = p; cx = x; cy = y; }
          }
          if (fl?.kind === 'shot' && fl.team !== t) chaser = null; // захисники не женуться за ударом — це справа воротаря
        }
      } else if (b.owner.team !== t) {
        const c = b.owner;
        let bd = 1e9, bd2 = 1e9;
        for (const p of team.players) {
          if (!p.on || p.role === 'GK' || p.stun > 0) continue;
          const d = dist(p.x, p.y, c.x, c.y) + (m.adv(t, p.x) > m.adv(t, c.x) ? 3 : 0);
          if (d < bd) { bd2 = bd; chaser2 = chaser; bd = d; chaser = p; } else if (d < bd2) { bd2 = d; chaser2 = p; }
        }
        cx = c.x + c.vx * 0.2; cy = c.y + c.vy * 0.2;
        const danger = c.fx?.finish != null || c.fx?.finishDanger != null;
        // другий пресингує лише біля власних воріт; проти зіркового форварда — на всій своїй половині
        const pressing = m.orderOf(t) === 'press';
        if (m.adv(t, c.x) > (pressing ? 95 : danger ? 60 : 42) || c.role === 'GK') chaser2 = null;
        if (c.role === 'GK' && m.inOwnBox(c)) chaser = null;
      }
    }

    // персональна опіка зіркового форварда суперника найближчим центральним захисником
    let star: SimPlayer | null = null, marker: SimPlayer | null = null;
    if (!inPoss && !dead) {
      for (const q of opp.players) if (q.on && q !== b.owner && (q.fx?.finish != null || q.fx?.finishDanger != null)) star = q;
      if (star) {
        let bd = 30;
        for (const p of team.players) {
          if (!p.on || (p.role !== 'CB' && p.role !== 'DM') || p === chaser || p === chaser2) continue;
          const d = dist(p.x, p.y, star.x, star.y);
          if (d < bd) { bd = d; marker = p; }
        }
      }
    }

    for (const p of team.players) {
      if (!p.on || p.force) continue;
      if (p === b.owner) continue;
      if (p === marker && star) {
        const gx0 = dir > 0 ? 0 : L;
        const dd = dist(star.x, star.y, gx0, CY) || 1;
        p.tx = star.x + ((gx0 - star.x) / dd) * 1.3; p.ty = star.y + ((CY - star.y) / dd) * 1.3; p.sprint = true;
        continue;
      }
      if (p === chaser || p === chaser2) {
        p.tx = cx; p.ty = cy; p.sprint = true;
        continue;
      }
      if (p.role === 'GK') { keeperTarget(m, p, dir); continue; }
      const sl = slots[p.slot];
      const ord = m.orderOf(t);
      let a = sl.x * L + (ballAdv - L / 2) * (inPoss ? 0.62 : 0.52) + (inPoss ? 7 : -5) + (ord ? (inPoss ? B.orders[ord].lineAtk : B.orders[ord].lineDef) : 0);
      let y = sl.y * W + (ballYo - W / 2) * 0.22;
      p.sprint = false;
      if (inPoss) {
        a += p.runDx; y += p.runDy;
        if (sl.role === 'CB') a = Math.min(a, 62);
        if (a > line - 0.4) a = line - 0.4;
        if (ballAdv > 40 && ATT.has(p.role)) p.sprint = true;
      } else {
        y = W / 2 + (y - W / 2) * 0.8;
        // опіка найближчого нападника у своїй зоні
        if (sl.role === 'CB' || sl.role === 'FB' || sl.role === 'DM' || sl.role === 'CM') {
          const fx0 = dir > 0 ? a : L - a, fy0 = dir > 0 ? y : W - y;
          let bo: SimPlayer | null = null, bd = sl.role === 'CM' ? 8 : 13;
          for (const q of opp.players) {
            if (!q.on || q.role === 'GK' || q === b.owner) continue;
            const d = dist(q.x, q.y, fx0, fy0);
            if (d < bd) { bd = d; bo = q; }
          }
          if (bo) {
            const oa = m.adv(t, bo.x) - 1.6, oy = dir > 0 ? bo.y : W - bo.y;
            a = a + (oa - a) * 0.55; y = y + (oy - y) * 0.55;
          }
        }
        if (ballAdv < 45) p.sprint = true;
      }
      a = clamp(a, sl.role === 'CB' ? 8 : 6, L - 3);
      y = clamp(y, 2.5, W - 2.5);
      p.tx = dir > 0 ? a : L - a;
      p.ty = dir > 0 ? y : W - y;
      if (Math.hypot(p.tx - p.x, p.ty - p.y) > 11) p.sprint = true;
    }
  }
}

function keeperTarget(m: MatchEngine, p: SimPlayer, dir: number) {
  const b = m.ball;
  const gx = dir > 0 ? 0 : L;
  const d = dist(b.x, b.y, gx, CY);
  const r = clamp(d * 0.11, 1.2, 7.5);
  const ux = (b.x - gx) / (d || 1), uy = (b.y - CY) / (d || 1);
  p.tx = gx + ux * r;
  p.ty = clamp(CY + uy * r * 1.25, CY - P.goalHalf - 1, CY + P.goalHalf + 1);
  p.sprint = d < 30 || Math.hypot(p.tx - p.x, p.ty - p.y) > 10;
}

/** Рішення гравця, що володіє мʼячем: удар, передача, навіс або дриблінг. */
export function carrierAct(m: MatchEngine, p: SimPlayer, dt: number) {
  const t = p.team;
  const dir = m.teams[t].dir;
  const gx = m.goalX(t);
  const a = m.adv(t, p.x);
  const dGoal = dist(p.x, p.y, gx, CY);
  p.sprint = true;
  p.decideT -= dt;

  if (p.role === 'GK' && m.inOwnBox(p)) {
    p.tx = p.x; p.ty = p.y;
    if (p.holdT > 0.9) gkDistribute(m, p);
    return;
  }

  let dOpp = 99, on: SimPlayer | null = null;
  for (const q of m.teams[1 - t].players) {
    if (!q.on) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < dOpp) { dOpp = d; on = q; }
  }

  if (p.decideT <= 0) {
    p.decideT = 0.2 + m.rng() * 0.14;
    const oppGk = m.keeper((1 - t) as 0 | 1);
    const gkAway = !oppGk || dist(oppGk.x, oppGk.y, gx, CY) > 22;
    const dy = Math.abs(p.y - CY);
    // зіркові форварди не бʼють здалеку — шукають вірну позицію
    const ord = m.orderOf(t);
    const range = (p.fx?.finish != null || p.fx?.finishDanger != null ? 19 : S.shootRange) * (p.fx?.power ?? 1) * (ord === 'attack' ? B.orders.attack.shootRange : ord === 'hold' ? B.orders.hold.shootRange : 1);
    if (gkAway && dGoal < S.emptyNetRange && a > L / 2 - 8) { m.shoot(p); return; }
    if (dGoal < range) {
      const cos = clamp(((L - a) / (dGoal || 1)) * 1.25, 0, 1);
      let q = clamp(1 - (dGoal - 9) / (range - 9), 0, 1) * cos;
      // захисники на лінії удару
      for (const o of m.teams[1 - t].players) {
        if (!o.on || o.role === 'GK') continue;
        const ox = o.x - p.x, oy = o.y - p.y;
        const tt = (ox * (gx - p.x) + oy * (CY - p.y)) / (dGoal * dGoal || 1);
        if (tt > 0.03 && tt < 0.5 && Math.hypot(p.x + (gx - p.x) * tt - o.x, p.y + (CY - p.y) * tt - o.y) < 1.2) q *= 0.7;
      }
      if (dy > 12 && L - a < 6) q *= 0.3;
      const eager = 1;
      if (q * eager > 0.7 || m.rng() < q * q * 0.5 * eager + (p.holdT > 3.2 ? 0.12 : 0)) { m.shoot(p); return; }
    }
    // навіс із флангу
    if (dy > 14 && a > L - 26 && p.holdT > 0.25) {
      const tg = boxTarget(m, p);
      if (tg && m.rng() < 0.55) {
        m.loft(p, tg.x + dir * 1.5, tg.y, tg.i, true);
        return;
      }
    }
    // передача
    let best: SimPlayer | null = null, bs = -1e9, bLoft = false;
    const pressed = dOpp < 2.6;
    for (const mt of m.teams[t].players) {
      if (!mt.on || mt === p || mt.stun > 0) continue;
      const d = dist(p.x, p.y, mt.x, mt.y);
      if (d < 5 || d > 50) continue;
      const ma = m.adv(t, mt.x);
      const gain = ma - a;
      const open = Math.min(nearestOpp(m, t, mt.x, mt.y), 9);
      const lane = laneClear(m, t, p.x, p.y, mt.x, mt.y);
      const loft = d > 30 || (lane < 1.4 && d > 17);
      let sc = gain * 0.5 + open * 1.0 + (loft ? 1 : Math.min(lane, 5) * 1.5) + m.rng() * 4;
      if (loft) sc -= 4.5;
      if (ma > L - 22 && Math.abs(mt.y - CY) < 15) sc += 6;
      if ((mt.fx?.finish != null || mt.fx?.finishDanger != null) && open < 3.2) sc -= 7; // зірку щільно опікають — пас ризикований
      if (gain < -3) sc -= 3 + (a > 60 ? 2 : 0);
      if (mt.role === 'GK') sc -= 12;
      if (!loft && lane < 1.1) sc -= 14;
      if (sc > bs) { bs = sc; best = mt; bLoft = loft; }
    }
    let ahead = 10;
    for (const o of m.teams[1 - t].players) {
      if (!o.on) continue;
      const fx = (o.x - p.x) * dir, fy = Math.abs(o.y - p.y);
      if (fx > 0 && fx < 10 && fy < 4.5) ahead = Math.min(ahead, fx);
    }
    let drib = 11 + ahead * 1.3 + (p.fx?.evade != null ? (1 - p.fx.evade) * 9 : 0) + (m.attr(p, 'dribble') - 72) * 0.1;
    if (pressed) drib -= 5;
    if ((p.role === 'CB' || p.role === 'FB' || p.role === 'DM') && a < 42) drib -= 3.5;
    if (p.holdT < 0.35) drib += 5;
    if (p.holdT > 4) drib -= 8;
    if (best && bs > drib) {
      if (bLoft) m.loft(p, best.x + best.vx * 0.8, best.y + best.vy * 0.8, best.i);
      else m.pass(p, best, pressed ? 1.3 : 1);
      return;
    }
    if (pressed && a < 22 && !best) { m.clear(p); return; }
  }

  // дриблінг: рух до воріт з ухилянням від найближчого суперника
  let tx = gx - dir * 6, ty = CY + clamp(p.y - CY, -15, 15) * (a > L - 22 ? 0.35 : 0.8);
  let ux = tx - p.x, uy = ty - p.y;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  if (on && dOpp < 6) {
    const ox = on.x - p.x, oy = on.y - p.y;
    if (ox * ux + oy * uy > 0) {
      // відхиляємося перпендикулярно від суперника
      const cross = ux * oy - uy * ox;
      const sd = cross > 0 ? -1 : 1;
      const k = ((6 - dOpp) / 6) * 1.2;
      const px = -uy, py = ux;
      ux += px * sd * k; uy += py * sd * k;
    }
  }
  const nl = Math.hypot(ux, uy) || 1;
  p.tx = clamp(p.x + (ux / nl) * 7, 1.5, L - 1.5);
  p.ty = clamp(p.y + (uy / nl) * 7, 1.5, W - 1.5);
}

/** Найкращий адресат навісу в штрафному майданчику. */
export function boxTarget(m: MatchEngine, p: SimPlayer, prefer?: SimPlayer | null): SimPlayer | null {
  if (prefer) return prefer;
  let best: SimPlayer | null = null, bs = -1;
  for (const mt of m.teams[p.team].players) {
    if (!mt.on || mt === p || mt.role === 'GK') continue;
    const a = m.adv(p.team, mt.x);
    if (a < L - 20 || Math.abs(mt.y - CY) > 14) continue;
    const sc = m.attr(mt, 'header') * (0.6 + m.rng() * 0.8) + nearestOpp(m, p.team, mt.x, mt.y) * 4;
    if (sc > bs) { bs = sc; best = mt; }
  }
  return best;
}

function gkDistribute(m: MatchEngine, p: SimPlayer) {
  const t = p.team;
  let best: SimPlayer | null = null, bs = -1e9;
  for (const mt of m.teams[t].players) {
    if (!mt.on || mt === p) continue;
    const d = dist(p.x, p.y, mt.x, mt.y);
    if (d < 8 || d > 38) continue;
    const sc = Math.min(nearestOpp(m, t, mt.x, mt.y), 12) * 1.5 + laneClear(m, t, p.x, p.y, mt.x, mt.y) * 2 - d * 0.1 + m.rng() * 3;
    if (sc > bs) { bs = sc; best = mt; }
  }
  if (best && bs > 14 && m.rng() < 0.75) { m.pass(p, best); return; }
  // довгий винос
  const dir = m.teams[t].dir;
  let tg: SimPlayer | null = null, bd = 1e9;
  const tx = p.x + dir * 48;
  for (const mt of m.teams[t].players) {
    if (!mt.on || mt === p) continue;
    const d = Math.abs(mt.x - tx) + Math.abs(mt.y - CY) * 0.3 + m.rng() * 10;
    if (d < bd) { bd = d; tg = mt; }
  }
  if (tg) m.loft(p, tg.x, tg.y, tg.i, false, 1.2); else m.clear(p);
}
