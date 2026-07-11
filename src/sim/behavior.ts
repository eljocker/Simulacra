import type { Animal, Grain } from './types.ts';
import type { SpeciesDef } from './species.ts';
import { SPECIES } from './species.ts';
import type { SpatialGrid } from './grid.ts';
import type { GrassField } from './grass.ts';
import type { RNG } from './rng.ts';

export interface BehaviorCtx {
  grid: SpatialGrid;
  grass: GrassField;
  grain: Grain[];
  rng: RNG;
  dt: number;
  night: number; // 0 = day, 1 = deep night
  w: number;
  h: number;
}

function accelerateTowards(a: Animal, tx: number, ty: number, spd: number, dt: number, flee = false): void {
  let dx = tx - a.x, dy = ty - a.y;
  const d = Math.hypot(dx, dy) || 1;
  if (flee) { dx = -dx; dy = -dy; }
  const desiredX = (dx / d) * spd;
  const desiredY = (dy / d) * spd;
  const k = Math.min(1, dt * 4);
  a.vx += (desiredX - a.vx) * k;
  a.vy += (desiredY - a.vy) * k;
}

function roam(a: Animal, spd: number, dt: number, rng: RNG): void {
  a.wander += rng.range(-2.4, 2.4) * dt;
  const desiredX = Math.cos(a.wander) * spd * 0.5;
  const desiredY = Math.sin(a.wander) * spd * 0.5;
  const k = Math.min(1, dt * 1.4);
  a.vx += (desiredX - a.vx) * k;
  a.vy += (desiredY - a.vy) * k;
}

// Decide this animal's velocity for the frame. Returns nothing; world integrates.
export function steer(a: Animal, def: SpeciesDef, ctx: BehaviorCtx): void {
  const nightSlow = 1 - 0.45 * ctx.night;
  const spd = a.genes.speed * nightSlow;

  if (def.diet === 'carnivore') {
    const prey = ctx.grid.nearest(a.x, a.y, a.genes.sense, (o) => def.preys.includes(o.species), a);
    if (prey) accelerateTowards(a, prey.x, prey.y, spd, ctx.dt, false);
    else roam(a, spd, ctx.dt, ctx.rng);
    return;
  }

  // herbivore: flee threats first
  if (def.fleesFrom.length) {
    const threat = ctx.grid.nearest(a.x, a.y, a.genes.sense, (o) => def.fleesFrom.includes(o.species), a);
    if (threat) {
      accelerateTowards(a, threat.x, threat.y, spd * 1.35, ctx.dt, true);
      return;
    }
  }
  // seek grain (scattered feed) if close — it's the tastiest
  if (ctx.grain.length) {
    let best: Grain | null = null;
    let bd = a.genes.sense * a.genes.sense;
    for (const g of ctx.grain) {
      const dd = (g.x - a.x) ** 2 + (g.y - a.y) ** 2;
      if (dd < bd) { bd = dd; best = g; }
    }
    if (best) { accelerateTowards(a, best.x, best.y, spd, ctx.dt, false); return; }
  }
  // otherwise wander toward greener grass nearby (sample a few directions)
  if (a.energy < def.reproduceAt * 0.85) {
    let bx = a.x, by = a.y, bv = ctx.grass.at(a.x, a.y);
    for (let s = 0; s < 5; s++) {
      const ang = ctx.rng.range(0, Math.PI * 2);
      const r = a.genes.sense * 0.7;
      const sx = a.x + Math.cos(ang) * r;
      const sy = a.y + Math.sin(ang) * r;
      const v = ctx.grass.at(sx, sy);
      if (v > bv) { bv = v; bx = sx; by = sy; }
    }
    if (bv > 0.15 && (bx !== a.x || by !== a.y)) { accelerateTowards(a, bx, by, spd * 0.85, ctx.dt); return; }
  }
  roam(a, spd, ctx.dt, ctx.rng);
}

export function speciesOf(a: Animal): SpeciesDef {
  return SPECIES[a.species];
}
