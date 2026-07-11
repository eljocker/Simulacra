import type { Animal } from './types.ts';

// Uniform spatial hash for fast neighbour queries (O(1) amortised per lookup).
export class SpatialGrid {
  private cell: number;
  private cols: number;
  private rows: number;
  private buckets: Animal[][];

  constructor(w: number, h: number, cell: number) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(w / cell));
    this.rows = Math.max(1, Math.ceil(h / cell));
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  insert(a: Animal): void {
    const k = this.key(a.x, a.y);
    this.buckets[k].push(a);
  }

  private key(x: number, y: number): number {
    let cx = (x / this.cell) | 0;
    let cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  // Nearest animal matching `accept` within `radius`, excluding `self`.
  nearest(x: number, y: number, radius: number, accept: (a: Animal) => boolean, self?: Animal): Animal | null {
    let best: Animal | null = null;
    let bd = radius * radius;
    const span = Math.ceil(radius / this.cell);
    let cx = (x / this.cell) | 0;
    let cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    for (let oy = -span; oy <= span; oy++) {
      const gy = cy + oy;
      if (gy < 0 || gy >= this.rows) continue;
      for (let ox = -span; ox <= span; ox++) {
        const gx = cx + ox;
        if (gx < 0 || gx >= this.cols) continue;
        const bucket = this.buckets[gy * this.cols + gx];
        for (let i = 0; i < bucket.length; i++) {
          const a = bucket[i];
          if (a === self || !accept(a)) continue;
          const dx = a.x - x;
          const dy = a.y - y;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = a; }
        }
      }
    }
    return best;
  }
}
