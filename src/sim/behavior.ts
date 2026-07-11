import type { Animal, Fruit, Grain } from './types.ts';
import type { SpeciesDef } from './species.ts';
import { SPECIES, growthFactor } from './species.ts';
import type { SpatialGrid } from './grid.ts';
import type { GrassField } from './grass.ts';
import type { RNG } from './rng.ts';

export interface BehaviorCtx {
  grid: SpatialGrid;
  grass: GrassField;
  grain: Grain[];
  fruits: Fruit[];
  rng: RNG;
  dt: number;
  night: number; // 0 = day, 1 = deep night
  w: number;
  h: number;
  claimed: Set<number>; // prey already targeted this tick, so predators don't pile on one
  pond: { x: number; y: number; r: number }; // land animals keep out of the lagoon
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

// Gentle boids flock: cohere toward nearby same-species neighbours, keep a little
// personal space, and loosely align — blended with a soft wander so the group
// drifts as a calm cluster (this is what makes eggs end up laid within the flock).
function flock(a: Animal, spd: number, ctx: BehaviorCtx): void {
  const R = a.genes.sense * 0.8;
  let cx = 0, cy = 0, sx = 0, sy = 0, hx = 0, hy = 0, n = 0;
  const near = a.genes.size * 4.5; // personal-space radius — keeps a visible gap
  ctx.grid.forEachNear(a.x, a.y, R, (o) => o.species === a.species, a, (o, d2) => {
    cx += o.x; cy += o.y;
    hx += Math.cos(o.heading); hy += Math.sin(o.heading);
    const dist = Math.sqrt(d2) || 1;
    if (dist < near) { const push = (near - dist) / near; sx += ((a.x - o.x) / dist) * push; sy += ((a.y - o.y) / dist) * push; } // separation, stronger up close
    n++;
  });
  // wander is always consumed (one RNG draw per idle steer, flocking or not)
  a.wander += ctx.rng.range(-1.1, 1.1) * ctx.dt;
  const wx = Math.cos(a.wander), wy = Math.sin(a.wander);
  if (n === 0) { // alone → plain roam
    const k = Math.min(1, ctx.dt * 1.1);
    a.vx += (wx * spd * 0.42 - a.vx) * k;
    a.vy += (wy * spd * 0.42 - a.vy) * k;
    return;
  }
  let dxv = wx * 0.5 + sx * 2.4, dyv = wy * 0.5 + sy * 2.4; // wander + separation (dominant up close)
  const coh = Math.hypot(cx / n - a.x, cy / n - a.y) || 1;    // cohesion (toward centre)
  dxv += ((cx / n - a.x) / coh) * 0.5; dyv += ((cy / n - a.y) / coh) * 0.5;
  const al = Math.hypot(hx, hy) || 1;                          // alignment
  dxv += (hx / al) * 0.25; dyv += (hy / al) * 0.25;
  const dl = Math.hypot(dxv, dyv) || 1;
  const s = spd * 0.42;
  const k = Math.min(1, ctx.dt * 1.1);
  a.vx += ((dxv / dl) * s - a.vx) * k;
  a.vy += ((dyv / dl) * s - a.vy) * k;
}

// Decide this animal's velocity for the frame. Returns nothing; world integrates.
export function steer(a: Animal, def: SpeciesDef, ctx: BehaviorCtx): void {
  const nightSlow = 1 - 0.45 * ctx.night;
  // juveniles are genuinely slower and less perceptive; they grow into their full
  // genetic speed & sense as they mature (matches the size growth and the Ficha bars)
  const grow = growthFactor(a.species, a.age);
  const spd = a.genes.speed * grow * nightSlow;
  const sense = a.genes.sense * grow;

  // deep night: the whole farm sleeps. Predators rest too, so it is safe for
  // everyone to settle in place — they ease to a stop and doze until dawn.
  if (ctx.night > 0.6) {
    const damp = Math.min(1, ctx.dt * 2.2);
    a.vx -= a.vx * damp;
    a.vy -= a.vy * damp;
    return;
  }

  // ducks live on the water: paddle gently, steering back toward the centre near
  // the shore (the world clamps them inside the lagoon as a backstop)
  if (a.species === 'duck') {
    a.wander += ctx.rng.range(-0.9, 0.9) * ctx.dt;
    const dspd = spd * (0.5 + 0.5 * Math.abs(Math.sin(a.age * 0.5)));
    const ox = a.x - ctx.pond.x, oy = a.y - ctx.pond.y;
    if (Math.hypot(ox, oy) > ctx.pond.r * 0.7) {
      accelerateTowards(a, ctx.pond.x, ctx.pond.y, dspd, ctx.dt);
    } else {
      const k = Math.min(1, ctx.dt * 1.2);
      a.vx += (Math.cos(a.wander) * dspd * 0.6 - a.vx) * k;
      a.vy += (Math.sin(a.wander) * dspd * 0.6 - a.vy) * k;
    }
    return;
  }

  // land animals never enter the lagoon — they turn back at the shore
  const px = a.x - ctx.pond.x, py = a.y - ctx.pond.y;
  const pd = Math.hypot(px, py);
  const keep = ctx.pond.r + a.genes.size + 7;
  if (pd < keep) {
    const nx = px / (pd || 1), ny = py / (pd || 1);
    accelerateTowards(a, a.x + nx * 60, a.y + ny * 60, spd, ctx.dt);
    return;
  }

  if (def.diet === 'carnivore') {
    // each predator claims a DIFFERENT prey so they spread out instead of
    // stacking on the same target (which read as ghosting)
    const prey = ctx.grid.nearest(a.x, a.y, sense, (o) => def.preys.includes(o.species) && !ctx.claimed.has(o.id), a);
    if (prey) { ctx.claimed.add(prey.id); accelerateTowards(a, prey.x, prey.y, spd, ctx.dt, false, a.genes.size + 12); }
    else roam(a, spd, ctx.dt, ctx.rng);
    return;
  }

  // herbivore: flee threats first (no arrival — keep running)
  if (def.fleesFrom.length) {
    const threat = ctx.grid.nearest(a.x, a.y, sense, (o) => def.fleesFrom.includes(o.species), a);
    if (threat) {
      accelerateTowards(a, threat.x, threat.y, spd * 1.3, ctx.dt, true);
      return;
    }
  }
  // when a bit hungry, seek the nearest food item — scattered grain or a fallen
  // fruit — easing in so they don't pile-bounce on it
  if (a.energy < def.reproduceAt * 0.9 && (ctx.grain.length || ctx.fruits.length)) {
    let bx = 0, by = 0, bd = sense * sense, found = false;
    for (const g of ctx.grain) {
      const dd = (g.x - a.x) ** 2 + (g.y - a.y) ** 2;
      if (dd < bd) { bd = dd; bx = g.x; by = g.y; found = true; }
    }
    for (const f of ctx.fruits) {
      if (f.t < 0.5) continue; // still falling
      const dd = (f.x - a.x) ** 2 + (f.y - a.y) ** 2;
      if (dd < bd) { bd = dd; bx = f.x; by = f.y; found = true; }
    }
    if (found) { accelerateTowards(a, bx, by, spd, ctx.dt, false, a.genes.size + 10); return; }
  }
  // if hungry and the grass underfoot is thin, drift toward greener grass by
  // following the grass gradient (a deterministic cross sample — stable target,
  // no per-frame randomness, so no jitter)
  if (a.energy < def.reproduceAt * 0.85 && ctx.grass.at(a.x, a.y) < 0.55) {
    const r = sense * 0.5;
    const gx = ctx.grass.at(a.x + r, a.y) - ctx.grass.at(a.x - r, a.y);
    const gy = ctx.grass.at(a.x, a.y + r) - ctx.grass.at(a.x, a.y - r);
    if (Math.abs(gx) + Math.abs(gy) > 0.04) {
      accelerateTowards(a, a.x + gx * 200, a.y + gy * 200, spd * 0.8, ctx.dt);
      return;
    }
  }
  // nothing urgent → flock (if the species gathers) or wander alone
  if (def.flocks) flock(a, spd, ctx);
  else roam(a, spd, ctx.dt, ctx.rng);
  // gentle habitat affinity: when idle and far from its home range, a species
  // drifts back toward it — so each animal settles in its own micro-habitat.
  if (def.home) {
    const hx = def.home[0] * ctx.w - a.x, hy = def.home[1] * ctx.h - a.y;
    const hd = Math.hypot(hx, hy);
    if (hd > ctx.w * 0.16) {
      const k = Math.min(1, ctx.dt * 0.5);
      a.vx += ((hx / hd) * spd * 0.42 - a.vx) * k;
      a.vy += ((hy / hd) * spd * 0.42 - a.vy) * k;
    }
  }
}

export function speciesOf(a: Animal): SpeciesDef {
  return SPECIES[a.species];
}
