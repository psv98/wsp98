// Ядро матчу: детермінована 2D-симуляція. Не залежить від DOM — працює і в браузері, і в тестах.
// Рахунок змінюється ЛИШЕ тоді, коли мʼяч фізично перетинає лінію воріт.
import { BALANCE as B } from '../data/balance';
import { FORMATIONS, roleFit, type FormationId, type Role } from '../data/formations';
import { SPECIAL_BY_ID } from '../data/specials';
import { makeRng, type Rng } from './rng';
import { accelMul, attrMul, fatigueLevel, gkMul, injuryRiskMul, miscontrolChance, powerMul, reactionLag, sigmaMul as sigmaMul_, speedMul } from './fatigue';
import type {
  OrderKind, Weather,
  Ball, EventType, Flight, GoalInfo, MatchEvent, MatchResult, MatchSetup, Phase, PlayerInit, PlayerResult,
  Restart, RestartType, SimPlayer, TeamSetup, TeamStats,
} from './types';
import { carrierAct, updateRuns, updateTargets } from './ai';
import { executeRestart, setupRestartPositions } from './restarts';

const P = B.pitch;
const S = B.sim;
export const L = P.L;
export const W = P.W;
export const CY = W / 2;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

const SHOOT_OFF: Record<Role, number> = { GK: -30, CB: -10, FB: -8, DM: -6, CM: -2, AM: 3, W: 2, ST: 6 };
const PASS_OFF: Record<Role, number> = { GK: -8, CB: -4, FB: -1, DM: 2, CM: 4, AM: 5, W: 0, ST: -2 };
const DRIB_OFF: Record<Role, number> = { GK: -15, CB: -8, FB: -2, DM: -3, CM: 0, AM: 4, W: 5, ST: 2 };
const TACK_OFF: Record<Role, number> = { GK: -10, CB: 6, FB: 3, DM: 5, CM: 0, AM: -6, W: -8, ST: -10 };
const HEAD_OFF: Record<Role, number> = { GK: 0, CB: 6, FB: -2, DM: 1, CM: -2, AM: -3, W: -4, ST: 4 };
const DRAIN_ROLE: Record<Role, number> = { GK: 0.35, CB: 0.85, FB: 1.05, DM: 1, CM: 1.1, AM: 1.05, W: 1.1, ST: 0.95 };

export interface TeamRt {
  id: 0 | 1;
  setup: TeamSetup;
  dir: 1 | -1;
  formation: FormationId;
  players: SimPlayer[];
  subsLeft: number;
  subQueue: { out: string; in: string }[];
  bonus: { atk: number; def: number; pass: number; cross: number };
  varLeft: boolean;
  golden: number; goldenUsed: boolean; recentOnTarget: number[];
  stormArmed: boolean; stormDone: boolean;
  aiSubsDone: number;
  order: { kind: OrderKind; left: number } | null; // активна вказівка з бровки
  orderCd: number; // перезарядка вказівок (секунди)
  aiOrderDone: boolean;
}

function emptyStats(): TeamStats {
  return { goals: 0, shots: 0, onTarget: 0, possession: 0, corners: 0, fouls: 0, yellows: 0, reds: 0, saves: 0, subs: 0, injuries: 0, passes: 0, passesOk: 0 };
}

/** Розподіляє гравців за слотами схеми так, щоб максимізувати відповідність ролей. */
export function assignSlots(roles: Role[], formation: FormationId): number[] {
  const slots = FORMATIONS[formation];
  const res = new Array<number>(roles.length).fill(-1);
  const free = new Set(slots.map((_, i) => i));
  // спершу точні збіги, далі — найкращі з решти
  for (let pass = 0; pass < 2; pass++) {
    roles.forEach((r, i) => {
      if (res[i] >= 0) return;
      let best = -1, bf = -1;
      for (const s of free) {
        const f = roleFit(r, slots[s].role);
        if (pass === 0 ? f === 1 && best < 0 : f > bf) { best = s; bf = f; }
      }
      if (best >= 0 && (pass === 1 || bf === 1 || roleFit(r, slots[best].role) === 1)) { res[i] = best; free.delete(best); }
    });
  }
  return res;
}

export class MatchEngine {
  rng: Rng;
  setup: MatchSetup;
  teams: [TeamRt, TeamRt];
  players: SimPlayer[] = [];
  ball: Ball;
  phase: Phase = 'pre';
  half: 1 | 2 = 1;
  clock = 0; // секунди від початку тайму
  time = 0; // загальний час симуляції
  stoppage: number;
  extra = 0;
  score: [number, number] = [0, 0];
  stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
  events: MatchEvent[] = [];
  goals: GoalInfo[] = [];
  abilities: Record<string, number> = {};
  poss: 0 | 1 = 0;
  restart: Restart | null = null;
  waitT = 0;
  waitFn: (() => void) | null = null;
  pendingVar: { kind: 'goal' | 'penalty' | 'red'; team: 0 | 1; timer: number; apply: (overturned: boolean) => void } | null = null;
  lastPass: { from: number; to: number; team: 0 | 1; t: number } | null = null;
  lastTackleT = -99;
  ref = { x: L / 2, y: CY - 6 };
  tick = 0;
  lastAttack = false;
  finished = false;
  stormHappened: [boolean, boolean] = [false, false];
  kickoffTeam: 0 | 1 = 0;
  autoVar: boolean;
  weather: Weather;
  /** Параметри погоди для поточного матчу */
  wx: { friction: number; passSigma: number; miscontrol: number; drain: number; speed: number };
  shotInfoLast: { t: number; team: 0 | 1 } | null = null;

  constructor(setup: MatchSetup) {
    this.setup = setup;
    this.rng = makeRng(setup.seed);
    this.autoVar = !!setup.autoVar;
    this.weather = setup.weather ?? 'clear';
    this.wx = B.weather[this.weather];
    this.stoppage = S ? B.match.stoppageMin + this.rng() * (B.match.stoppageMax - B.match.stoppageMin) : 0;
    this.teams = [this.mkTeam(0, setup.home), this.mkTeam(1, setup.away)];
    this.ball = { x: L / 2, y: CY, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: -1, lastTeam: 0, flight: null, spin: 0 };
    this.recalcBonuses();
    this.kickoff(0);
    this.snapToPositions();
  }

  // ---------- ініціалізація ----------
  private mkTeam(id: 0 | 1, ts: TeamSetup): TeamRt {
    const team: TeamRt = {
      id, setup: ts, dir: id === 0 ? 1 : -1, formation: ts.formation, players: [], subsLeft: B.match.maxSubs, subQueue: [],
      bonus: { atk: 0, def: 0, pass: 0, cross: 1 }, varLeft: false, golden: 0, goldenUsed: false, recentOnTarget: [],
      stormArmed: !!ts.stormArmed, stormDone: false, aiSubsDone: 0, order: null, orderCd: 0, aiOrderDone: false,
    };
    const slots = FORMATIONS[ts.formation];
    ts.starters.slice(0, 11).forEach((pi, s) => team.players.push(this.mkPlayer(team, pi, s < slots.length ? s : -1)));
    ts.bench.forEach((pi) => team.players.push(this.mkPlayer(team, pi, -1)));
    return team;
  }

  private mkPlayer(team: TeamRt, pi: PlayerInit, slot: number): SimPlayer {
    const sp = pi.special ? SPECIAL_BY_ID[pi.special] ?? null : null;
    const fx = sp ? (team.setup.isUser ? sp.user : sp.opp) : null;
    const role = slot >= 0 ? FORMATIONS[team.formation][slot].role : pi.role;
    const p: SimPlayer = {
      i: this.players.length, team: team.id, pid: pi.pid, num: pi.num, nat: pi.role, slot, role, sp, fx,
      name: sp ? sp.name : `Гравець №${pi.num}`,
      q: Math.min(99, (fx ? fx.q : pi.q) + (pi.qBonus ?? 0)) + (team.id === 0 ? team.setup.homeBonus : 0),
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, sprint: false, hx: team.dir, hy: 0, force: null,
      // хто не втомлюється (Оксана, Ігор) — завжди 100%
      stamina0: sp && sp.fatigue === 0 ? 100 : pi.stamina, stamina: sp && sp.fatigue === 0 ? 100 : pi.stamina,
      drain: S.staminaDrainStart * (sp ? sp.fatigue : 1), timeOn: 0, dist: 0, sprintDist: 0, extraUsed: 0, boost: pi.boost ?? {},
      on: slot >= 0, off: null, played: slot >= 0,
      stun: 0, tackleCd: 0, decideT: 0, holdT: 0, immune: 0, yellow: 0, red: 0, injury: 0,
      pts: 0, goals: 0, assists: 0, shots: 0, saves: 0, tackles: 0,
      runDx: 0, runDy: 0, runT: 0, dive: null, diveAnim: 0, flip: 0,
    };
    this.players.push(p);
    return p;
  }

  /** Командні бонуси від особливих гравців на полі (з обмеженням сумування). */
  recalcBonuses() {
    for (const t of this.teams) {
      let atk = 0, def = 0, pass = 0, trio = 0, duo = 0, cross = 1;
      for (const p of t.players) {
        if (!p.on || !p.fx) continue;
        if (p.sp?.bundle === 'trio') trio++;
        if (p.sp?.bundle === 'duo') duo++;
        atk += p.fx.teamAtk ?? 0; def += p.fx.teamDef ?? 0; pass += p.fx.teamPass ?? 0;
        if (p.fx.teamCross) cross = Math.min(cross, p.fx.teamCross);
      }
      // бонус супертріо повний лише коли всі троє на полі
      if (trio === 3) { pass += 2; def += 1; atk += 1; }
      const cap = S.teamBonusCap;
      t.bonus = { atk: Math.min(cap, atk), def: Math.min(cap, def), pass: Math.min(cap, pass), cross };
      if (duo === 0) t.varLeft = false; else if (this.time === 0) t.varLeft = true;
    }
  }

  // ---------- геометрія ----------
  adv(team: 0 | 1, x: number) { return this.teams[team].dir > 0 ? x : L - x; }
  goalX(team: 0 | 1) { return this.teams[team].dir > 0 ? L : 0; } // ворота, які атакує команда
  keeper(team: 0 | 1): SimPlayer | null {
    for (const p of this.teams[team].players) if (p.on && p.role === 'GK') return p;
    return null;
  }
  onPitch(team: 0 | 1) { return this.teams[team].players.filter((p) => p.on); }
  inOwnBox(p: SimPlayer, x = p.x, y = p.y) { return this.adv(p.team, x) < P.boxDepth && Math.abs(y - CY) < P.boxHalf; }

  // ---------- характеристики ----------
  /** Множник характеристик від втоми (1 — свіжий). */
  fatigueMul(p: SimPlayer) { return attrMul(p.stamina); }
  private base(p: SimPlayer) {
    const slotRole = p.role;
    const fit = roleFit(p.nat, slotRole);
    const t = this.teams[p.team];
    return (70 + (p.q - 70) * S.qEffect) * fit + (t.golden > 0 ? S.goldenMinuteBoost : 0);
  }
  attr(p: SimPlayer, k: 'shoot' | 'pass' | 'dribble' | 'tackle' | 'header' | 'gk'): number {
    const t = this.teams[p.team];
    let v = this.base(p);
    switch (k) {
      case 'shoot': v += SHOOT_OFF[p.role] + t.bonus.atk; break;
      case 'pass': v += PASS_OFF[p.role] + t.bonus.pass; break;
      case 'dribble': v += DRIB_OFF[p.role] + t.bonus.atk * 0.5; break;
      case 'tackle': v += TACK_OFF[p.role] + t.bonus.def; break;
      case 'header': v += HEAD_OFF[p.role] + (p.fx?.header ?? 0); break;
      case 'gk': v += p.nat === 'GK' ? 0 : -8; v += t.bonus.def * 0.5; break;
    }
    v += p.boost[k] ?? 0;
    return Math.max(20, v * (k === 'gk' ? gkMul(p.stamina) : attrMul(p.stamina)));
  }
  speed(p: SimPlayer) {
    return (S.baseSpeed + (p.q - 70) * S.speedPerQ * S.qEffect + S.roleSpeed[p.role]) * (p.fx?.speed ?? 1) * (1 + (p.boost.speed ?? 0) * 0.012) * speedMul(p.stamina) * this.wx.speed * (this.teams[p.team].golden > 0 ? 1.04 : 1);
  }

  // ---------- події ----------
  minute() {
    const m = Math.floor((Math.min(this.clock, B.match.halfSeconds) / B.match.halfSeconds) * 45);
    return (this.half === 1 ? 0 : 45) + Math.min(45, m + 1);
  }
  minLabel() {
    const over = this.clock - B.match.halfSeconds;
    const base = this.half === 1 ? 45 : 90;
    if (over > 0) return `${base}+${Math.max(1, Math.ceil((over / B.match.halfSeconds) * 45))}`;
    return String(this.minute());
  }
  emit(type: EventType, team: 0 | 1 | -1, p?: SimPlayer | null, extra?: Partial<MatchEvent>) {
    this.events.push({ type, min: this.minute(), minLabel: this.minLabel(), team, pid: p?.pid, name: p?.name, special: p?.sp?.id, ...extra });
  }
  ability(name: string) { this.abilities[name] = (this.abilities[name] ?? 0) + 1; }

  wait(t: number, fn: () => void) { this.phase = 'wait'; this.waitT = t; this.waitFn = fn; }

  // ---------- рестарти ----------
  kickoff(team: 0 | 1) {
    this.kickoffTeam = team;
    this.setRestart('kickoff', team, L / 2, CY, 1.4, false);
  }

  setRestart(type: RestartType, team: 0 | 1, x: number, y: number, wait: number, clockRuns: boolean) {
    const b = this.ball;
    b.owner = null; b.flight = null; b.x = x; b.y = y; b.z = 0; b.vx = b.vy = b.vz = 0;
    this.poss = team;
    this.lastPass = null;
    this.phase = 'dead';
    for (const p of this.players) { p.dive = null; p.force = null; }
    this.restart = { type, team, x, y, taker: null, wait, over: 0, clockRuns };
    this.flushSubs();
    setupRestartPositions(this, this.restart);
  }

  /** Миттєво розставляє гравців на стартові позиції (початок тайму). */
  private snapToPositions() {
    for (const p of this.players) {
      if (!p.on || !p.force) continue;
      p.x = p.force.x; p.y = p.force.y; p.vx = p.vy = 0; p.hx = this.teams[p.team].dir; p.hy = 0;
    }
  }

  // ---------- вказівки з бровки ----------
  orderOf(team: 0 | 1): OrderKind | null { return this.teams[team].order?.kind ?? null; }

  /** Вказівка тренера: діє B.orders.duration секунд, потім перезарядка. */
  giveOrder(team: 0 | 1, kind: OrderKind): boolean {
    const t = this.teams[team];
    if (t.order || t.orderCd > 0 || this.finished) return false;
    t.order = { kind, left: B.orders.duration };
    this.emit('order', team, null, { text: kind });
    return true;
  }

  private tickOrders(dt: number) {
    for (const t of this.teams) {
      if (t.order) { t.order.left -= dt; if (t.order.left <= 0) { t.order = null; t.orderCd = B.orders.cooldown; } }
      else if (t.orderCd > 0) t.orderCd -= dt;
      // суперник (ШІ) теж користується вказівками наприкінці матчу
      if (!t.setup.isUser && !t.aiOrderDone && this.half === 2 && this.clock > 50 && !t.order && t.orderCd <= 0) {
        const diff = this.score[t.id] - this.score[1 - t.id];
        if (diff < 0) { t.aiOrderDone = true; this.giveOrder(t.id, 'attack'); }
        else if (diff > 0 && this.clock > 65) { t.aiOrderDone = true; this.giveOrder(t.id, 'hold'); }
      }
    }
  }

  // ---------- заміни ----------
  /** Запит на заміну від менеджера. Виконується під час найближчої зупинки гри. */
  queueSub(team: 0 | 1, outPid: string, inPid: string): boolean {
    const t = this.teams[team];
    if (t.subsLeft - t.subQueue.length <= 0) return false;
    const out = t.players.find((p) => p.pid === outPid && p.on);
    const inn = t.players.find((p) => p.pid === inPid && !p.on && !p.off && !p.played);
    if (!out || !inn || t.subQueue.some((s) => s.out === outPid || s.in === inPid)) return false;
    t.subQueue.push({ out: outPid, in: inPid });
    if (this.phase === 'dead' || this.phase === 'half' || this.phase === 'pre') this.flushSubs();
    return true;
  }

  flushSubs() {
    for (const t of this.teams) {
      for (const s of t.subQueue) {
        const out = t.players.find((p) => p.pid === s.out && p.on);
        const inn = t.players.find((p) => p.pid === s.in && !p.on && !p.off);
        if (out && inn && t.subsLeft > 0) this.doSub(t, out, inn);
      }
      t.subQueue = [];
      if (!t.setup.isUser) this.aiSubs(t);
    }
  }

  private doSub(t: TeamRt, out: SimPlayer, inn: SimPlayer, reason: 'sub' | 'inj' = 'sub') {
    inn.slot = out.slot; inn.role = out.role; inn.on = true; inn.played = true;
    inn.drain = S.staminaDrainStart * DRAIN_ROLE[inn.role] * (inn.sp ? inn.sp.fatigue : 1);
    inn.x = L / 2; inn.y = t.id === 0 ? 0.5 : W - 0.5; inn.vx = inn.vy = 0;
    out.on = false; out.off = reason; out.slot = -1;
    if (this.ball.owner === out) this.ball.owner = null;
    t.subsLeft--;
    this.stats[t.id].subs++;
    this.emit('sub', t.id, out, { name2: inn.name });
    this.recalcBonuses();
  }

  benchFor(t: TeamRt, role: Role): SimPlayer | null {
    let best: SimPlayer | null = null, bs = -1;
    for (const p of t.players) {
      if (p.on || p.off || p.played) continue;
      const s = p.q * roleFit(p.nat, role) * (0.7 + 0.3 * p.stamina / 100);
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  private aiSubs(t: TeamRt) {
    const total = (this.half - 1) * B.match.halfSeconds + this.clock;
    if (total < S.aiSubFrom || t.aiSubsDone >= 3 || t.subsLeft <= 0) return;
    const tired = t.players.filter((p) => p.on && p.role !== 'GK' && !p.sp && p.stamina < 48).sort((a, b) => a.stamina - b.stamina);
    for (const out of tired) {
      if (t.aiSubsDone >= 3 || t.subsLeft <= 0) break;
      const inn = this.benchFor(t, out.role);
      if (!inn || inn.stamina < 65 || roleFit(inn.nat, out.role) < 0.9) continue;
      this.doSub(t, out, inn);
      t.aiSubsDone++;
    }
  }

  /** Зміна тактичної схеми під час матчу. */
  setFormation(team: 0 | 1, f: FormationId) {
    const t = this.teams[team];
    t.formation = f;
    const on = t.players.filter((p) => p.on);
    const slots = assignSlots(on.map((p) => p.nat), f);
    on.forEach((p, i) => { p.slot = slots[i]; p.role = FORMATIONS[f][p.slot].role; });
  }

  /** Тактична перестановка після вилучення: закриваємо оборонні позиції за рахунок атаки. */
  private reshape(t: TeamRt, vacSlot: number) {
    const slots = FORMATIONS[t.formation];
    const vr = slots[vacSlot].role;
    if (vr === 'ST' || vr === 'AM' || vr === 'W') return;
    const order: Role[] = vr === 'GK' ? ['ST', 'AM', 'W', 'CM', 'DM', 'FB', 'CB'] : ['ST', 'AM', 'W', 'CM'];
    const stCount = t.players.filter((p) => p.on && p.role === 'ST').length;
    for (const r of order) {
      if (r === 'ST' && stCount < 2 && vr !== 'GK' && t.players.some((p) => p.on && (p.role === 'AM' || p.role === 'W'))) continue;
      const cands = t.players.filter((p) => p.on && p.role === r);
      if (!cands.length) continue;
      const donor = cands.sort((a, b) => a.q - b.q)[0];
      if (vr === 'GK' && t.subsLeft > 0) {
        const gk = t.players.find((p) => !p.on && !p.off && !p.played && p.nat === 'GK');
        if (gk) { const ds = donor.slot; this.doSub(t, donor, gk); gk.slot = vacSlot; gk.role = 'GK'; void ds; return; }
      }
      donor.slot = vacSlot; donor.role = vr;
      return;
    }
  }

  // ---------- володіння ----------
  control(p: SimPlayer) {
    const b = this.ball;
    const fl = b.flight;
    if (fl && (fl.kind === 'pass' || fl.kind === 'loft') && fl.team === p.team && fl.by !== p.i) {
      this.stats[p.team].passesOk++;
      this.players[fl.by].pts += 0.03;
      this.lastPass = { from: fl.by, to: p.i, team: p.team, t: this.time };
    } else if (!fl || fl.team !== p.team) {
      this.lastPass = null;
    }
    b.owner = p; b.flight = null; b.z = 0; b.vz = 0; b.vx = p.vx; b.vy = p.vy;
    b.lastTouch = p.i; b.lastTeam = p.team;
    this.poss = p.team;
    p.holdT = 0; p.decideT = 0.12 + this.rng() * 0.2 + reactionLag(p.stamina); p.immune = 0.4;
    p.dive = null;
  }

  private release(p: SimPlayer, kind: Flight['kind'], target: number): Flight {
    const b = this.ball;
    b.owner = null;
    b.lastTouch = p.i; b.lastTeam = p.team;
    const fl: Flight = { kind, by: p.i, team: p.team, target, tried: new Set(), t: 0 };
    b.flight = fl;
    return fl;
  }

  // ---------- передачі ----------
  pass(p: SimPlayer, mate: SimPlayer, sigmaMul = 1) {
    const b = this.ball;
    const d0 = dist(p.x, p.y, mate.x, mate.y);
    const tEst = d0 / 16;
    let tx = mate.x + mate.vx * tEst * 0.85, ty = mate.y + mate.vy * tEst * 0.85;
    tx = clamp(tx, 1.5, L - 1.5); ty = clamp(ty, 1.5, W - 1.5);
    const d = dist(p.x, p.y, tx, ty);
    const sigma = S.passSigma * clamp((100 - this.attr(p, 'pass')) / 40, 0.15, 1.6) * (p.fx?.pass ?? 1) * sigmaMul * sigmaMul_(p.stamina) * this.wx.passSigma;
    const ang = Math.atan2(ty - p.y, tx - p.x) + this.gauss() * sigma;
    const v0 = clamp(Math.sqrt(81 + 2 * S.ballFriction * this.wx.friction * d), 9, 30);
    const fl = this.release(p, 'pass', mate.i);
    void fl;
    b.x = p.x + Math.cos(ang) * 0.9; b.y = p.y + Math.sin(ang) * 0.9; b.z = 0; b.vz = 0;
    b.vx = Math.cos(ang) * v0; b.vy = Math.sin(ang) * v0;
    p.hx = Math.cos(ang); p.hy = Math.sin(ang);
    this.stats[p.team].passes++;
    this.sfx = 'kick';
  }

  /** Верхова передача / навіс у точку. */
  loft(p: SimPlayer, tx: number, ty: number, target: number, cross = false, scatterMul = 1) {
    const b = this.ball;
    const sc = S.loftScatter * clamp((100 - this.attr(p, 'pass')) / 30, 0.3, 1.6) * (cross ? (p.fx?.cross ?? 1) * this.teams[p.team].bonus.cross : p.fx?.pass ?? 1) * scatterMul * sigmaMul_(p.stamina);
    tx = clamp(tx + this.gauss() * sc, 1, L - 1); ty = clamp(ty + this.gauss() * sc, 1, W - 1);
    const d = Math.max(4, dist(p.x, p.y, tx, ty));
    const T = clamp(d / S.loftSpeed, 0.7, 2.4);
    const fl = this.release(p, 'loft', target);
    fl.land = { x: tx, y: ty }; fl.cross = cross;
    b.x = p.x; b.y = p.y; b.z = 0.2;
    b.vx = (tx - p.x) / T; b.vy = (ty - p.y) / T; b.vz = (S.gravity * T) / 2;
    this.stats[p.team].passes++;
    this.sfx = 'kick';
    return fl;
  }

  clear(p: SimPlayer) {
    const dir = this.teams[p.team].dir;
    const tx = p.x + dir * (20 + this.rng() * 14);
    const ty = clamp(p.y + (this.rng() - 0.5) * 30, 4, W - 4);
    this.loft(p, clamp(tx, 4, L - 4), ty, -1, false, 1.4);
    this.stats[p.team].passes--;
  }

  // ---------- удари ----------
  gauss() {
    let u = 0;
    for (let i = 0; i < 4; i++) u += this.rng();
    return (u - 2) * 1.732;
  }

  /** Імовірність гола для удару, що йде у площину воріт. Тут діють правила суперздібностей. */
  goalProb(p: SimPlayer, keeper: SimPlayer | null, d: number, cy: number, header: boolean, penalty: boolean, acrobatic = false): { pGoal: number; via?: string; kvia?: string } {
    if (!keeper) return { pGoal: 1 };
    const central = 1 - Math.abs(cy - CY) / P.goalHalf;
    let pSave = S.saveBase + (this.attr(keeper, 'gk') - 70) * S.saveGk + (d - 10) * S.saveDist + central * S.saveCentral
      - (this.attr(p, 'shoot') - 70) * S.saveShoot + (header ? S.headerSaveBonus : 0);
    if (penalty) pSave = S.penaltySave + (this.attr(keeper, 'gk') - 70) * 0.004;
    pSave = clamp(pSave, S.saveMin, S.saveMax);
    const ks = keeper.role === 'GK' && keeper.nat === 'GK' ? keeper.fx?.save : undefined;
    let kvia: string | undefined;
    if (ks != null) {
      pSave = penalty ? Math.min(ks, S.penaltySaveSpecialCap) : ks;
      pSave *= gkMul(keeper.stamina); // втомлений Буффон слабшає; Ігор не втомлюється
      kvia = keeper.sp!.ability;
    }
    let pGoal = 1 - pSave;
    let via: string | undefined;
    const f = p.fx;
    if (f?.finish != null && f.finish >= 1) {
      // «Невідворотний гол» (Оксана в клубі користувача): будь-який удар у площину — гол, навіть Ігорю
      pGoal = 1; via = p.sp!.ability;
    } else if (ks != null && !penalty) {
      // особливий воротар: пробити його можуть лише особливі нападники зі здібністю eliteFinish
      if (f?.eliteFinish != null && (f.finish != null || d < 22) && f.eliteFinish > pGoal) { pGoal = f.eliteFinish; via = p.sp!.ability; }
    } else if (f?.finish != null) {
      pGoal = f.finish; via = p.sp!.ability;
    } else if (f?.finishDanger != null && d < 22 && !penalty) {
      if (f.finishDanger > pGoal) { pGoal = f.finishDanger; via = p.sp!.ability; }
    }
    // «Європейські ножиці»: несподіваний удар через себе — звичайному воротарю складніше (особливий воротар діє за своїми правилами)
    if (acrobatic && ks == null && f?.scissors && f.scissors.goal > pGoal) { pGoal = f.scissors.goal; via = p.sp!.ability; }
    return { pGoal, via, kvia };
  }

  shoot(p: SimPlayer, o: { header?: boolean; penalty?: boolean; forced?: 'goal' | 'nogoal'; freeKick?: boolean; scissors?: boolean } = {}) {
    const b = this.ball;
    const t = p.team;
    const gx = this.goalX(t);
    const keeper = this.keeper((1 - t) as 0 | 1);
    const d = dist(p.x, p.y, gx, CY);
    let pressure = 0;
    for (const q of this.teams[1 - t].players) if (q.on && q.role !== 'GK' && dist(q.x, q.y, p.x, p.y) < 2) pressure += S.shotPressure;
    let side = this.rng() < 0.5 ? -1 : 1;
    if (keeper && Math.abs(keeper.y - CY) > 0.6) side = keeper.y > CY ? -1 : 1;
    const aimY = CY + side * P.goalHalf * (0.3 + 0.55 * this.rng());
    let sigma = S.shotSigmaBase + clamp((100 - this.attr(p, 'shoot')) / 100, 0, 0.8) * S.shotSigmaSkill + d * S.shotSigmaDist + pressure;
    if (o.header) sigma *= 1.5;
    sigma *= sigmaMul_(p.stamina);
    if (o.penalty) sigma = 0.02 * sigmaMul_(p.stamina);
    const dx = gx - p.x;
    const sdx = Math.abs(dx) < 1 ? (dx < 0 ? -1 : 1) : dx;
    let ang = Math.atan2(aimY - p.y, sdx) + this.gauss() * sigma;
    let over = this.rng() < S.overBarBase + d * S.overBarDist + (o.header ? 0.12 : 0);
    if (o.penalty) over = this.rng() > S.penaltyOnTarget;
    if (o.forced === 'goal') { ang = Math.atan2(aimY - p.y, sdx); over = false; }
    if (o.scissors && p.fx?.scissors) {
      // удар через себе: або точно у площину воріт, або вище воріт; утома знижує точність
      const hit = this.rng() < p.fx.scissors.onTarget * (1 - 0.5 * fatigueLevel(p.stamina));
      ang = Math.atan2(aimY - p.y, sdx); over = !hit;
    }
    let cy = p.y + Math.tan(ang) * sdx;
    if (o.forced === 'nogoal' && Math.abs(cy - CY) < P.goalHalf && !over && this.rng() < 0.5) over = true;
    const inside = Math.abs(cy - CY) < P.goalHalf - 0.12;
    const post = !inside && Math.abs(cy - CY) < P.goalHalf + 0.16 && !over;
    const onTarget = inside && !over;
    const power = (p.fx?.power ?? 1) * (o.header && !o.scissors ? 0.6 : 1) * (o.scissors ? 1.08 : 1) * (0.92 + 0.16 * this.rng()) * powerMul(p.stamina);
    const speed = S.shotSpeed * power;
    let willSave = false;
    let via: string | undefined;
    const keeperHome = keeper && dist(keeper.x, keeper.y, gx, CY) < 20;
    if (onTarget && keeper && keeperHome) {
      const g = this.goalProb(p, keeper, d, cy, !!o.header && !o.scissors, !!o.penalty, !!o.scissors);
      let pGoal = g.pGoal;
      if (o.forced === 'goal') pGoal = 1;
      if (o.forced === 'nogoal') pGoal = 0;
      willSave = this.rng() >= pGoal;
      via = willSave ? g.kvia : g.via;
    }
    const fl = this.release(p, 'shot', -1);
    const flightD = Math.hypot(sdx, cy - p.y);
    const T = flightD / speed;
    fl.shot = { shooter: p.i, onTarget, willSave, cy, header: !!o.header && !o.scissors, scissors: !!o.scissors, penalty: !!o.penalty, keeper: keeper ? keeper.i : -1, post, resolved: false, dist: d, viaAbility: via };
    b.x = p.x + Math.cos(ang) * 0.8; b.y = p.y + Math.sin(ang) * 0.8;
    b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed;
    if (over) { b.z = o.header ? 2 : 0.3; b.vz = (3.4 - b.z + 0.5 * S.gravity * T * T) / T; }
    else { b.z = o.header ? 1.8 : 0.2; b.vz = o.header ? 0 : Math.min(3, 0.3 * S.gravity * T); }
    p.hx = Math.cos(ang); p.hy = Math.sin(ang);
    p.shots++;
    this.stats[t].shots++;
    if (onTarget) { this.stats[t].onTarget++; this.noteOnTarget(t); }
    if (keeper && keeperHome) {
      // воротар кидається на перетин траєкторії
      const kx = gx - this.teams[t].dir * 1.1;
      const frac = (kx - b.x) / (b.vx || 1e-6);
      keeper.dive = { x: kx, y: clamp(b.y + b.vy * frac, CY - P.goalHalf - 1.5, CY + P.goalHalf + 1.5), t: Math.max(0.05, frac), reach: willSave };
      if (!willSave && onTarget) keeper.dive.y += (keeper.dive.y > keeper.y ? -1 : 1) * (1.4 + this.rng());
    }
    this.shotInfoLast = { t: this.time, team: t };
    this.sfx = 'shot';
  }

  sfx: string | null = null; // останній миттєвий звук для аудіосистеми

  private noteOnTarget(t: 0 | 1) {
    const tm = this.teams[t];
    const now = (this.half - 1) * B.match.halfSeconds + this.clock;
    tm.recentOnTarget.push(now);
    tm.recentOnTarget = tm.recentOnTarget.filter((x) => now - x < 22);
    // «Золота хвилина»: команда, що не веде в рахунку, створила серію небезпечних ударів
    if (!tm.goldenUsed && tm.recentOnTarget.length >= 2 && this.score[t] <= this.score[1 - t]) {
      tm.goldenUsed = true; tm.golden = S.goldenMinuteDuration;
      this.emit('golden', t);
    }
  }

  // ---------- відбори, фоли ----------
  private tryTackle(d: SimPlayer, c: SimPlayer) {
    d.tackleCd = S.tackleCooldown * (0.85 + 0.3 * this.rng()) * (this.orderOf(d.team) === 'press' ? B.orders.press.tackleCd : 1) + reactionLag(d.stamina) * 2;
    this.lastTackleT = this.time;
    const disc = this.teams[d.team].setup.discipline;
    let pf = S.foulChance * (1.5 - disc / 100) * (d.stamina < 45 ? 1.25 : 1) * (this.orderOf(d.team) === 'press' ? B.orders.press.foul : 1);
    const inBox = this.inOwnBox(d, c.x, c.y);
    if (inBox) pf *= S.penaltyFoulFactor;
    if (this.rng() < pf) { this.foul(d, c, inBox); return; }
    let ps = clamp(S.tackleBase * Math.pow(this.attr(d, 'tackle') / this.attr(c, 'dribble'), 1.6), S.tackleMin, S.tackleMax);
    let via: string | null = null;
    if (d.fx?.tackle != null) { ps = d.fx.tackle; via = d.sp!.ability; }
    if (c.fx?.evade != null) ps *= c.fx.evade;
    this.duelInjury(d, c);
    if (!c.on || !d.on) return;
    if (this.rng() < ps) {
      c.stun = S.tackledStun;
      d.tackles++; d.pts += 0.3;
      if (via) this.ability(via);
      const da = this.adv(d.team, d.x);
      if (da < 24 && this.rng() < S.tackleOutChance) {
        // вибиває мʼяч за межі поля (кутовий або аут)
        const b = this.ball;
        const dir = this.teams[d.team].dir;
        b.owner = null; b.lastTouch = d.i; b.lastTeam = d.team;
        b.flight = { kind: 'loose', by: d.i, team: d.team, target: -1, tried: new Set(), t: 0 };
        const toGoalLine = da < 13 && Math.abs(d.y - CY) > P.goalHalf + 3;
        const sy = d.y < CY ? -1 : 1;
        b.x = d.x; b.y = d.y;
        if (toGoalLine) { b.vx = -dir * 16; b.vy = sy * 5; } else { b.vx = -dir * 3; b.vy = sy * 19; }
        b.z = 0.6; b.vz = 3.5;
        this.poss = d.team;
      } else this.control(d);
    } else {
      d.stun = S.beatenStun;
      c.pts += 0.08;
      if (c.fx?.evade != null && c.sp) this.ability(c.sp.ability);
    }
  }

  private duelInjury(a: SimPlayer, b: SimPlayer) {
    for (const p of [a, b]) {
      if (p.sp?.noInjury) continue;
      const pr = S.injuryOnDuel * injuryRiskMul(p.stamina);
      if (this.rng() < pr) this.injure(p, true);
    }
  }

  private foul(d: SimPlayer, c: SimPlayer, inBox: boolean) {
    this.stats[d.team].fouls++;
    d.pts -= 0.2;
    this.emit('foul', d.team, d);
    this.sfx = 'whistle';
    const fx = c.x, fy = c.y;
    const victimTeam = c.team;
    let card: 'yellow' | 'red' | null = null;
    const r = this.rng();
    const yc = S.yellowChance * (inBox ? 1.4 : 1);
    if (r < S.redChance) card = 'red'; else if (r < S.redChance + yc) card = 'yellow';
    if (!c.sp?.noInjury && this.rng() < S.injuryOnFoul * injuryRiskMul(c.stamina)) this.injure(c, false);
    this.ball.owner = null; this.ball.flight = null; this.ball.vx = this.ball.vy = 0;
    const proceed = () => {
      if (inBox) {
        this.emit('penalty', victimTeam);
        this.reviewable('penalty', d.team, (ov) => {
          if (ov) this.setRestart('freeKick', d.team, clamp(fx, 3, L - 3), fy, 1.2, false);
          else this.setRestart('penalty', victimTeam, this.goalX(victimTeam) - this.teams[victimTeam].dir * P.penSpot, CY, 2.2, false);
        });
      } else {
        this.setRestart('freeKick', victimTeam, clamp(fx, 2, L - 2), clamp(fy, 2, W - 2), 1.5, false);
      }
    };
    const give = (kind: 'yellow' | 'red') => {
      if (kind === 'yellow') {
        d.yellow++; d.pts -= 0.5; this.stats[d.team].yellows++;
        if (d.yellow >= 2) { this.emit('secondYellow', d.team, d); this.sendOff(d, 1); }
        else this.emit('yellow', d.team, d);
      } else {
        this.emit('red', d.team, d); this.sendOff(d, 2);
      }
      this.sfx = 'card';
    };
    if (card === 'red') {
      this.wait(1.2, () => this.reviewable('red', d.team, (ov) => { give(ov ? 'yellow' : 'red'); this.wait(1.4, proceed); }));
    } else if (card === 'yellow') {
      this.wait(1.0, () => { give('yellow'); this.wait(1.2, proceed); });
    } else {
      this.wait(0.7, proceed);
    }
  }

  private sendOff(p: SimPlayer, kind: 1 | 2) {
    const t = this.teams[p.team];
    const slot = p.slot;
    p.red = kind; p.on = false; p.off = 'red'; p.slot = -1; p.pts -= 2;
    this.stats[p.team].reds++;
    if (this.ball.owner === p) this.ball.owner = null;
    if (slot >= 0) this.reshape(t, slot);
    this.recalcBonuses();
  }

  injure(p: SimPlayer, stopPlay: boolean) {
    if (!p.on || p.injury > 0 || p.sp?.noInjury) return;
    if (this.stats[p.team].injuries >= B.fatigue.maxInjuriesPerTeam) return; // захист від серії травм
    const t = this.teams[p.team];
    const u = this.rng();
    p.injury = B.injuries.minMatches + Math.floor(u * u * (B.injuries.maxMatches - B.injuries.minMatches + 1));
    this.stats[p.team].injuries++;
    this.emit('injury', p.team, p, { n: p.injury });
    const slot = p.slot, role = p.role;
    const hadBall = this.ball.owner === p;
    const inn = t.subsLeft > 0 ? this.benchFor(t, role) : null;
    if (inn) { this.doSub(t, p, inn, 'inj'); }
    else { p.on = false; p.off = 'inj'; p.slot = -1; if (slot >= 0) this.reshape(t, slot); this.recalcBonuses(); }
    p.off = 'inj';
    if (stopPlay && this.phase === 'play') {
      const bx = clamp(this.ball.x, 3, L - 3), by = clamp(this.ball.y, 3, W - 3);
      const team = hadBall ? p.team : this.poss;
      this.ball.owner = null; this.ball.flight = null;
      this.sfx = 'whistle';
      this.wait(2.2, () => this.setRestart('freeKick', team, bx, by, 1.0, false));
    }
  }

  // ---------- VAR ----------
  /** Спірний епізод проти команди `team`: якщо на полі є Юридичне мегадуо і VAR ще не використано — можливий перегляд. */
  private reviewable(kind: 'goal' | 'penalty' | 'red', team: 0 | 1, apply: (overturned: boolean) => void) {
    const t = this.teams[team];
    const hasDuo = t.players.some((p) => p.on && p.sp?.bundle === 'duo');
    if (!t.varLeft || !hasDuo) { apply(false); return; }
    if (t.setup.isUser && !this.autoVar) {
      this.pendingVar = { kind, team, timer: 7, apply };
      this.phase = 'var';
      this.emit('varOffer', team, null, { text: kind });
      return;
    }
    const use = t.setup.isUser || this.rng() < S.aiVarUse;
    this.runVar(use, kind, team, apply);
  }

  /** Відповідь менеджера на пропозицію VAR. */
  answerVar(use: boolean) {
    const pv = this.pendingVar;
    if (!pv) return;
    this.pendingVar = null;
    this.runVar(use, pv.kind, pv.team, pv.apply);
  }

  private runVar(use: boolean, kind: 'goal' | 'penalty' | 'red', team: 0 | 1, apply: (ov: boolean) => void) {
    if (!use) { this.phase = 'dead'; apply(false); return; }
    const t = this.teams[team];
    t.varLeft = false;
    this.ability('Юридичний VAR');
    this.emit('var', team, null, { text: kind });
    const overturned = this.rng() < S.varOverturn[kind];
    this.wait(2.6, () => {
      this.emit(overturned ? 'varOverturn' : 'varStands', team, null, { text: kind });
      this.sfx = 'whistle';
      apply(overturned);
    });
  }

  // ---------- гол ----------
  private ballInGoal(defTeam: 0 | 1) {
    const b = this.ball;
    const scTeam = (1 - defTeam) as 0 | 1;
    const fl = b.flight;
    const last = b.lastTouch >= 0 ? this.players[b.lastTouch] : null;
    const own = !!last && last.team === defTeam && !(fl?.kind === 'shot' && fl.team === scTeam);
    let scorer: SimPlayer | null = fl?.kind === 'shot' ? this.players[fl.shot!.shooter] : last;
    if (scorer && scorer.team !== scTeam && !own) scorer = null;
    const shot = fl?.kind === 'shot' ? fl.shot! : null;
    const lp = this.lastPass;
    const assist = !own && scorer && lp && lp.team === scTeam && lp.to === scorer.i && this.time - lp.t < 9 ? this.players[lp.from] : null;
    b.vx *= 0.15; b.vy *= 0.15; b.flight = null; b.owner = null;
    this.sfx = 'net';
    const contested = this.time - this.lastTackleT < 5 || this.rng() < S.varGoalContested * 0.5;
    const confirm = (overturned: boolean) => {
      if (overturned) {
        const gx = defTeam === 0 ? (this.teams[0].dir > 0 ? 8 : L - 8) : (this.teams[1].dir > 0 ? 8 : L - 8);
        this.setRestart('freeKick', defTeam, gx, CY, 1.2, false);
        return;
      }
      this.score[scTeam]++;
      this.stats[scTeam].goals++;
      const g: GoalInfo = {
        team: scTeam, min: this.minute(), minLabel: this.minLabel(), pid: scorer?.pid ?? '', name: own ? `${last!.name} (автогол)` : scorer?.name ?? 'Гравець',
        special: own ? undefined : scorer?.sp?.id, assist: assist?.name, own, pen: shot?.penalty, header: shot?.header, scissors: shot?.scissors,
      };
      this.goals.push(g);
      if (!own && scorer) { scorer.goals++; scorer.pts += 3; }
      if (assist) { assist.assists++; assist.pts += 1.6; }
      const k = this.keeper(defTeam); if (k) k.pts -= 0.4;
      if (shot?.viaAbility) this.ability(shot.viaAbility);
      this.emit(own ? 'ownGoal' : 'goal', scTeam, own ? last : scorer, { name2: assist?.name, text: shot?.scissors ? 'scissors' : shot?.penalty ? 'pen' : shot?.header ? 'head' : undefined });
      this.sfx = 'goal';
      this.wait(3.0, () => this.kickoff(defTeam));
    };
    if (contested) this.reviewable('goal', defTeam, confirm);
    else confirm(false);
  }

  // ---------- вихід мʼяча ----------
  private outOfPlay(px: number, py: number) {
    const b = this.ball;
    const fl = b.flight;
    if (fl?.kind === 'shot' && !fl.shot!.resolved) {
      fl.shot!.resolved = true;
      this.emit('miss', fl.team, this.players[fl.shot!.shooter]);
    }
    const lt = b.lastTeam;
    if (b.y < 0 || b.y > W) {
      const team = (1 - lt) as 0 | 1;
      this.setRestart('throwIn', team, clamp(px, 1, L - 1), b.y < 0 ? 0.4 : W - 0.4, 0.9, true);
      return;
    }
    const left = b.x < 0;
    // хто захищає ці ворота
    const defTeam: 0 | 1 = (this.teams[0].dir > 0) === left ? 0 : 1;
    if (lt === defTeam) {
      const att = (1 - defTeam) as 0 | 1;
      this.stats[att].corners++;
      this.emit('corner', att);
      this.setRestart('corner', att, left ? 0.5 : L - 0.5, py < CY ? 0.5 : W - 0.5, 2.0, false);
    } else {
      this.setRestart('goalKick', defTeam, left ? P.sixDepth : L - P.sixDepth, CY + (py < CY ? -6 : 6), 1.1, true);
    }
  }

  // ---------- головний цикл ----------
  startSecondHalf() {
    if (this.phase !== 'half') return;
    this.half = 2; this.clock = 0; this.extra = 0; this.lastAttack = false;
    this.stoppage = B.match.stoppageMin + this.rng() * (B.match.stoppageMax - B.match.stoppageMin);
    this.teams[0].dir = -1; this.teams[1].dir = 1;
    this.emit('secondHalf', -1);
    this.kickoff(1);
    this.snapToPositions();
  }

  private endHalf() {
    const b = this.ball;
    b.owner = null; b.flight = null; b.vx = b.vy = b.vz = 0;
    this.sfx = 'whistleLong';
    if (this.half === 1) { this.phase = 'half'; this.emit('halftime', -1); }
    else { this.phase = 'full'; this.finished = true; this.emit('fulltime', -1); }
  }

  private checkClock() {
    const end = B.match.halfSeconds + this.stoppage + this.extra;
    if (this.clock < end) return;
    const b = this.ball;
    if (b.flight?.kind === 'shot' || (b.flight?.kind === 'loft' && b.flight.cross)) return; // даємо завершити епізод
    if (this.half === 2 && this.extra < B.match.lastAttackMaxExtra) {
      // «Остання атака»: команда, якій потрібен гол, володіє мʼячем на чужій половині
      const t = this.poss;
      const diff = this.score[t] - this.score[1 - t];
      if ((diff === 0 || diff === -1) && b.owner && this.adv(t, b.x) > 60) {
        if (!this.lastAttack) { this.lastAttack = true; this.emit('lastAttack', t); }
        this.extra += B.match.dt;
        return;
      }
    }
    this.endHalf();
  }

  step(dt: number = B.match.dt) {
    if (this.finished || this.phase === 'half' || this.phase === 'full') return;
    this.time += dt;
    this.tick++;
    if (this.phase === 'pre') this.phase = 'dead';
    if (this.phase === 'var') {
      const pv = this.pendingVar!;
      pv.timer -= dt;
      this.movePlayers(dt);
      if (pv.timer <= 0) this.answerVar(true);
      return;
    }
    if (this.phase === 'wait') {
      this.waitT -= dt;
      if (this.tick % 3 === 0) updateTargets(this);
      this.movePlayers(dt);
      this.moveBallFree(dt, false);
      if (this.waitT <= 0) { const fn = this.waitFn; this.waitFn = null; this.phase = 'dead'; if (fn) fn(); else if (!this.restart) this.phase = 'play'; }
      return;
    }
    if (this.phase === 'dead') {
      const r = this.restart;
      if (!r) { this.phase = 'play'; return; }
      if (r.clockRuns) { this.clock += dt; }
      r.wait -= dt;
      if (this.tick % 3 === 0) { updateTargets(this); setupRestartPositions(this, r); }
      this.movePlayers(dt);
      if (r.wait <= 0) {
        const tk = r.taker;
        if (!tk) { this.restart = null; this.phase = 'play'; return; }
        r.over += dt;
        let stormWaiting = false;
        if (r.storm) {
          const f = r.storm.force;
          const arrived = !!f && dist(r.storm.x, r.storm.y, f.x, f.y) < 2.5;
          if (!arrived) {
            if (r.over > 9 || !r.storm.on) { this.emit('stormFail', r.team, r.storm); r.storm = null; }
            else stormWaiting = true;
          }
        }
        const near = dist(tk.x, tk.y, r.x, r.y) < 1.5;
        if (!stormWaiting && (near || r.over > 2.5)) {
          if (!near) { tk.x = r.x; tk.y = r.y; }
          this.restart = null;
          for (const p of this.players) p.force = null;
          this.phase = 'play';
          executeRestart(this, r);
        }
      }
      return;
    }
    // --- гра ---
    this.clock += dt;
    this.tickOrders(dt);
    this.stats[this.poss].possession += dt;
    for (const t of this.teams) if (t.golden > 0) t.golden -= dt;
    if (this.tick % 3 === 0) updateTargets(this);
    if (this.tick % 20 === 0) { updateRuns(this); this.updateStamina(); }
    const b = this.ball;
    if (b.owner) {
      const c = b.owner;
      c.holdT += dt;
      carrierAct(this, c, dt);
    }
    this.movePlayers(dt);
    if (b.owner) {
      const c = b.owner;
      b.x = c.x + c.hx * 0.75; b.y = c.y + c.hy * 0.75; b.z = 0;
      b.vx = c.vx; b.vy = c.vy;
      b.lastTouch = c.i; b.lastTeam = c.team;
      // відбори
      const gkHold = c.role === 'GK' && this.inOwnBox(c);
      if (!gkHold && c.immune <= 0) {
        for (const d of this.teams[1 - c.team].players) {
          if (!d.on || d.stun > 0 || d.tackleCd > 0 || d.role === 'GK') continue;
          if (dist(d.x, d.y, c.x, c.y) < S.tackleRange) {
            this.tryTackle(d, c);
            if (this.phase !== 'play' || this.ball.owner !== c) break;
          }
        }
      }
      if (this.phase === 'play' && (b.x < 0 || b.x > L || b.y < 0 || b.y > W)) {
        // гравець вивів мʼяч за межі
        this.ball.owner = null;
        this.outOfPlay(clamp(b.x, 0, L), clamp(b.y, 0, W));
      }
    } else {
      this.moveBallFree(dt, true);
    }
    if (this.phase === 'play') this.checkClock();
    // арбітр
    const rx = clamp(b.x - 7, 6, L - 6), ry = clamp(b.y + (b.y > CY ? -8 : 8), 5, W - 5);
    this.ref.x += (rx - this.ref.x) * Math.min(1, dt * 1.6);
    this.ref.y += (ry - this.ref.y) * Math.min(1, dt * 1.6);
  }

  /** Витрата сил: частина — за час на полі, частина — за пробіг і ривки. Плюс ризик травми у спринті при сильній втомі. */
  private updateStamina() {
    const total = 2 * B.match.halfSeconds;
    const FT = B.fatigue;
    for (const p of this.players) {
      if (!p.on) continue;
      p.timeOn += B.match.dt * 20;
      const run = (p.dist + (FT.sprintDrainMul - 1) * p.sprintDist) / FT.expectedDist;
      const used = p.drain * (FT.drainTimeShare * DRAIN_ROLE[p.role] * (p.timeOn / total) + FT.drainDistShare * run);
      // вказівки з бровки та погода змінюють темп витрати сил
      const ord = this.orderOf(p.team);
      const mul = (ord ? B.orders[ord].drain : 1) * this.wx.drain - 1;
      if (mul !== 0) p.extraUsed = Math.max(0, p.extraUsed + p.drain * FT.drainTimeShare * DRAIN_ROLE[p.role] * ((B.match.dt * 20) / total) * mul * 2.2);
      p.stamina = Math.max(0, p.stamina0 - used - p.extraUsed);
      if (p.sprint && p.stamina < FT.lowThreshold && !p.sp?.noInjury && this.phase === 'play' && Math.hypot(p.vx, p.vy) > 5 &&
        this.rng() < FT.sprintInjury * injuryRiskMul(p.stamina)) this.injure(p, true);
    }
  }

  private movePlayers(dt: number) {
    const ps = this.players;
    for (const p of ps) {
      if (!p.on) continue;
      if (p.tackleCd > 0) p.tackleCd -= dt;
      if (p.immune > 0) p.immune -= dt;
      if (p.diveAnim > 0) p.diveAnim -= dt;
      if (p.flip > 0) p.flip -= dt;
      if (p.stun > 0) { p.stun -= dt; p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx * dt; p.y += p.vy * dt; continue; }
      if (p.dive) {
        const dv = p.dive;
        dv.t -= dt;
        const dd = dist(p.x, p.y, dv.x, dv.y);
        const sp = dv.reach ? Math.min(30, dd / Math.max(dt, dv.t)) : Math.min(8.5, dd / Math.max(dt, dv.t));
        if (dd > 0.05) { p.vx = ((dv.x - p.x) / dd) * sp; p.vy = ((dv.y - p.y) / dd) * sp; p.x += p.vx * dt; p.y += p.vy * dt; }
        p.diveAnim = 0.5;
        if (dv.t < -0.5) p.dive = null;
        continue;
      }
      const f = p.force;
      const tx = f ? f.x : p.tx, ty = f ? f.y : p.ty;
      let dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      let max = this.speed(p) * (p.sprint || f ? 1 : S.jogFactor);
      if (this.ball.owner === p) max *= S.carrySpeed * (p.fx?.evade != null ? 1.04 : 1);
      if (f && this.restart?.storm === p) max *= 1.7;
      let dvx = 0, dvy = 0;
      if (d > 0.15) {
        const sp = d < 1.5 ? max * (d / 1.5) : max;
        dvx = (dx / d) * sp; dvy = (dy / d) * sp;
      }
      const ax = dvx - p.vx, ay = dvy - p.vy;
      const al = Math.hypot(ax, ay), am = S.accel * accelMul(p.stamina) * dt;
      if (al > am) { p.vx += (ax / al) * am; p.vy += (ay / al) * am; } else { p.vx = dvx; p.vy = dvy; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const v = Math.hypot(p.vx, p.vy);
      p.dist += v * dt;
      if (v > max * 0.85 && (p.sprint || f)) p.sprintDist += v * dt;
      if (v > 1.2) { p.hx += (p.vx / v - p.hx) * 0.25; p.hy += (p.vy / v - p.hy) * 0.25; }
      p.x = clamp(p.x, -2, L + 2); p.y = clamp(p.y, -2, W + 2);
    }
    // мʼяке розштовхування
    if (this.tick % 2 === 0) {
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i]; if (!a.on) continue;
        for (let j = i + 1; j < ps.length; j++) {
          const c = ps[j]; if (!c.on) continue;
          const dx = c.x - a.x, dy = c.y - a.y;
          if (dx > 1 || dx < -1 || dy > 1 || dy < -1) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.81 && d2 > 1e-4) {
            const d = Math.sqrt(d2), push = (0.9 - d) * 0.5;
            const ux = dx / d, uy = dy / d;
            if (!a.dive && this.ball.owner !== a) { a.x -= ux * push; a.y -= uy * push; }
            if (!c.dive && this.ball.owner !== c) { c.x += ux * push; c.y += uy * push; }
          }
        }
      }
    }
  }

  private moveBallFree(dt: number, live: boolean) {
    const b = this.ball;
    if (b.owner) return;
    const px = b.x, py = b.y;
    const fl = b.flight;
    if (fl) fl.t += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.z > 0 || b.vz > 0) {
      b.vz -= S.gravity * dt; b.z += b.vz * dt;
      if (b.z <= 0) {
        b.z = 0; b.vz = 0;
        if (fl && fl.kind === 'loft') { fl.kind = 'loose'; b.vx *= 0.5; b.vy *= 0.5; }
      }
    }
    if (b.z <= 0.05) {
      const v = Math.hypot(b.vx, b.vy);
      if (v > 0) {
        const fr = (fl?.kind === 'shot' ? S.shotFriction : S.ballFriction) * this.wx.friction * dt;
        const nv = Math.max(0, v - fr);
        b.vx *= nv / v; b.vy *= nv / v;
      }
    }
    b.spin += Math.hypot(b.vx, b.vy) * dt;
    if (!live) { b.x = clamp(b.x, -1.5, L + 1.5); b.y = clamp(b.y, -1, W + 1); return; }

    // верхова боротьба
    if (fl && fl.kind === 'loft' && !fl.aerialDone && b.vz < 0 && b.z < 2.2) { fl.aerialDone = true; this.aerial(fl); if (this.ball.owner || this.ball.flight !== fl || this.phase !== 'play') return; }

    // лінія воріт / межі поля
    if (b.x < 0 || b.x > L) {
      const gxl = b.x < 0 ? 0 : L;
      const f = (gxl - px) / (b.x - px || 1e-6);
      const yc = py + (b.y - py) * f;
      const sh = fl?.kind === 'shot' ? fl.shot! : null;
      if (sh && sh.post && !sh.resolved) {
        sh.resolved = true;
        b.x = gxl + (gxl === 0 ? 0.3 : -0.3); b.vx = -b.vx * 0.45; b.vy = (this.rng() - 0.5) * 10; fl!.kind = 'loose'; fl!.shot = undefined;
        this.emit('post', fl!.team, this.players[sh.shooter]);
        this.sfx = 'post';
        return;
      }
      if (Math.abs(yc - CY) < P.goalHalf && b.z < 2.44) {
        const defTeam: 0 | 1 = (this.teams[0].dir > 0) === (gxl === 0) ? 0 : 1;
        // сейв, якщо воротар мав дістати мʼяч, але контакт не був зафіксований
        if (sh && sh.willSave && !sh.resolved) { this.resolveSave(this.players[sh.keeper], fl!); return; }
        if (sh) sh.resolved = true;
        this.ballInGoal(defTeam);
        return;
      }
      this.outOfPlay(clamp(px, 0, L), clamp(yc, 0, W));
      return;
    }
    if (b.y < 0 || b.y > W) { this.outOfPlay(px, py); return; }
    if (b.z > 1.6) return;

    // контакт із гравцями
    let best: SimPlayer | null = null, bd = 99;
    for (const p of this.players) {
      if (!p.on || p.stun > 0) continue;
      const r = p.role === 'GK' ? S.gkControlRadius : S.controlRadius;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx > r || dx < -r || dy > r || dy < -r) continue;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      if (fl) {
        if (fl.by === p.i && fl.t < 0.45) continue;
        if (fl.kind === 'shot') {
          const sh = fl.shot!;
          if (p.team === fl.team) continue;
          if (p.i === sh.keeper) { if (sh.willSave && !sh.resolved) { this.resolveSave(p, fl); return; } continue; }
          if (p.role === 'GK' || fl.tried.has(p.i) || sh.penalty) continue;
          fl.tried.add(p.i);
          if (dist(p.x, p.y, this.players[sh.shooter].x, this.players[sh.shooter].y) > S.blockRange) continue;
          let pb = S.blockBase * (this.attr(p, 'tackle') / 75);
          let via: string | null = null;
          if (p.fx?.block != null) { pb = p.fx.block; via = p.sp!.ability; }
          pb = (pb + (p.boost.block ?? 0) * 0.012) * attrMul(p.stamina);
          const shooter = this.players[sh.shooter];
          if (shooter.fx?.finish != null && shooter.fx.finish >= 1) pb *= 0.6;
          if (this.rng() < pb) {
            sh.resolved = true;
            if (via) this.ability(via);
            p.pts += 0.4;
            this.emit('block', p.team, p);
            // частина блоків зрізається за лінію воріт — так виникають кутові
            const behind = this.rng() < 0.45;
            const a = behind ? Math.atan2((b.y < CY ? -1 : 1) * (6 + this.rng() * 8), b.vx > 0 ? 6 : -6) : Math.atan2(b.vy, b.vx) + Math.PI + (this.rng() - 0.5) * 2.4;
            const v = behind ? 14 + this.rng() * 5 : 6 + this.rng() * 7;
            b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.z = 0; b.vz = 0;
            b.lastTouch = p.i; b.lastTeam = p.team;
            fl.kind = 'loose'; fl.shot = undefined; fl.by = p.i; fl.t = 0; fl.team = p.team;
            this.sfx = 'kick';
            return;
          }
          continue;
        }
        if (fl.kind === 'pass' && p.team !== fl.team) {
          if (fl.tried.has(p.i)) continue;
          fl.tried.add(p.i);
          const v = Math.hypot(b.vx, b.vy);
          const pi = S.interceptBase * (this.attr(p, 'tackle') / 75) * (p.fx?.intercept ?? 1) * (1 + (p.boost.intercept ?? 0) * 0.025) * (1 - clamp((v - 10) / 32, 0, 0.6)) * (p.role === 'GK' ? 1.4 : 1);
          if (this.rng() >= pi) continue;
          if (p.fx?.intercept && p.sp) this.ability(p.sp.ability);
          p.pts += 0.25;
        }
      }
      if (d < bd) { bd = d; best = p; }
    }
    if (best && fl && (fl.kind === 'pass' || fl.kind === 'loft' || fl.kind === 'loose') && best.role !== 'GK' && this.rng() < miscontrolChance(best.stamina) + this.wx.miscontrol) {
      // втомлений гравець погано приймає мʼяч — той відскакує
      const a = Math.atan2(b.vy, b.vx) + (this.rng() - 0.5) * 2.2;
      const v = 3 + this.rng() * 5;
      b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.z = 0; b.vz = 0;
      b.lastTouch = best.i; b.lastTeam = best.team;
      fl.kind = 'loose'; fl.by = best.i; fl.team = best.team; fl.t = 0; fl.shot = undefined;
      return;
    }
    if (best) this.control(best);
  }

  private resolveSave(k: SimPlayer, fl: Flight) {
    const b = this.ball;
    const sh = fl.shot!;
    sh.resolved = true;
    k.saves++; k.pts += 0.6;
    this.stats[k.team].saves++;
    k.x = clamp(b.x, 0.4, L - 0.4); k.y = b.y; k.dive = null; k.diveAnim = 0.7;
    if (sh.viaAbility) this.ability(sh.viaAbility);
    this.emit('save', k.team, k, { name2: this.players[sh.shooter].name });
    this.sfx = 'save';
    const r = this.rng();
    const dir = this.teams[k.team].dir;
    if (r < 0.4) { this.control(k); return; }
    b.lastTouch = k.i; b.lastTeam = k.team;
    fl.kind = 'loose'; fl.shot = undefined; fl.by = k.i; fl.team = k.team; fl.t = 0; fl.tried.clear();
    if (r < 0.78) {
      // відбиває на кутовий
      const sy = b.y < CY ? -1 : 1;
      b.vx = -dir * 4; b.vy = sy * 16; b.z = 0.5; b.vz = 3;
      b.x = k.x - dir * 0.2;
    } else {
      const a = (this.rng() - 0.5) * 2.0;
      const v = 8 + this.rng() * 6;
      b.vx = dir * Math.cos(a) * v; b.vy = Math.sin(a) * v; b.z = 0.3; b.vz = 2;
    }
  }

  private aerial(fl: Flight) {
    const b = this.ball;
    const cands: SimPlayer[] = [];
    for (const p of this.players) {
      if (!p.on || p.stun > 0) continue;
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < 2.3 || (p.i === fl.target && d < 3.2)) cands.push(p);
    }
    if (!cands.length) return;
    let win: SimPlayer | null = null, bw = -1;
    const stormP = fl.storm ? cands.find((p) => p.sp?.id === 'ihor' && p.team === fl.team) : null;
    if (stormP && this.rng() < S.stormDuelWin) win = stormP;
    else {
      for (const p of cands) {
        let w = Math.pow(this.attr(p, 'header') / 70, 3) * (0.4 + this.rng());
        if (p.role === 'GK' && this.inOwnBox(p)) w *= 1.7;
        if (p === stormP) w = 0;
        if (w > bw) { bw = w; win = p; }
      }
    }
    if (!win) return;
    if (cands.length > 1) { const o = cands.find((p) => p.team !== win!.team); if (o) this.duelInjury(win, o); if (!win.on) return; }
    const a = this.adv(win.team, b.x);
    b.lastTouch = win.i; b.lastTeam = win.team;
    if (win.role === 'GK' && this.inOwnBox(win)) { this.control(win); return; }
    if ((a > L - 17 && Math.abs(b.y - CY) < 15) || (win.fx?.scissors && fl.team === win.team && a > L - 21 && Math.abs(b.y - CY) < 17)) {
      win.x = b.x; win.y = b.y;
      if (fl.team === win.team && fl.by !== win.i) this.lastPass = { from: fl.by, to: win.i, team: win.team, t: this.time };
      const sc = win.fx?.scissors;
      if (sc && fl.team === win.team && b.z > 0.7 && this.rng() < sc.attempt * (1 - 0.6 * fatigueLevel(win.stamina))) {
        // «Європейські ножиці»: акробатичний удар через себе після навісу
        win.flip = 0.7;
        this.ability(win.sp!.ability);
        this.emit('scissors', win.team, win);
        this.sfx = 'scissors';
        this.shoot(win, { header: true, scissors: true });
      } else if (fl.storm && win.sp?.id === 'ihor') {
        this.ability('Повітряний штурм Ісиченка');
        this.shoot(win, { header: true, forced: this.rng() < S.stormHeaderGoal ? 'goal' : 'nogoal' });
      } else {
        if (win.fx?.header && win.sp) this.ability(win.sp.ability);
        this.shoot(win, { header: true });
      }
      return;
    }
    if (a < 30 && fl.team !== win.team) {
      win.x = b.x; win.y = b.y; win.pts += 0.2;
      if (fl.cross && a < 14 && this.rng() < 0.4) {
        // вибиває головою за лінію воріт — кутовий
        const dir = this.teams[win.team].dir;
        fl.kind = 'loose'; fl.by = win.i; fl.team = win.team; fl.t = 0;
        b.vx = -dir * 12; b.vy = (b.y < CY ? -1 : 1) * 9; b.z = 1.5; b.vz = 2;
        return;
      }
      this.clear(win); return;
    }
    this.control(win);
  }

  // ---------- результат ----------
  result(): MatchResult {
    const total = 2 * B.match.halfSeconds;
    const players: PlayerResult[] = this.players.map((p) => ({
      pid: p.pid, team: p.team, played: p.played, minutes: clamp(p.timeOn / total, 0, 1), staminaEnd: p.played ? p.stamina : p.stamina0,
      goals: p.goals, assists: p.assists, saves: p.saves, shots: p.shots, tackles: p.tackles, yellow: p.yellow, red: p.red, injury: p.injury,
      pts: p.pts, name: p.name, special: p.sp?.id,
    }));
    let best: SimPlayer | null = null;
    const win = this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1;
    for (const p of this.players) {
      if (!p.played) continue;
      const v = p.pts + (p.team === win ? 0.5 : 0);
      if (!best || v > best.pts + (best.team === win ? 0.5 : 0)) best = p;
    }
    const poss = this.stats[0].possession + this.stats[1].possession || 1;
    const st = this.stats.map((s) => ({ ...s, possession: Math.round((s.possession / poss) * 100) })) as [TeamStats, TeamStats];
    st[1].possession = 100 - st[0].possession;
    return {
      score: [this.score[0], this.score[1]], stats: st, goals: this.goals, events: this.events, players,
      motm: best ? { pid: best.pid, name: best.name, team: best.team, special: best.sp?.id } : null,
      abilities: { ...this.abilities }, stormHappened: this.stormHappened, durationPlayed: this.time,
    };
  }
}

/** Миттєва (безекранна) симуляція матчу тим самим рушієм. */
export function simulateMatch(setup: MatchSetup): MatchResult {
  const m = new MatchEngine({ ...setup, autoVar: true });
  let guard = 0;
  while (!m.finished && guard++ < 400000) {
    if (m.phase === 'half') m.startSecondHalf();
    m.step();
  }
  return m.result();
}
