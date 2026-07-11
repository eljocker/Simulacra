import type { Animal, Corpse, Effect, Egg, Fruit, Grain, Intervention, LifeEvent, Scavenger, SpeciesId, Stats, Weather, WorldSnapshot } from './types.ts';
import { SPECIES, HERBIVORES, growthFactor } from './species.ts';
import { RNG } from './rng.ts';
import { SpatialGrid } from './grid.ts';
import { GrassField } from './grass.ts';
import { steer, type BehaviorCtx } from './behavior.ts';
import { DAY_LENGTH, SECONDS_PER_YEAR } from './time.ts';

const EVENT_CAP = 500; // shared log; meals are frequent, so give births/deaths room to survive
const MEAL_LOG_CD = 22; // min seconds between an animal's logged meals (keeps the log sane)
const SLEEP_NIGHT = 0.6; // night factor above which the farm sleeps (predators too)
const CORPSE_TIME = 3.6; // seconds a body lies on the ground before its soul rises
const GESTATION = 6; // seconds a chicken egg incubates before it hatches
// aerial scavengers (buitres)
const SCAV_CRUISE_H = 240; // cruising height (world px)
const SCAV_FEED_H = 16;    // height while feeding on a corpse
const SCAV_SPEED = 74;
const SCAV_SENSE = 520;    // how far they spot a corpse
export const SCAV_MAXAGE = 14 * SECONDS_PER_YEAR; // buitres are long-lived
const SCAV_MIN = 2;        // a couple always circle overhead
const SCAV_CAP = 6;
const SCAV_FEED_TIME = 1.3; // seconds to devour a corpse
export const SCAV_REPRO_AT = 150;
// ducks (aquatic species — never leave the pond; dabble for food)
const DUCK_MIN = 3;         // a few always paddle the lagoon
const DUCK_DABBLE = 5;      // energy/s gained filter-feeding in the water
// fruit (apples fallen from trees — real edible food in the environment)
const FRUIT_CAP = 18;
const FRUIT_DROP_EVERY = 2.3; // a tree drops a fruit roughly this often
const FRUIT_ENERGY = 46;
const FRUIT_ROT = 55; // seconds before an uneaten fruit rots away

export class World {
  w: number;
  h: number;
  rng: RNG;
  animals: Animal[] = [];
  corpses: Corpse[] = [];
  eggs: Egg[] = [];
  scavengers: Scavenger[] = [];
  trees: { x: number; y: number; scale: number }[] = []; // deterministic; renderer draws these, fruit falls from them
  grass: GrassField;
  grain: Grain[] = [];
  fruits: Fruit[] = [];
  private fruitTimer = 0;
  effects: Effect[] = [];
  events: LifeEvent[] = []; // the world's log book (newest at the end)
  weather: Weather = 'clear';
  weatherTimer = 0;
  clock = 0.5; // time-of-day fraction; the engine drives it from the real clock
  day = 1;
  born = 0;
  died = 0;
  capScale = 1; // population scaling from terrain size × density (set by the engine)
  pond = { x: 0, y: 0, r: 0 }; // the lagoon, in world px — land animals border it, ducks live in it
  private nextId = 1;
  private evSeq = 0;
  private rescueTimer = 0;

  private logEvent(e: Omit<LifeEvent, 'seq' | 'clock'>): void {
    this.events.push({ seq: this.evSeq++, clock: this.clock, ...e });
    if (this.events.length > EVENT_CAP) this.events.shift();
  }

  // record a meal in an animal's life story, throttled so the shared log doesn't
  // drown in "comió" lines (each animal logs a meal at most every MEAL_LOG_CD).
  private logMeal(a: Animal, cause: string): void {
    if (a.mealCd > 0) return;
    a.mealCd = MEAL_LOG_CD;
    this.logEvent({ kind: 'meal', species: a.species, id: a.id, cause });
  }

  // lay a fallen animal on the ground; its soul rises once CORPSE_TIME elapses
  private layCorpse(a: Animal): void {
    this.corpses.push({
      species: a.species, x: a.x, y: a.y, heading: a.heading,
      size: a.genes.size, born: a.born, age: a.age, t: 0, life: CORPSE_TIME, color: SPECIES[a.species].color,
    });
  }

  // body radius (world px) for collision — matches the on-screen footprint
  private bodyRadius(a: Animal): number {
    return a.genes.size * growthFactor(a.species, a.age) * 0.8;
  }

  // push overlapping animals apart (one relaxation pass). Runs after movement so
  // bodies stay solid; predators still reach prey (catch range > body radius).
  private resolveCollisions(): void {
    const grid = new SpatialGrid(this.w, this.h, 64);
    for (const a of this.animals) grid.insert(a);
    for (const a of this.animals) {
      const ra = this.bodyRadius(a);
      grid.forEachNear(a.x, a.y, ra + 24, (o) => o.id > a.id, a, (o) => {
        const min = ra + this.bodyRadius(o);
        let dx = o.x - a.x, dy = o.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-3) { // exactly coincident — split along a deterministic direction
          dx = (a.id & 1) ? 1 : -1; dy = (a.id & 2) ? 1 : -1; d = Math.hypot(dx, dy);
        }
        if (d < min) {
          const push = (min - d) * 0.5, nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          o.x += nx * push; o.y += ny * push;
        }
      });
    }
    for (const a of this.animals) { // keep them on the field after the shove
      a.x = Math.max(3, Math.min(this.w - 3, a.x));
      a.y = Math.max(3, Math.min(this.h - 3, a.y));
    }
  }

  private makeScavenger(x: number, y: number): Scavenger {
    return {
      id: this.nextId++, x, y, vx: 0, vy: 0, heading: this.rng.range(0, 6.28),
      h: SCAV_CRUISE_H, energy: this.rng.range(90, 130), age: this.rng.range(0, 40),
      state: 'cruise', feedT: 0, flap: this.rng.range(0, 6.28),
    };
  }

  // Aerial scavengers: circle overhead, dive to devour a corpse before its soul
  // rises (nutrients, not loss), and are themselves mortal — they age and starve.
  private updateScavengers(dt: number): void {
    const claimed = new Set<Corpse>();
    for (let i = this.scavengers.length - 1; i >= 0; i--) {
      const s = this.scavengers[i];
      s.age += dt;
      s.energy -= 1.1 * dt; // slow metabolism; corpses replenish it
      s.flap += dt * (s.state === 'cruise' ? 6 : 11);

      // death: old age or starvation → drift down and release a soul
      if (s.age > SCAV_MAXAGE || s.energy <= 0) {
        this.effects.push({ x: s.x, y: s.y, t: 0, life: 2.6, kind: 'soul', color: '#6b6f76' });
        this.scavengers.splice(i, 1);
        continue;
      }

      // find the nearest unclaimed corpse to feed on
      let target: Corpse | null = null;
      let bd = SCAV_SENSE * SCAV_SENSE;
      for (const c of this.corpses) {
        if (claimed.has(c)) continue;
        const d = (c.x - s.x) ** 2 + (c.y - s.y) ** 2;
        if (d < bd) { bd = d; target = c; }
      }

      if (target) {
        claimed.add(target);
        const dx = target.x - s.x, dy = target.y - s.y;
        const dist = Math.hypot(dx, dy) || 1;
        s.state = dist < 26 && s.h < SCAV_FEED_H * 3 ? 'feed' : 'dive';
        if (s.state === 'feed') {
          s.h += (SCAV_FEED_H - s.h) * Math.min(1, dt * 4);
          s.vx *= 0.8; s.vy *= 0.8;
          s.feedT += dt;
          if (s.feedT >= SCAV_FEED_TIME) {
            // devour it: the body is consumed, so NO soul rises — the cycle closes
            const idx = this.corpses.indexOf(target);
            if (idx >= 0) this.corpses.splice(idx, 1);
            s.energy += 46;
            s.feedT = 0;
            s.state = 'cruise';
          }
        } else { // dive toward the corpse, losing height
          const spd = SCAV_SPEED * 1.15;
          s.vx += ((dx / dist) * spd - s.vx) * Math.min(1, dt * 2.4);
          s.vy += ((dy / dist) * spd - s.vy) * Math.min(1, dt * 2.4);
          const wantH = SCAV_FEED_H + Math.min(1, dist / 220) * (SCAV_CRUISE_H - SCAV_FEED_H);
          s.h += (wantH - s.h) * Math.min(1, dt * 3.2);
          s.feedT = 0;
        }
      } else {
        // cruise: gentle circling, climb back to cruising height
        s.state = 'cruise';
        s.heading += 0.5 * dt; // lazy circle
        const spd = SCAV_SPEED * (0.5 + 0.5 * Math.abs(Math.sin(s.age * 0.2)));
        s.vx += (Math.cos(s.heading) * spd - s.vx) * Math.min(1, dt * 1.2);
        s.vy += (Math.sin(s.heading) * spd - s.vy) * Math.min(1, dt * 1.2);
        s.h += (SCAV_CRUISE_H - s.h) * Math.min(1, dt * 0.8);
        s.feedT = 0;
      }

      // integrate + wrap softly inside the field
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < 20) { s.x = 20; s.heading = Math.PI - s.heading; }
      else if (s.x > this.w - 20) { s.x = this.w - 20; s.heading = Math.PI - s.heading; }
      if (s.y < 20) { s.y = 20; s.heading = -s.heading; }
      else if (s.y > this.h - 20) { s.y = this.h - 20; s.heading = -s.heading; }
      if (s.vx * s.vx + s.vy * s.vy > 1) s.heading = Math.atan2(s.vy, s.vx);

      // reproduce when well-fed (keeps a small aerial population)
      if (s.energy > SCAV_REPRO_AT && this.scavengers.length < SCAV_CAP) {
        s.energy *= 0.55;
        this.scavengers.push(this.makeScavenger(s.x, s.y));
      }
    }

    // a couple always drift in from beyond the horizon
    if (this.scavengers.length < SCAV_MIN) {
      const edge = this.rng.range(0, this.h);
      this.scavengers.push(this.makeScavenger(this.rng.chance(0.5) ? 20 : this.w - 20, edge));
    }
  }

  // a new duck, placed somewhere inside the lagoon
  private makeDuckInPond(): Animal {
    const ang = this.rng.range(0, 6.28), rad = this.rng.range(0, this.pond.r * 0.7);
    return this.make('duck', this.pond.x + Math.cos(ang) * rad, this.pond.y + Math.sin(ang) * rad);
  }

  constructor(w: number, h: number, seed = 1) {
    this.w = w;
    this.h = h;
    this.rng = new RNG(seed);
    this.grass = new GrassField(w, h);
    this.computePond();
    this.computeTrees();
  }

  // the lagoon is deterministic from the field size (matches the renderer exactly)
  private computePond(): void {
    this.pond = { x: this.w * 0.82, y: this.h * 0.8, r: this.w * 0.09 };
  }

  // deterministic tree scatter (same formula the renderer draws) — so fruit can
  // fall from real trees and the sim & scene agree on where the trees are
  private computeTrees(): void {
    this.trees = [];
    for (let i = 0; i < 11; i++) {
      const fx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const fy = (Math.sin(i * 78.233) * 12543.128) % 1;
      const x = (Math.abs(fx) * 0.82 + 0.09) * this.w;
      const y = (Math.abs(fy) * 0.82 + 0.09) * this.h;
      this.trees.push({ x, y, scale: 0.8 + Math.abs(fx) * 0.8 });
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.computePond();
    this.computeTrees();
    const g = new GrassField(w, h);
    g.seed(this.rng);
    this.grass = g;
    for (const a of this.animals) {
      a.x = Math.min(a.x, w - 4);
      a.y = Math.min(a.y, h - 4);
    }
  }

  seed(): void {
    this.animals = [];
    this.corpses = [];
    this.eggs = [];
    this.scavengers = [];
    this.grain = [];
    this.fruits = [];
    this.fruitTimer = 0;
    this.effects = [];
    this.events = [];
    this.evSeq = 0;
    this.grass.seed(this.rng);
    this.weather = 'clear';
    this.weatherTimer = 0;
    this.clock = 0.5;
    this.day = 1;
    this.born = 0;
    this.died = 0;
    const start: [SpeciesId, number][] = [['chicken', 14], ['sheep', 8], ['cow', 4], ['fox', 3]];
    for (const [sp, n0] of start) {
      const n = Math.max(1, Math.round(n0 * this.capScale));
      for (let i = 0; i < n; i++) {
        const a = this.make(sp, this.rng.range(40, this.w - 40), this.rng.range(40, this.h - 40));
        a.born = 1;
        a.age = this.rng.range(5, 30);
        this.animals.push(a);
      }
    }
    for (let i = 0; i < SCAV_MIN; i++) {
      this.scavengers.push(this.makeScavenger(this.rng.range(60, this.w - 60), this.rng.range(60, this.h - 60)));
    }
    for (let i = 0; i < DUCK_MIN; i++) {
      const d = this.makeDuckInPond();
      d.born = 1;
      d.age = this.rng.range(5, 40);
      this.animals.push(d);
    }
  }

  private make(species: SpeciesId, x: number, y: number, genes?: Animal['genes']): Animal {
    const def = SPECIES[species];
    const g = genes ?? { speed: def.speed, sense: def.sense, size: def.size };
    return {
      id: this.nextId++, species, x, y, vx: 0, vy: 0, heading: this.rng.range(0, 6.28),
      energy: def.e0, age: 0, genes: g, cooldown: def.cooldown * 0.5,
      born: 0, flash: 0, sick: 0, wander: this.rng.range(0, 6.28), eating: 0, mealCd: 0,
    };
  }

  private count(sp: SpeciesId): number {
    let n = 0;
    for (const a of this.animals) if (a.species === sp) n++;
    return n;
  }

  private childGenes(a: Animal): Animal['genes'] {
    const def = SPECIES[a.species];
    const m = (v: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, v * (1 + this.rng.range(-0.08, 0.08))));
    return {
      speed: m(a.genes.speed, def.speed * 0.6, def.speed * 1.5),
      sense: m(a.genes.sense, def.sense * 0.6, def.sense * 1.5),
      size: m(a.genes.size, def.size * 0.75, def.size * 1.3),
    };
  }

  private nightFactor(): number {
    // darkness follows the sun's height, so night and the sun are always in sync
    const elev = Math.sin(this.clock * Math.PI * 2 - Math.PI / 2);
    return Math.max(0, Math.min(1, (0.12 - elev) / 0.24));
  }

  tick(dt: number): void {
    // the simulation drives its own calendar, so days and years pass with the sim
    // (and pause/speed change how fast) — not with the wall clock.
    this.clock += dt / DAY_LENGTH;
    while (this.clock >= 1) { this.clock -= 1; this.day++; }
    if (this.weatherTimer > 0) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) this.weather = 'clear';
    }
    const night = this.nightFactor();
    const asleep = night > SLEEP_NIGHT; // the farm rests at night: no feeding, hunting or breeding

    // perception grid
    const grid = new SpatialGrid(this.w, this.h, 96);
    for (const a of this.animals) grid.insert(a);

    const ctx: BehaviorCtx = { grid, grass: this.grass, grain: this.grain, fruits: this.fruits, rng: this.rng, dt, night, w: this.w, h: this.h, claimed: new Set<number>(), pond: this.pond };

    const newborns: Animal[] = [];
    const dead = new Set<number>();

    // live per-species population, kept accurate through the tick so soft caps
    // can't be overshot by many simultaneous births in one step
    const pop: Record<SpeciesId, number> = { chicken: 0, sheep: 0, cow: 0, fox: 0, duck: 0 };
    for (const a of this.animals) pop[a.species]++;
    pop.chicken += this.eggs.length; // eggs reserve a slot so the cap can't be overshot

    for (const a of this.animals) {
      if (dead.has(a.id)) continue;
      const def = SPECIES[a.species];
      a.age += dt;
      // birthday milestone: each whole day of life survived is logged to its story
      const dayNow = Math.floor(a.age / DAY_LENGTH);
      if (dayNow >= 1 && dayNow > Math.floor((a.age - dt) / DAY_LENGTH)) {
        this.logEvent({ kind: 'milestone', species: a.species, id: a.id, cause: 'dia', age: a.age });
      }
      a.cooldown -= dt;
      if (a.mealCd > 0) a.mealCd -= dt;
      if (a.born < 1) a.born = Math.min(1, a.born + dt * 2.5);
      if (a.flash > 0) a.flash -= dt;
      if (a.eating > 0) a.eating -= dt;
      if (a.sick > 0) a.sick = Math.max(0, a.sick - dt);

      steer(a, def, ctx);

      // integrate + soft walls
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      const m = 18;
      if (a.x < m) a.vx += (m - a.x) * 3 * dt;
      else if (a.x > this.w - m) a.vx -= (a.x - (this.w - m)) * 3 * dt;
      if (a.y < m) a.vy += (m - a.y) * 3 * dt;
      else if (a.y > this.h - m) a.vy -= (a.y - (this.h - m)) * 3 * dt;
      a.x = Math.max(3, Math.min(this.w - 3, a.x));
      a.y = Math.max(3, Math.min(this.h - 3, a.y));
      // ducks never leave the water: clamp them inside the lagoon
      if (a.species === 'duck') {
        const P = this.pond, ox = a.x - P.x, oy = a.y - P.y, od = Math.hypot(ox, oy), lim = P.r * 0.82;
        if (od > lim) { a.x = P.x + (ox / od) * lim; a.y = P.y + (oy / od) * lim; a.vx *= 0.3; a.vy *= 0.3; }
      }
      // turn smoothly toward travel direction, and only when actually moving,
      // so a near-stopped animal never spins in place (calm, painting-like)
      if (a.vx * a.vx + a.vy * a.vy > 16) {
        const targetH = Math.atan2(a.vy, a.vx);
        let dh = targetH - a.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        const maxTurn = 3.2 * dt; // rad/s cap
        a.heading += dh < -maxTurn ? -maxTurn : dh > maxTurn ? maxTurn : dh;
      }

      const speed = Math.hypot(a.vx, a.vy);
      // sleeping animals rest — a slower metabolism carries them through the night
      a.energy -= (def.metabolism * (asleep ? 0.45 : 1) + def.moveCost * speed + (a.sick > 0 ? 2.4 : 0)) * dt;

      if (asleep) {
        // dozing: no feeding, hunting or breeding until dawn
      } else if (a.species === 'duck') {
        // ducks dabble in the lagoon — a steady trickle of food from the water
        a.energy += DUCK_DABBLE * dt;
        if (speed < 12) a.eating = 0.4;
        if (a.energy < def.reproduceAt) this.logMeal(a, 'alga');
      } else if (def.diet === 'herbivore') {
        // graze grass under feet — the "eating" pose shows only when it slows to feed
        const eaten = this.grass.graze(a.x, a.y, 1.4 * dt);
        if (eaten > 0) {
          a.energy += eaten * def.grazeGain;
          if (speed < 14) a.eating = 0.4;
          if (a.energy < def.reproduceAt) this.logMeal(a, 'pasto');
        }
        // eat grain if close
        for (let i = this.grain.length - 1; i >= 0; i--) {
          const gr = this.grain[i];
          if ((gr.x - a.x) ** 2 + (gr.y - a.y) ** 2 < (a.genes.size + 8) ** 2) {
            const take = Math.min(gr.amount, 26);
            gr.amount -= take;
            a.energy += take;
            a.flash = 0.25; a.eating = 0.45;
            this.logMeal(a, 'grano');
            if (gr.amount <= 0) this.grain.splice(i, 1);
            break;
          }
        }
        // eat a fallen fruit if close AND not already full — so well-fed herds
        // leave fruit lying in the environment for the hungry
        for (let i = this.fruits.length - 1; a.energy < def.reproduceAt && i >= 0; i--) {
          const fr = this.fruits[i];
          if (fr.t < 0.5) continue; // still falling
          if ((fr.x - a.x) ** 2 + (fr.y - a.y) ** 2 < (a.genes.size + 10) ** 2) {
            a.energy += fr.amount;
            a.flash = 0.3; a.eating = 0.5;
            this.logMeal(a, 'fruta');
            this.effects.push({ x: fr.x, y: fr.y, t: 0, life: 0.5, kind: 'heart', color: '#e0473a' });
            this.fruits.splice(i, 1);
            break;
          }
        }
      } else {
        // hunt
        const prey = grid.nearest(a.x, a.y, a.genes.size + 9, (o) => def.preys.includes(o.species) && !dead.has(o.id), a);
        if (prey) {
          dead.add(prey.id);
          pop[prey.species]--;
          this.died++;
          a.energy += def.catchEnergy;
          a.flash = 0.3;
          this.logMeal(a, 'presa');
          this.layCorpse(prey);
          this.logEvent({ kind: 'death', species: prey.species, id: prey.id, cause: 'cazado', by: a.id, age: prey.age });
        }
      }

      // reproduction: a well-fed, rested adult breeds (offspring inherits
      // mutated genes, so traits drift across generations)
      if (!asleep && a.energy > def.reproduceAt && a.cooldown <= 0 && a.age > def.matureAt * 0.36 && pop[a.species] < def.cap * this.capScale) {
        a.energy *= def.reproCost;
        a.cooldown = def.cooldown;
        if (a.species === 'chicken') {
          // hens lay an egg that incubates before hatching (see hatchEggs)
          this.eggs.push({
            x: a.x + this.rng.range(-8, 8), y: a.y + this.rng.range(-8, 8),
            genes: this.childGenes(a), parent: a.id, t: 0, life: GESTATION, wobble: this.rng.range(0, 6.28),
          });
          pop.chicken++;
          this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.6, kind: 'heart', color: '#ffd166' });
          this.logEvent({ kind: 'birth', species: 'chicken', id: a.id, cause: 'huevo', parent: a.id });
        } else {
          const child = this.make(a.species, a.x + this.rng.range(-10, 10), a.y + this.rng.range(-10, 10), this.childGenes(a));
          child.energy = def.e0 * 0.7;
          newborns.push(child);
          pop[a.species]++;
          this.born++;
          this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.6, kind: 'heart', color: '#ff77aa' });
          this.logEvent({ kind: 'birth', species: a.species, id: child.id, parent: a.id });
        }
      }

      // death (natural: starvation, illness or old age)
      if (a.energy <= 0 || a.age > def.maxAge) {
        dead.add(a.id);
        pop[a.species]--;
        this.died++;
        const cause = a.age > def.maxAge ? 'vejez' : a.sick > 0 ? 'peste' : 'hambre';
        this.logEvent({ kind: 'death', species: a.species, id: a.id, cause, age: a.age });
        this.layCorpse(a);
      }
    }

    if (dead.size) this.animals = this.animals.filter((a) => !dead.has(a.id));
    if (newborns.length) this.animals.push(...newborns);

    // solid bodies: nudge any overlapping animals apart so they never share a spot
    // (no more "three-headed cows"). Deterministic — no RNG — so snapshots still match.
    this.resolveCollisions();

    // grass + grain + effects
    this.grass.regrow(dt, this.weather);
    for (let i = this.grain.length - 1; i >= 0; i--) {
      this.grain[i].amount -= 1.5 * dt; // grain slowly spoils
      if (this.grain[i].amount <= 0) this.grain.splice(i, 1);
    }
    // trees drop fruit into the world; uneaten fruit ages and eventually rots away
    this.fruitTimer += dt;
    if (this.fruitTimer >= FRUIT_DROP_EVERY) {
      this.fruitTimer = 0;
      if (this.fruits.length < FRUIT_CAP && this.trees.length) {
        const t = this.trees[(this.rng.range(0, this.trees.length)) | 0];
        this.fruits.push({
          x: t.x + this.rng.range(-14, 14) * t.scale, y: t.y + this.rng.range(-14, 14) * t.scale,
          amount: FRUIT_ENERGY, t: 0, kind: this.rng.chance(0.5) ? 'apple' : 'berry',
        });
      }
    }
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      this.fruits[i].t += dt;
      if (this.fruits[i].t >= FRUIT_ROT) this.fruits.splice(i, 1);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].t += dt;
      if (this.effects[i].t >= this.effects[i].life) this.effects.splice(i, 1);
    }
    // fallen bodies rest a while, then release a rising soul
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.t += dt;
      if (c.t >= c.life) {
        this.effects.push({ x: c.x, y: c.y, t: 0, life: 2.6, kind: 'soul', color: c.color });
        this.corpses.splice(i, 1);
      }
    }
    // eggs incubate on the ground, then hatch into a chick
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const eg = this.eggs[i];
      eg.t += dt;
      if (eg.t >= eg.life) {
        const chick = this.make('chicken', eg.x, eg.y, eg.genes);
        chick.energy = SPECIES.chicken.e0 * 0.7;
        this.animals.push(chick);
        this.born++;
        this.effects.push({ x: eg.x, y: eg.y, t: 0, life: 0.6, kind: 'birth', color: SPECIES.chicken.color });
        this.logEvent({ kind: 'birth', species: 'chicken', id: chick.id, parent: eg.parent });
        this.eggs.splice(i, 1);
      }
    }
    this.updateScavengers(dt);

    // rescue effect — a farm shouldn't die out completely
    this.rescueTimer += dt;
    if (this.rescueTimer >= 5) {
      this.rescueTimer = 0;
      // a few ducks always return to the lagoon
      if (this.pond.r > 0) {
        for (let n = this.count('duck'); n < DUCK_MIN; n++) {
          const d = this.makeDuckInPond();
          d.born = 1;
          this.animals.push(d);
          this.logEvent({ kind: 'birth', species: 'duck', id: d.id, cause: 'llegada' });
        }
      }
      for (const sp of HERBIVORES) {
        if (this.count(sp) === 0) {
          for (let i = 0; i < 2; i++) {
            const a = this.make(sp, this.rng.range(30, this.w - 30), this.rng.range(30, this.h - 30));
            a.born = 1;
            this.animals.push(a);
            this.logEvent({ kind: 'birth', species: sp, id: a.id, cause: 'llegada' });
          }
        }
      }
      // foxes wander back in from the woods when there's prey to hunt
      const herbs = this.count('chicken') + this.count('sheep') + this.count('cow');
      if (this.count('fox') < 2 && herbs > 12) {
        for (let i = 0; i < 2; i++) {
          const f = this.make('fox', this.rng.range(30, this.w - 30), this.rng.range(30, this.h - 30));
          f.born = 1;
          this.animals.push(f);
          this.logEvent({ kind: 'birth', species: 'fox', id: f.id, cause: 'llegada' });
        }
      }
    }
  }

  applyIntervention(iv: Intervention): void {
    switch (iv.kind) {
      case 'rain': this.weather = 'rain'; this.weatherTimer = 22; this.logEvent({ kind: 'divine', cause: 'lluvia' }); break;
      case 'drought': this.weather = 'drought'; this.weatherTimer = 22; this.logEvent({ kind: 'divine', cause: 'sequía' }); break;
      case 'clear': this.weather = 'clear'; this.weatherTimer = 0; this.logEvent({ kind: 'divine', cause: 'sol' }); break;
      case 'spawn': {
        const n = iv.n ?? 1;
        for (let i = 0; i < n; i++) {
          const x = iv.x ?? this.rng.range(30, this.w - 30);
          const y = iv.y ?? this.rng.range(30, this.h - 30);
          const a = this.make(iv.species, x + this.rng.range(-16, 16), y + this.rng.range(-16, 16));
          a.born = 0;
          this.animals.push(a);
          this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.5, kind: 'birth', color: SPECIES[iv.species].color });
          this.logEvent({ kind: 'birth', species: iv.species, id: a.id, cause: 'divino' });
        }
        break;
      }
      case 'blessing': {
        for (const a of this.animals) {
          const def = SPECIES[a.species];
          a.energy = Math.max(a.energy, def.reproduceAt * 1.02);
          a.cooldown = 0;
          a.sick = 0;
          this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.7, kind: 'heart', color: '#ffd166' });
        }
        this.logEvent({ kind: 'divine', cause: 'bendición' });
        break;
      }
      case 'plague': {
        let n = 0;
        for (const a of this.animals) if (this.rng.chance(0.38)) { a.sick = this.rng.range(6, 12); n++; }
        this.logEvent({ kind: 'divine', cause: 'peste', by: n });
        break;
      }
      case 'meteor': {
        const mx = iv.x ?? this.rng.range(60, this.w - 60);
        const my = iv.y ?? this.rng.range(60, this.h - 60);
        const R = 120;
        const survivors: Animal[] = [];
        for (const a of this.animals) {
          if ((a.x - mx) ** 2 + (a.y - my) ** 2 < R * R) {
            this.died++;
            this.logEvent({ kind: 'death', species: a.species, id: a.id, cause: 'meteorito', age: a.age });
            this.layCorpse(a);
          } else survivors.push(a);
        }
        this.animals = survivors;
        this.grass.scorch(mx, my, R);
        this.effects.push({ x: mx, y: my, t: 0, life: 0.6, kind: 'meteor', color: '#ff8a3d' });
        this.logEvent({ kind: 'divine', cause: 'meteorito' });
        break;
      }
      case 'feed': {
        const fx = iv.x ?? this.rng.range(40, this.w - 40);
        const fy = iv.y ?? this.rng.range(40, this.h - 40);
        for (let i = 0; i < 6; i++) {
          this.grain.push({ x: fx + this.rng.range(-26, 26), y: fy + this.rng.range(-26, 26), amount: this.rng.range(30, 55) });
        }
        this.logEvent({ kind: 'divine', cause: 'alimento' });
        break;
      }
    }
  }

  stats(): Stats {
    return {
      chicken: this.count('chicken'),
      sheep: this.count('sheep'),
      cow: this.count('cow'),
      fox: this.count('fox'),
      duck: this.count('duck'),
      scavenger: this.scavengers.length,
      grass: this.grass.coverage(),
      day: this.day,
      clock: this.clock,
      weather: this.weather,
      born: this.born,
      died: this.died,
    };
  }

  // ---- serialization: capture / restore the entire simulation state ----
  serialize(): WorldSnapshot {
    return {
      v: 1,
      w: this.w, h: this.h,
      rng: this.rng.getState(),
      nextId: this.nextId,
      clock: this.clock, day: this.day, born: this.born, died: this.died,
      capScale: this.capScale,
      weather: this.weather, weatherTimer: this.weatherTimer,
      animals: this.animals.map((a) => ({ ...a, genes: { ...a.genes } })),
      corpses: this.corpses.map((c) => ({ ...c })),
      eggs: this.eggs.map((e) => ({ ...e, genes: { ...e.genes } })),
      scavengers: this.scavengers.map((s) => ({ ...s })),
      grain: this.grain.map((g) => ({ ...g })),
      fruits: this.fruits.map((f) => ({ ...f })),
      fruitTimer: this.fruitTimer,
      grass: this.grass.toJSON(),
      events: this.events.map((e) => ({ ...e })),
      evSeq: this.evSeq,
    };
  }

  load(s: WorldSnapshot): void {
    this.w = s.w; this.h = s.h;
    this.computePond();
    this.computeTrees();
    this.rng.setState(s.rng);
    this.nextId = s.nextId;
    this.clock = s.clock; this.day = s.day; this.born = s.born; this.died = s.died;
    this.capScale = s.capScale ?? 1;
    this.weather = s.weather; this.weatherTimer = s.weatherTimer;
    this.animals = s.animals.map((a) => ({ ...a, genes: { ...a.genes } }));
    this.corpses = (s.corpses ?? []).map((c) => ({ ...c }));
    this.eggs = (s.eggs ?? []).map((e) => ({ ...e, genes: { ...e.genes } }));
    this.scavengers = (s.scavengers ?? []).map((sc) => ({ ...sc }));
    this.grain = s.grain.map((g) => ({ ...g }));
    this.fruits = (s.fruits ?? []).map((f) => ({ ...f }));
    this.fruitTimer = s.fruitTimer ?? 0;
    this.grass.load(s.grass);
    this.events = (s.events ?? []).map((e) => ({ ...e }));
    this.evSeq = s.evSeq ?? 0;
    this.effects = [];
    this.rescueTimer = 0;
  }
}
