export type SpeciesId = 'chicken' | 'sheep' | 'cow' | 'fox' | 'duck';
export type Weather = 'clear' | 'rain' | 'drought';

export interface Genes {
  speed: number;
  sense: number;
  size: number;
}

export interface Animal {
  id: number;
  species: SpeciesId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  energy: number;
  age: number;
  genes: Genes;
  cooldown: number; // reproduction cooldown (s)
  born: number; // birth-grow animation 0..1
  flash: number; // eat / hit feedback (s)
  sick: number; // disease timer (s), 0 = healthy
  wander: number; // wander heading bias
  eating: number; // >0 while actively feeding (drives the grazing pose + munch cue)
  mealCd: number; // cooldown (s) before another meal is worth logging to its story
}

export interface Stats {
  chicken: number;
  sheep: number;
  cow: number;
  fox: number;
  duck: number; // aquatic dwellers of the lagoon — a full species now
  scavenger: number; // aerial carrion birds (buitres) — mortal, counted like the rest
  grass: number; // 0..100 (% of field covered)
  day: number;
  clock: number; // 0..1 fraction of day
  weather: Weather;
  born: number;
  died: number;
}

export type Intervention =
  | { kind: 'rain' }
  | { kind: 'clear' }
  | { kind: 'drought' }
  | { kind: 'spawn'; species: SpeciesId; x?: number; y?: number; n?: number }
  | { kind: 'blessing' }
  | { kind: 'plague' }
  | { kind: 'meteor'; x?: number; y?: number }
  | { kind: 'feed'; x?: number; y?: number };

export type LifeEventKind = 'birth' | 'death' | 'divine' | 'meal' | 'milestone';

// One entry in the world's log — a life story is the events sharing an `id`.
export interface LifeEvent {
  seq: number; // monotonic order
  clock: number; // time-of-day fraction when it happened
  kind: LifeEventKind;
  species?: SpeciesId;
  id?: number; // the entity this is about
  cause?: string; // deaths: 'hambre'|'vejez'|'cazado'|'peste'|'meteorito'; births/divine: origin
  parent?: number; // births by reproduction
  by?: number; // hunted: the predator
  age?: number; // deaths: age reached (s)
}

export interface WorldSnapshot {
  v: 1;
  w: number;
  h: number;
  rng: number;
  nextId: number;
  clock: number;
  day: number;
  born: number;
  died: number;
  capScale: number;
  weather: Weather;
  weatherTimer: number;
  animals: Animal[];
  corpses: Corpse[];
  eggs: Egg[];
  scavengers: Scavenger[];
  grain: Grain[];
  fruits: Fruit[];
  fruitTimer: number;
  grass: import('./grass.ts').GrassSnapshot;
  events: LifeEvent[];
  evSeq: number;
}

export interface Grain {
  x: number;
  y: number;
  amount: number;
}

// A fruit fallen from a tree (apple/berry) — real edible food in the environment,
// for animals that don't live on grass. Falls, rests, and rots if not eaten.
export interface Fruit {
  x: number;
  y: number;
  amount: number; // energy it provides
  t: number; // age (s) — drives the fall animation, then the rot timeout
  kind: 'apple' | 'berry';
}

// A chicken egg incubating on the ground before it hatches into a chick.
// Counts toward the chicken cap while it waits, so the population stays bounded.
export interface Egg {
  x: number;
  y: number;
  genes: Genes; // inherited by the chick that hatches
  parent: number;
  t: number; // incubation elapsed (s)
  life: number; // gestation time (s)
  wobble: number; // phase for the pre-hatch wobble
}

// An aerial scavenger (buitre): circles overhead, dives to devour a corpse
// before its soul can rise, and is itself mortal (ages and starves).
export interface Scavenger {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  h: number; // height above the terrain (world px); high = cruising, low = feeding
  energy: number;
  age: number;
  state: 'cruise' | 'dive' | 'feed';
  feedT: number; // seconds spent feeding on the current corpse
  flap: number; // wing-flap phase
}

export interface Effect {
  x: number;
  y: number;
  t: number;
  life: number;
  kind: 'birth' | 'death' | 'meteor' | 'heart' | 'soul';
  color: string;
}

// A fallen animal lying on the ground: it rests here (rendered grey) for a few
// seconds of mourning before its soul rises. Kept apart from `animals` so it
// never counts toward population, caps, predation or stats.
export interface Corpse {
  species: SpeciesId;
  x: number;
  y: number;
  heading: number;
  size: number; // genes.size at death — for render scale
  born: number; // grow value at death (≈1 for adults)
  age: number; // age at death — for growth-scaled render
  t: number; // elapsed seconds lying down
  life: number; // how long it lies before the soul rises
  color: string;
}
