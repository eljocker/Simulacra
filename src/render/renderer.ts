import type { World } from '../sim/world.ts';
import { PAL } from './palette.ts';
import { drawAnimal } from './sprites.ts';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix(c1: number[], c2: number[], t: number): string {
  return `rgb(${(lerp(c1[0], c2[0], t)) | 0},${(lerp(c1[1], c2[1], t)) | 0},${(lerp(c1[2], c2[2], t)) | 0})`;
}
const G_DRY = [154, 138, 68];
const G_LO = [122, 143, 60];
const G_HI = [79, 122, 46];

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private t = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private night(clock: number): number {
    if (clock > 0.8) return Math.min(1, (clock - 0.8) / 0.08);
    if (clock < 0.16) return Math.min(1, (0.16 - clock) / 0.08);
    return 0;
  }

  draw(world: World): void {
    this.t++;
    const ctx = this.ctx;
    ctx.fillStyle = PAL.soil;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawGrass(world);
    this.drawProps();
    this.drawGrain(world);

    for (const a of world.animals) drawAnimal(ctx, a);
    this.drawEffects(world);
    this.drawWeather(world);
    this.drawNight(world);
  }

  private drawGrass(world: World): void {
    const ctx = this.ctx;
    const g = world.grass;
    const c = g.cell;
    const dry = world.weather === 'drought';
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        const d = g.density[y * g.cols + x];
        if (d < 0.02) continue;
        const col = dry ? mix(G_DRY, G_LO, d) : mix(G_LO, G_HI, d);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.35 + 0.65 * d;
        const px = x * c, py = y * c;
        ctx.fillRect(px, py, c + 1, c + 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawProps(): void {
    const ctx = this.ctx;
    const W = this.w, H = this.h;
    // pond (right side, clear of the panels)
    const pond = { x: W * 0.82, y: H * 0.8, rx: Math.min(120, W * 0.1), ry: Math.min(58, H * 0.08) };
    const grd = ctx.createRadialGradient(pond.x, pond.y, 4, pond.x, pond.y, pond.rx);
    grd.addColorStop(0, PAL.water);
    grd.addColorStop(1, PAL.waterDeep);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, 6.2832);
    ctx.fill();

    // barn (upper-centre, clear of masthead and HUD)
    const bw = Math.min(140, W * 0.11), bh = bw * 0.62;
    const bx = W * 0.52, by = 34;
    ctx.fillStyle = PAL.barnWall;
    ctx.fillRect(bx, by + bh * 0.34, bw, bh * 0.66);
    ctx.fillStyle = PAL.barnRoof;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by + bh * 0.36);
    ctx.lineTo(bx + bw / 2, by);
    ctx.lineTo(bx + bw + 8, by + bh * 0.36);
    ctx.closePath();
    ctx.fill();
    // barn door
    ctx.fillStyle = PAL.barnRoof;
    ctx.fillRect(bx + bw * 0.38, by + bh * 0.55, bw * 0.24, bh * 0.45);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + bw * 0.38, by + bh * 0.55, bw * 0.24, bh * 0.45);
  }

  private drawGrain(world: World): void {
    const ctx = this.ctx;
    ctx.fillStyle = PAL.grain;
    for (const g of world.grain) {
      const r = Math.max(1.5, Math.min(5, g.amount * 0.12));
      ctx.globalAlpha = Math.min(1, g.amount / 30);
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawEffects(world: World): void {
    const ctx = this.ctx;
    for (const e of world.effects) {
      const k = e.t / e.life;
      if (e.kind === 'heart') {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = e.color;
        ctx.font = `${10 + 10 * (1 - k)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('♥', e.x, e.y - 8 - k * 14);
      } else if (e.kind === 'meteor') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, k * 130, 0, 6.2832);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,${(140 * (1 - k)) | 0},40,${0.5 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, (1 - k) * 60, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, k * 16, 0, 6.2832);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  private drawWeather(world: World): void {
    const ctx = this.ctx;
    if (world.weather === 'rain') {
      ctx.strokeStyle = 'rgba(150,190,230,0.35)';
      ctx.lineWidth = 1;
      const off = (this.t * 9) % 24;
      ctx.beginPath();
      for (let x = -24; x < this.w; x += 24) {
        for (let y = -24; y < this.h; y += 24) {
          const sx = x + off, sy = y + off;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - 4, sy + 10);
        }
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,70,110,0.12)';
      ctx.fillRect(0, 0, this.w, this.h);
    } else if (world.weather === 'drought') {
      ctx.fillStyle = 'rgba(210,150,60,0.10)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawNight(world: World): void {
    const n = this.night(world.clock);
    if (n <= 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(18,26,54,${0.5 * n})`;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
