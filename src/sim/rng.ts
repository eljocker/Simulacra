// Deterministic, seedable RNG (mulberry32) so simulations are reproducible
// and the balance harness can run repeatable trials.
export class RNG {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  getState(): number {
    return this.s >>> 0;
  }
  setState(s: number): void {
    this.s = s >>> 0;
  }
  next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
