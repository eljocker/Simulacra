export type SpeciesId = 'chicken' | 'sheep' | 'cow' | 'fox';
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
}

export interface Stats {
  chicken: number;
  sheep: number;
  cow: number;
  fox: number;
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
  | { kind: 'meteor'; x: number; y: number }
  | { kind: 'feed'; x: number; y: number };

export interface Grain {
  x: number;
  y: number;
  amount: number;
}

export interface Effect {
  x: number;
  y: number;
  t: number;
  life: number;
  kind: 'birth' | 'death' | 'meteor' | 'heart';
  color: string;
}
