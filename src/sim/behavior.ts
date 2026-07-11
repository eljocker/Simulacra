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

// Ease velocity toward a target. `arrive` > 0 makes the animal slow to a stop as
// it nears the target instead of overshooting and oscillating around it.
function accelerateTowards(a: Animal, tx: number, ty: number, spd: number, dt: number, flee = false, arrive = 0): void {
  let dx = tx - a.x, dy = ty - a.y;
  const d = Math.hypot(dx, dy) || 1;
  if (flee) { dx = -dx; dy = -dy; }
  const s = arrive > 0 && d < arrive ? spd * (d / arrive) : spd;
  const desiredX = (dx / d) * s;
  const desiredY = (dy / d) * s;
  const k = Math.min(1, dt * 3.2);
  a.vx += (desiredX - a.vx) * k;
  a.vy += (desiredY - a.vy) * k;
}

// Gentle, slowly-drifting wander (calm, not frantic).
function roam(a: Animal, spd: number, dt: number, rng: RNG): void {
  a.wander += rng.range(-1.1, 1.1) * dt;
  const desiredX = Math.cos(a.wander) * spd * 0.42;
  const desiredY = Math.sin(a.wander) * spd * 0.42;
  const k = Math.min(1, dt * 1.1);
  a.vx += (desiredX - a.vx) * k;
  a.vy += (desiredY - a.vy) * k;
}

// Decide this animal's velocity for the frame. Returns nothing; world integrates.
export function steer(a: Animal, def: SpeciesDef, ctx: BehaviorCtx): void {
  const nightSlow = 1 - 0.45 * ctx.night;
  const spd = a.genes.speed * nightSlow;

  if (def.diet === 'carnivore') {
    const prey = ctx.grid.nearest(a.x, a.y, a.genes.sense, (o) => def.preys.includes(o.species), a);
    if (prey) accelerateTowards(a, prey.x, prey.y, spd, ctx.dt, false, a.genes.size + 12);
    else roam(a, spd, ctx.dt, ctx.rng);
    return;
  }

  // herbivore: flee threats first (no arrival — keep running)
  if (def.fleesFrom.length) {
    const threat = ctx.grid.nearest(a.x, a.y, a.genes.sense, (o) => def.fleesFrom.includes(o.species), a);
    if (threat) {
      accelerateTowards(a, threat.x, threat.y, spd * 1.3, ctx.dt, true);
      return;
    }
  }
  // seek the nearest scattered grain, easing in so they don't pile-bounce on it
  if (ctx.grain.length) {
    let best: Grain | null = null;
    let bd = a.genes.sense * a.genes.sense;
    for (const g of ctx.grain) {
      const dd = (g.x - a.x) ** 2 + (g.y - a.y) ** 2;
      if (dd < bd) { bd = dd; best = g; }
    }
    if (best) { accelerateTowards(a, best.x, best.y, spd, ctx.dt, false, a.genes.size + 10); return; }
  }
  // if hungry and the grass underfoot is thin, drift toward greener grass by
  // following the grass gradient (a deterministic cross sample — stable target,
  // no per-frame randomness, so no jitter)
  if (a.energy < def.reproduceAt * 0.85 && ctx.grass.at(a.x, a.y) < 0.55) {
    const r = a.genes.sense * 0.5;
    const gx = ctx.grass.at(a.x + r, a.y) - ctx.grass.at(a.x - r, a.y);
    const gy = ctx.grass.at(a.x, a.y + r) - ctx.grass.at(a.x, a.y - r);
    if (Math.abs(gx) + Math.abs(gy) > 0.04) {
      accelerateTowards(a, a.x + gx * 200, a.y + gy * 200, spd * 0.8, ctx.dt);
      return;
    }
  }
  roam(a, spd, ctx.dt, ctx.rng);
}

export function speciesOf(a: Animal): SpeciesDef {
  return SPECIES[a.species];
}
