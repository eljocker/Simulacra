import type { Animal, Effect, Grain, Intervention, SpeciesId, Stats, Weather } from './types.ts';
import { SPECIES, HERBIVORES } from './species.ts';
import { RNG } from './rng.ts';
import { SpatialGrid } from './grid.ts';
import { GrassField } from './grass.ts';
import { steer, type BehaviorCtx } from './behavior.ts';

const DAY_LENGTH = 96; // seconds per in-sim day

export class World {
  w: number;
  h: number;
  rng: RNG;
  animals: Animal[] = [];
  grass: GrassField;
  grain: Grain[] = [];
  effects: Effect[] = [];
  weather: Weather = 'clear';
  weatherTimer = 0;
  clock = 0.25; // start mid-morning
  day = 1;
  born = 0;
  died = 0;
  private nextId = 1;
  private rescueTimer = 0;

  constructor(w: number, h: number, seed = 1) {
    this.w = w;
    this.h = h;
    this.rng = new RNG(seed);
    this.grass = new GrassField(w, h);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
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
    this.grain = [];
    this.effects = [];
    this.grass.seed(this.rng);
    this.weather = 'clear';
    this.weatherTimer = 0;
    this.clock = 0.25;
    this.day = 1;
    this.born = 0;
    this.died = 0;
    const start: [SpeciesId, number][] = [['chicken', 14], ['sheep', 8], ['cow', 4], ['fox', 3]];
    for (const [sp, n] of start) {
      for (let i = 0; i < n; i++) {
        const a = this.make(sp, this.rng.range(40, this.w - 40), this.rng.range(40, this.h - 40));
        a.born = 1;
        a.age = this.rng.range(5, 30);
        this.animals.push(a);
      }
    }
  }

  private make(species: SpeciesId, x: number, y: number, genes?: Animal['genes']): Animal {
    const def = SPECIES[species];
    const g = genes ?? { speed: def.speed, sense: def.sense, size: def.size };
    return {
      id: this.nextId++, species, x, y, vx: 0, vy: 0, heading: this.rng.range(0, 6.28),
      energy: def.e0, age: 0, genes: g, cooldown: def.cooldown * 0.5,
      born: 0, flash: 0, sick: 0, wander: this.rng.range(0, 6.28),
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
    // smooth darkness: full night ~clock 0.85..0.12
    const c = this.clock;
    if (c > 0.80) return Math.min(1, (c - 0.80) / 0.08);
    if (c < 0.16) return Math.min(1, (0.16 - c) / 0.08);
    return 0;
  }

  tick(dt: number): void {
    // clock + weather
    this.clock += dt / DAY_LENGTH;
    if (this.clock >= 1) { this.clock -= 1; this.day++; }
    if (this.weatherTimer > 0) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) this.weather = 'clear';
    }
    const night = this.nightFactor();

    // perception grid
    const grid = new SpatialGrid(this.w, this.h, 96);
    for (const a of this.animals) grid.insert(a);

    const ctx: BehaviorCtx = { grid, grass: this.grass, grain: this.grain, rng: this.rng, dt, night, w: this.w, h: this.h };

    const newborns: Animal[] = [];
    const dead = new Set<number>();

    // live per-species population, kept accurate through the tick so soft caps
    // can't be overshot by many simultaneous births in one step
    const pop: Record<SpeciesId, number> = { chicken: 0, sheep: 0, cow: 0, fox: 0 };
    for (const a of this.animals) pop[a.species]++;

    for (const a of this.animals) {
      if (dead.has(a.id)) continue;
      const def = SPECIES[a.species];
      a.age += dt;
      a.cooldown -= dt;
      if (a.born < 1) a.born = Math.min(1, a.born + dt * 2.5);
      if (a.flash > 0) a.flash -= dt;
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
      if (a.vx || a.vy) a.heading = Math.atan2(a.vy, a.vx);

      const speed = Math.hypot(a.vx, a.vy);
      a.energy -= (def.metabolism + def.moveCost * speed + (a.sick > 0 ? 2.4 : 0)) * dt;

      if (def.diet === 'herbivore') {
        // graze grass under feet
        const eaten = this.grass.graze(a.x, a.y, 1.4 * dt);
        if (eaten > 0) a.energy += eaten * def.grazeGain;
        // eat grain if close
        for (let i = this.grain.length - 1; i >= 0; i--) {
          const gr = this.grain[i];
          if ((gr.x - a.x) ** 2 + (gr.y - a.y) ** 2 < (a.genes.size + 8) ** 2) {
            const take = Math.min(gr.amount, 26);
            gr.amount -= take;
            a.energy += take;
            a.flash = 0.25;
            if (gr.amount <= 0) this.grain.splice(i, 1);
            break;
          }
        }
      } else {
        // hunt
        const prey = grid.nearest(a.x, a.y, a.genes.size + 9, (o) => def.preys.includes(o.species) && !dead.has(o.id), a);
        if (prey) {
          dead.add(prey.id);
          pop[prey.species]--;
          a.energy += def.catchEnergy;
          a.flash = 0.3;
          this.effects.push({ x: prey.x, y: prey.y, t: 0, life: 0.5, kind: 'death', color: SPECIES[prey.species].color });
        }
      }

      // reproduction: a well-fed, rested adult breeds (offspring inherits
      // mutated genes, so traits drift across generations)
      if (a.energy > def.reproduceAt && a.cooldown <= 0 && a.age > def.maxAge * 0.1 && pop[a.species] < def.cap) {
        a.energy *= def.reproCost;
        a.cooldown = def.cooldown;
        const child = this.make(a.species, a.x + this.rng.range(-10, 10), a.y + this.rng.range(-10, 10), this.childGenes(a));
        child.energy = def.e0 * 0.7;
        newborns.push(child);
        pop[a.species]++;
        this.born++;
        this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.6, kind: 'heart', color: '#ff77aa' });
      }

      // death
      if (a.energy <= 0 || a.age > def.maxAge) {
        dead.add(a.id);
        pop[a.species]--;
        this.died++;
        this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.5, kind: 'death', color: def.color });
      }
    }

    if (dead.size) this.animals = this.animals.filter((a) => !dead.has(a.id));
    if (newborns.length) this.animals.push(...newborns);

    // grass + grain + effects
    this.grass.regrow(dt, this.weather);
    for (let i = this.grain.length - 1; i >= 0; i--) {
      this.grain[i].amount -= 1.5 * dt; // grain slowly spoils
      if (this.grain[i].amount <= 0) this.grain.splice(i, 1);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].t += dt;
      if (this.effects[i].t >= this.effects[i].life) this.effects.splice(i, 1);
    }

    // rescue effect — a farm shouldn't die out completely
    this.rescueTimer += dt;
    if (this.rescueTimer >= 5) {
      this.rescueTimer = 0;
      for (const sp of HERBIVORES) {
        if (this.count(sp) === 0) {
          for (let i = 0; i < 2; i++) {
            const a = this.make(sp, this.rng.range(30, this.w - 30), this.rng.range(30, this.h - 30));
            a.born = 1;
            this.animals.push(a);
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
        }
      }
    }
  }

  applyIntervention(iv: Intervention): void {
    switch (iv.kind) {
      case 'rain': this.weather = 'rain'; this.weatherTimer = 22; break;
      case 'drought': this.weather = 'drought'; this.weatherTimer = 22; break;
      case 'clear': this.weather = 'clear'; this.weatherTimer = 0; break;
      case 'spawn': {
        const n = iv.n ?? 1;
        for (let i = 0; i < n; i++) {
          const x = iv.x ?? this.rng.range(30, this.w - 30);
          const y = iv.y ?? this.rng.range(30, this.h - 30);
          const a = this.make(iv.species, x + this.rng.range(-16, 16), y + this.rng.range(-16, 16));
          a.born = 0;
          this.animals.push(a);
          this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.5, kind: 'birth', color: SPECIES[iv.species].color });
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
        break;
      }
      case 'plague': {
        for (const a of this.animals) if (this.rng.chance(0.38)) a.sick = this.rng.range(6, 12);
        break;
      }
      case 'meteor': {
        const R = 120;
        for (const a of this.animals) {
          if ((a.x - iv.x) ** 2 + (a.y - iv.y) ** 2 < R * R) {
            a.energy = -1;
          }
        }
        this.grass.scorch(iv.x, iv.y, R);
        this.effects.push({ x: iv.x, y: iv.y, t: 0, life: 0.6, kind: 'meteor', color: '#ff8a3d' });
        break;
      }
      case 'feed': {
        for (let i = 0; i < 6; i++) {
          this.grain.push({ x: iv.x + this.rng.range(-26, 26), y: iv.y + this.rng.range(-26, 26), amount: this.rng.range(30, 55) });
        }
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
      grass: this.grass.coverage(),
      day: this.day,
      clock: this.clock,
      weather: this.weather,
      born: this.born,
      died: this.died,
    };
  }
}
