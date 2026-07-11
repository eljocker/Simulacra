import type { Animal, Effect, Grain, Intervention, LifeEvent, SpeciesId, Stats, Weather, WorldSnapshot } from './types.ts';
import { SPECIES, HERBIVORES } from './species.ts';
import { RNG } from './rng.ts';
import { SpatialGrid } from './grid.ts';
import { GrassField } from './grass.ts';
import { steer, type BehaviorCtx } from './behavior.ts';

const EVENT_CAP = 300;

export class World {
  w: number;
  h: number;
  rng: RNG;
  animals: Animal[] = [];
  grass: GrassField;
  grain: Grain[] = [];
  effects: Effect[] = [];
  events: LifeEvent[] = []; // the world's log book (newest at the end)
  weather: Weather = 'clear';
  weatherTimer = 0;
  clock = 0.5; // time-of-day fraction; the engine drives it from the real clock
  day = 1;
  born = 0;
  died = 0;
  capScale = 1; // population scaling from terrain size × density (set by the engine)
  private nextId = 1;
  private evSeq = 0;
  private rescueTimer = 0;

  private logEvent(e: Omit<LifeEvent, 'seq' | 'clock'>): void {
    this.events.push({ seq: this.evSeq++, clock: this.clock, ...e });
    if (this.events.length > EVENT_CAP) this.events.shift();
  }

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
    // darkness follows the sun's height, so night and the sun are always in sync
    const elev = Math.sin(this.clock * Math.PI * 2 - Math.PI / 2);
    return Math.max(0, Math.min(1, (0.12 - elev) / 0.24));
  }

  tick(dt: number): void {
    // clock is set externally (real time); here we only run weather + ecosystem
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
          this.died++;
          a.energy += def.catchEnergy;
          a.flash = 0.3;
          this.effects.push({ x: prey.x, y: prey.y, t: 0, life: 2.6, kind: 'soul', color: SPECIES[prey.species].color });
          this.logEvent({ kind: 'death', species: prey.species, id: prey.id, cause: 'cazado', by: a.id, age: prey.age });
        }
      }

      // reproduction: a well-fed, rested adult breeds (offspring inherits
      // mutated genes, so traits drift across generations)
      if (a.energy > def.reproduceAt && a.cooldown <= 0 && a.age > def.maxAge * 0.1 && pop[a.species] < def.cap * this.capScale) {
        a.energy *= def.reproCost;
        a.cooldown = def.cooldown;
        const child = this.make(a.species, a.x + this.rng.range(-10, 10), a.y + this.rng.range(-10, 10), this.childGenes(a));
        child.energy = def.e0 * 0.7;
        newborns.push(child);
        pop[a.species]++;
        this.born++;
        this.effects.push({ x: a.x, y: a.y, t: 0, life: 0.6, kind: 'heart', color: '#ff77aa' });
        this.logEvent({ kind: 'birth', species: a.species, id: child.id, parent: a.id });
      }

      // death (natural: starvation, illness or old age)
      if (a.energy <= 0 || a.age > def.maxAge) {
        dead.add(a.id);
        pop[a.species]--;
        this.died++;
        const cause = a.age > def.maxAge ? 'vejez' : a.sick > 0 ? 'peste' : 'hambre';
        this.logEvent({ kind: 'death', species: a.species, id: a.id, cause, age: a.age });
        this.effects.push({ x: a.x, y: a.y, t: 0, life: 2.6, kind: 'soul', color: def.color });
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
            this.effects.push({ x: a.x, y: a.y, t: 0, life: 2.6, kind: 'soul', color: SPECIES[a.species].color });
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
      grain: this.grain.map((g) => ({ ...g })),
      grass: this.grass.toJSON(),
      events: this.events.map((e) => ({ ...e })),
      evSeq: this.evSeq,
    };
  }

  load(s: WorldSnapshot): void {
    this.w = s.w; this.h = s.h;
    this.rng.setState(s.rng);
    this.nextId = s.nextId;
    this.clock = s.clock; this.day = s.day; this.born = s.born; this.died = s.died;
    this.capScale = s.capScale ?? 1;
    this.weather = s.weather; this.weatherTimer = s.weatherTimer;
    this.animals = s.animals.map((a) => ({ ...a, genes: { ...a.genes } }));
    this.grain = s.grain.map((g) => ({ ...g }));
    this.grass.load(s.grass);
    this.events = (s.events ?? []).map((e) => ({ ...e }));
    this.evSeq = s.evSeq ?? 0;
    this.effects = [];
    this.rescueTimer = 0;
  }
}
