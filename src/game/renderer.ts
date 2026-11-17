// Легкий 2D-рендерер матчу на Canvas: вигляд строго зверху. Статичні шари (поле, трибуни) малюються один раз.
import { BALANCE as B } from '../data/balance';
import { RARITY } from '../data/rarity';
import type { MatchEngine } from '../simulation/engine';
import type { SimPlayer } from '../simulation/types';
import { loadImage } from './assets';

const P = B.pitch;
const L = P.L, W = P.W;

export interface RenderTeam { logo: string; color: string; isUser?: boolean }

// На полі персонажі ІМІ мають окремі емблеми: біла літера — команда гравця, жовта — команда суперника.
const IMI_USER = 'assets/imi/imi-user.png';
const IMI_OPP = 'assets/imi/imi-opp.png';

function mulberry(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class PitchRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private crowd: HTMLCanvasElement[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private imgs = new Map<string, HTMLImageElement>();
  private s = 1; private ox = 0; private oy = 0; private portrait = false; private dpr = 1;
  private w = 0; private h = 0; private margin = 6; private r = 10;
  private flash = 0; private flashColor = '#fff';
  private destroyed = false;
  low = false;

  constructor(private canvas: HTMLCanvasElement, private teams: [RenderTeam, RenderTeam], extraImgs: string[]) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (const path of [teams[0].logo, teams[1].logo, IMI_USER, IMI_OPP, ...extraImgs]) {
      loadImage(path).then((img) => { if (!this.destroyed) { this.imgs.set(path, img); this.sprites.clear(); } }).catch(() => undefined);
    }
  }

  destroy() {
    this.destroyed = true;
    this.sprites.clear(); this.imgs.clear(); this.bg = null; this.crowd = [];
  }

  setLow(low: boolean) { if (this.low !== low) { this.low = low; this.resize(this.w, this.h); } }

  resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    this.w = w; this.h = h;
    this.dpr = this.low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.portrait = h > w * 1.08;
    this.margin = Math.min(w, h) < 480 ? 3.5 : 6.5;
    const m = this.margin;
    const long = L + 2 * m, short = W + 2 * m;
    this.s = this.portrait ? Math.min(h / long, w / short) : Math.min(w / long, h / short);
    this.ox = (w - (this.portrait ? short : long) * this.s) / 2 + m * this.s;
    this.oy = (h - (this.portrait ? long : short) * this.s) / 2 + m * this.s;
    this.r = Math.max(this.s * 1.55, 7.5);
    this.sprites.clear();
    this.buildStatic();
  }

  /** Світові координати -> екранні. */
  private X(x: number, y: number) { return this.portrait ? this.ox + (W - y) * this.s : this.ox + x * this.s; }
  private Y(x: number, y: number) { return this.portrait ? this.oy + x * this.s : this.oy + y * this.s; }

  private buildStatic() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const s = this.s, m = this.margin;
    g.fillStyle = '#030c09'; g.fillRect(0, 0, this.w, this.h);
    // орієнтуємо систему координат поля
    g.save();
    if (this.portrait) { g.translate(this.ox + W * s, this.oy); g.rotate(Math.PI / 2); } else g.translate(this.ox, this.oy);
    g.scale(s, s);
    // трибуни (основа)
    g.fillStyle = '#0b241c'; g.fillRect(-m, -m, L + 2 * m, W + 2 * m);
    g.fillStyle = '#143a2d';
    g.fillRect(-m, -m, L + 2 * m, m - 1); g.fillRect(-m, W + 1, L + 2 * m, m - 1);
    g.fillRect(-m, -m, m - 1, W + 2 * m); g.fillRect(L + 1, -m, m - 1, W + 2 * m);
    // газон зі смугами
    const stripes = 14;
    for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? '#2f8f46' : '#2a8540'; g.fillRect((i * L) / stripes, 0, L / stripes + 0.05, W); }
    g.fillStyle = '#256f38'; g.fillRect(-1, -1, L + 2, 1); g.fillRect(-1, W, L + 2, 1); g.fillRect(-1, -1, 1, W + 2); g.fillRect(L, -1, 1, W + 2);
    // розмітка
    g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = Math.max(0.16, 1.3 / s); g.lineJoin = 'miter';
    g.strokeRect(0, 0, L, W);
    g.beginPath(); g.moveTo(L / 2, 0); g.lineTo(L / 2, W); g.stroke();
    g.beginPath(); g.arc(L / 2, W / 2, P.circle, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(L / 2, W / 2, 0.35, 0, Math.PI * 2); g.fill();
    for (const side of [0, 1]) {
      const gx = side ? L : 0, d = side ? -1 : 1;
      g.strokeRect(side ? L - P.boxDepth : 0, W / 2 - P.boxHalf, P.boxDepth, P.boxHalf * 2);
      g.strokeRect(side ? L - P.sixDepth : 0, W / 2 - P.sixHalf, P.sixDepth, P.sixHalf * 2);
      g.beginPath(); g.arc(gx + d * P.penSpot, W / 2, 0.35, 0, Math.PI * 2); g.fill();
      g.beginPath(); const a0 = Math.acos((P.boxDepth - P.penSpot) / P.circle);
      if (side) g.arc(gx + d * P.penSpot, W / 2, P.circle, Math.PI - a0, Math.PI + a0); else g.arc(gx + d * P.penSpot, W / 2, P.circle, -a0, a0);
      g.stroke();
      // ворота з сіткою
      g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(side ? L : -2.2, W / 2 - P.goalHalf, 2.2, P.goalHalf * 2);
      g.save(); g.lineWidth = Math.max(0.05, 0.5 / s); g.strokeStyle = 'rgba(255,255,255,.5)';
      for (let k = 0; k <= 4; k++) { const xx = (side ? L : -2.2) + k * 0.55; g.beginPath(); g.moveTo(xx, W / 2 - P.goalHalf); g.lineTo(xx, W / 2 + P.goalHalf); g.stroke(); }
      for (let k = 0; k <= 8; k++) { const yy = W / 2 - P.goalHalf + (k * P.goalHalf * 2) / 8; g.beginPath(); g.moveTo(side ? L : -2.2, yy); g.lineTo(side ? L + 2.2 : 0, yy); g.stroke(); }
      g.restore();
      g.strokeRect(side ? L : -2.2, W / 2 - P.goalHalf, 2.2, P.goalHalf * 2);
      g.fillStyle = '#fff';
    }
    // кутові сектори
    for (const [cx, cy, a] of [[0, 0, 0], [L, 0, Math.PI / 2], [L, W, Math.PI], [0, W, -Math.PI / 2]] as const) { g.beginPath(); g.arc(cx, cy, 1, a, a + Math.PI / 2); g.stroke(); }
    // освітлення: мʼякі плями прожекторів і віньєтка
    if (!this.low) {
      for (const [lx, ly] of [[L * 0.2, W * 0.2], [L * 0.8, W * 0.2], [L * 0.2, W * 0.8], [L * 0.8, W * 0.8]]) {
        const gr = g.createRadialGradient(lx, ly, 2, lx, ly, 42);
        gr.addColorStop(0, 'rgba(255,255,220,.10)'); gr.addColorStop(1, 'rgba(255,255,220,0)');
        g.fillStyle = gr; g.fillRect(0, 0, L, W);
      }
      const vg = g.createRadialGradient(L / 2, W / 2, 30, L / 2, W / 2, 75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,20,.28)');
      g.fillStyle = vg; g.fillRect(-m, -m, L + 2 * m, W + 2 * m);
    }
    g.restore();
    this.bg = c;
    // два кадри вболівальників для дешевої анімації трибун
    this.crowd = [];
    const frames = this.low ? 1 : 2;
    for (let f = 0; f < frames; f++) {
      const cc = document.createElement('canvas');
      cc.width = c.width; cc.height = c.height;
      const cg = cc.getContext('2d')!;
      cg.scale(this.dpr, this.dpr);
      cg.save();
      if (this.portrait) { cg.translate(this.ox + W * s, this.oy); cg.rotate(Math.PI / 2); } else cg.translate(this.ox, this.oy);
      cg.scale(s, s);
      const rnd = mulberry(7);
      const cols = [this.teams[0].color, this.teams[1].color, '#e8edf5', '#DDBB64', '#D9DDDF', '#8fb3a4'];
      const step = Math.max(1.05, 4.2 / s);
      const dot = step * 0.36;
      for (let x = -m + step / 2; x < L + m; x += step) {
        for (let y = -m + step / 2; y < W + m; y += step) {
          if (x > -1.4 && x < L + 1.4 && y > -1.4 && y < W + 1.4) continue;
          const r0 = rnd();
          if (r0 < 0.12) continue;
          const side = x < L / 2 ? 0 : 1;
          cg.fillStyle = r0 < 0.5 ? cols[side] : cols[2 + Math.floor(rnd() * 4)];
          cg.globalAlpha = 0.6 + rnd() * 0.4;
          const jump = f === 1 && rnd() < 0.5 ? step * 0.16 : 0;
          cg.beginPath(); cg.arc(x + (rnd() - 0.5) * 0.3, y - jump, dot, 0, Math.PI * 2); cg.fill();
        }
      }
      cg.restore();
      this.crowd.push(cc);
    }
  }

  private sprite(key: string, img: HTMLImageElement | undefined, ring: string, ringW: number, glow: boolean): HTMLCanvasElement {
    const k = `${key}|${ring}|${ringW}`;
    let c = this.sprites.get(k);
    if (c) return c;
    const r = this.r * this.dpr;
    const pad = glow ? r * 0.55 : 2;
    const size = Math.ceil((r + pad) * 2);
    c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d')!;
    const cx = size / 2;
    if (glow) { g.shadowColor = ring; g.shadowBlur = r * 0.5; }
    g.fillStyle = ring; g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    const ir = r - ringW * this.dpr;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cx, ir, 0, Math.PI * 2); g.fill();
    if (img) { g.save(); g.beginPath(); g.arc(cx, cx, ir, 0, Math.PI * 2); g.clip(); g.imageSmoothingQuality = 'high'; g.drawImage(img, cx - ir, cx - ir, ir * 2, ir * 2); g.restore(); }
    this.sprites.set(k, c);
    return c;
  }

  goalFlash(color: string) { this.flash = 1; this.flashColor = color; }

  draw(m: MatchEngine, now: number) {
    const g = this.ctx;
    if (!this.bg) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    const excited = m.phase === 'wait' || (m.ball.flight?.kind === 'shot');
    const frame = this.crowd.length > 1 ? Math.floor(now / (excited ? 160 : 420)) % 2 : 0;
    if (this.crowd[frame]) g.drawImage(this.crowd[frame], 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const b = m.ball;
    const r = this.r;
    // тіні
    if (!this.low) {
      g.fillStyle = 'rgba(0,0,0,.22)';
      for (const p of m.players) { if (!p.on) continue; g.beginPath(); g.ellipse(this.X(p.x, p.y) + r * 0.18, this.Y(p.x, p.y) + r * 0.3, r * 0.95, r * 0.8, 0, 0, Math.PI * 2); g.fill(); }
    }
    // арбітр
    {
      const x = this.X(m.ref.x, m.ref.y), y = this.Y(m.ref.x, m.ref.y), rr = r * 0.62;
      g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(x, y, rr * 0.45, 0, Math.PI * 2); g.fill();
    }
    // гравці (спершу звичайні, потім особливі — щоб їх було видно)
    const labels: SimPlayer[] = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const p of m.players) {
        if (!p.on || (pass === 0) === !!p.sp) continue;
        const x = this.X(p.x, p.y), y = this.Y(p.x, p.y);
        let sp: HTMLCanvasElement;
        if (p.sp) {
          const col = RARITY[p.sp.rarity].color;
          const img = p.sp.kind === 'imi' ? (this.teams[p.team].isUser ? IMI_USER : IMI_OPP) : p.sp.img;
          sp = this.sprite(img, this.imgs.get(img), col, Math.max(2.2, r * 0.2), !this.low);
          labels.push(p);
        } else {
          const t = this.teams[p.team];
          sp = this.sprite(t.logo + (p.role === 'GK' ? 'gk' : ''), this.imgs.get(t.logo), p.role === 'GK' ? '#c8ff3d' : p.team === 0 ? '#ffffff' : '#10182a', Math.max(1.4, r * 0.13), false);
        }
        const sz = sp.width / this.dpr;
        if (p.diveAnim > 0 && p.role === 'GK') {
          g.save(); g.translate(x, y); g.scale(1.25, 0.85); g.drawImage(sp, -sz / 2, -sz / 2, sz, sz); g.restore();
        } else if (p.stun > 0) {
          g.globalAlpha = 0.75; g.drawImage(sp, x - sz / 2, y - sz / 2 + 1, sz, sz); g.globalAlpha = 1;
        } else g.drawImage(sp, x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    // підписи особливих гравців
    if (labels.length) {
      const fs = Math.max(9, Math.min(13, r * 0.95));
      g.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.lineWidth = 3; g.strokeStyle = 'rgba(5,10,20,.85)'; g.lineJoin = 'round';
      for (const p of labels) {
        const x = this.X(p.x, p.y), y = this.Y(p.x, p.y) + r + 2;
        g.strokeText(p.sp!.short, x, y);
        g.fillStyle = RARITY[p.sp!.rarity].color; g.fillText(p.sp!.short, x, y);
      }
    }
    // мʼяч — завжди поверх
    {
      let wx = b.x, wy = b.y;
      if (b.owner) { const k = r / this.s + 0.25; wx = b.owner.x + b.owner.hx * k; wy = b.owner.y + b.owner.hy * k; }
      const x = this.X(wx, wy), y = this.Y(wx, wy);
      const br = Math.max(this.s * 0.62, 3.6) * (1 + Math.min(b.z, 6) * 0.14);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + b.z * this.s * 0.5 + 1, y + b.z * this.s * 0.6 + 1.5, br, br * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, br, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#1a1a1a';
      const a = b.spin * 0.9;
      for (let k = 0; k < 3; k++) { const aa = a + (k * Math.PI * 2) / 3; g.beginPath(); g.arc(x + Math.cos(aa) * br * 0.45, y + Math.sin(aa) * br * 0.45, br * 0.24, 0, Math.PI * 2); g.fill(); }
    }
    if (this.flash > 0) {
      g.globalAlpha = this.flash * 0.35; g.fillStyle = this.flashColor; g.fillRect(0, 0, this.w, this.h); g.globalAlpha = 1;
      this.flash -= 0.03;
    }
  }
}
