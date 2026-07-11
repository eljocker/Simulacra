import type { RNG } from './rng.ts';
import type { Weather } from './types.ts';

// The pasture: a grid of grass density in [0,1]. Herbivores graze it down,
// it regrows over time, and weather scales the regrowth rate.
export class GrassField {
  cell: number;
  cols: number;
  rows: number;
  density: Float32Array;

  constructor(w: number, h: number, cell = 30) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(w / cell));
    this.rows = Math.max(1, Math.ceil(h / cell));
    this.density = new Float32Array(this.cols * this.rows);
  }

  seed(rng: RNG): void {
    for (let i = 0; i < this.density.length; i++) this.density[i] = rng.range(0.35, 0.9);
  }

  private idx(x: number, y: number): number {
    let cx = (x / this.cell) | 0;
    let cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  at(x: number, y: number): number {
    return this.density[this.idx(x, y)];
  }

  // Eat up to `want` (in density units) at a point; returns amount actually eaten.
  graze(x: number, y: number, want: number): number {
    const i = this.idx(x, y);
    const eaten = Math.min(this.density[i], want);
    this.density[i] -= eaten;
    return eaten;
  }

  regrow(dt: number, weather: Weather): void {
    // clear ~1.0/min baseline; rain triples it, drought reverses to slow decay.
    const rate = weather === 'rain' ? 0.16 : weather === 'drought' ? -0.06 : 0.085;
    const d = this.density;
    for (let i = 0; i < d.length; i++) {
      let v = d[i] + rate * dt;
      if (v > 1) v = 1; else if (v < 0) v = 0;
      d[i] = v;
    }
  }

  scorch(x: number, y: number, radius: number): void {
    const c = this.cell;
    const cx = (x / c) | 0;
    const cy = (y / c) | 0;
    const span = Math.ceil(radius / c);
    for (let oy = -span; oy <= span; oy++) {
      for (let ox = -span; ox <= span; ox++) {
        const gx = cx + ox, gy = cy + oy;
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
        if (ox * ox + oy * oy <= span * span) this.density[gy * this.cols + gx] = 0;
      }
    }
  }

  boost(amount: number): void {
    const d = this.density;
    for (let i = 0; i < d.length; i++) d[i] = Math.min(1, d[i] + amount);
  }

  coverage(): number {
    let s = 0;
    for (let i = 0; i < this.density.length; i++) s += this.density[i];
    return (s / this.density.length) * 100;
  }

  toJSON(): GrassSnapshot {
    // full precision: a Float32 stringified and re-parsed recovers exactly, so a
    // loaded snapshot reproduces the simulation bit-for-bit (the grass gradient
    // that steers grazing is sensitive to tiny differences)
    return { cell: this.cell, cols: this.cols, rows: this.rows, density: Array.from(this.density) };
  }

  load(s: GrassSnapshot): void {
    this.cell = s.cell;
    this.cols = s.cols;
    this.rows = s.rows;
    this.density = Float32Array.from(s.density);
  }
}

export interface GrassSnapshot {
  cell: number;
  cols: number;
  rows: number;
  density: number[];
}
