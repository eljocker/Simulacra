import type { SpeciesId } from './types.ts';
import { SECONDS_PER_YEAR } from './time.ts';

export interface SpeciesDef {
  id: SpeciesId;
  label: string;
  emoji: string;
  diet: 'herbivore' | 'carnivore';
  color: string;
  e0: number; // starting energy
  speed: number; // px/s
  sense: number; // perception radius (px)
  size: number; // draw radius
  metabolism: number; // energy/s baseline
  moveCost: number; // extra energy per unit speed
  grazeGain: number; // energy per unit of grass eaten
  reproduceAt: number; // energy threshold to breed
  reproCost: number; // fraction of energy passed to child
  cooldown: number; // seconds between births
  maxAge: number; // lifespan in sim-seconds (derived from a realistic span in years)
  matureAt: number; // sim-seconds to reach adult size & breeding age — kept SHORT and
  // independent of maxAge, so long lifespans don't leave animals tiny or infertile
  cap: number; // soft carrying capacity (stops breeding above this)
  preys: SpeciesId[]; // what it hunts (carnivore)
  fleesFrom: SpeciesId[]; // what it runs from
  catchEnergy: number; // energy gained per kill (carnivore)
  flocks?: boolean; // tends to gather in flocks when idle (boids)
  home?: [number, number]; // preferred habitat centre (fraction of field w,h) — a gentle resting pull
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  chicken: {
    id: 'chicken', label: 'Gallinas', emoji: '🐔', diet: 'herbivore', color: '#f4d35e',
    e0: 55, speed: 62, sense: 78, size: 6, metabolism: 2.8, moveCost: 0.03,
    grazeGain: 18, reproduceAt: 108, reproCost: 0.5, cooldown: 9, maxAge: 6 * SECONDS_PER_YEAR, matureAt: 40, cap: 80,
    preys: [], fleesFrom: ['fox'], catchEnergy: 0, flocks: true, home: [0.56, 0.16],
  },
  sheep: {
    id: 'sheep', label: 'Ovejas', emoji: '🐑', diet: 'herbivore', color: '#eef0f2',
    e0: 90, speed: 46, sense: 84, size: 10, metabolism: 2.8, moveCost: 0.03,
    grazeGain: 28, reproduceAt: 135, reproCost: 0.5, cooldown: 13, maxAge: 11 * SECONDS_PER_YEAR, matureAt: 74, cap: 46,
    preys: [], fleesFrom: ['fox'], catchEnergy: 0, flocks: true, home: [0.28, 0.62],
  },
  cow: {
    id: 'cow', label: 'Vacas', emoji: '🐄', diet: 'herbivore', color: '#d8dde1',
    e0: 150, speed: 34, sense: 76, size: 15, metabolism: 3.2, moveCost: 0.035,
    grazeGain: 36, reproduceAt: 250, reproCost: 0.5, cooldown: 22, maxAge: 18 * SECONDS_PER_YEAR, matureAt: 121, cap: 24,
    preys: [], fleesFrom: [], catchEnergy: 0, home: [0.72, 0.48],
  },
  fox: {
    id: 'fox', label: 'Zorros', emoji: '🦊', diet: 'carnivore', color: '#e8712f',
    e0: 130, speed: 88, sense: 112, size: 8, metabolism: 4.4, moveCost: 0.04,
    grazeGain: 0, reproduceAt: 210, reproCost: 0.5, cooldown: 20, maxAge: 4 * SECONDS_PER_YEAR, matureAt: 27, cap: 34,
    preys: ['chicken'], fleesFrom: [], catchEnergy: 72,
  },
  duck: {
    id: 'duck', label: 'Patos', emoji: '🦆', diet: 'herbivore', color: '#f1eee4',
    e0: 70, speed: 26, sense: 70, size: 8, metabolism: 2.2, moveCost: 0.03,
    grazeGain: 0, reproduceAt: 120, reproCost: 0.5, cooldown: 16, maxAge: 8 * SECONDS_PER_YEAR, matureAt: 55, cap: 14,
    preys: [], fleesFrom: [], catchEnergy: 0, // dabbles in the lagoon; safe from foxes on the water
  },
};

export const HERBIVORES: SpeciesId[] = ['chicken', 'sheep', 'cow'];

// Juveniles are born small and grow to full size by adulthood, then hold.
// PURE function of age, so snapshots stay deterministic. Drives render scale, the
// Ficha ability bars, AND sim speed/sense — a juvenile is small, slow and less
// perceptive, growing into its full genetic potential as it matures.
const NEWBORN_SCALE = 0.5; // fraction of adult size (and ability) at birth
export function growthFactor(species: SpeciesId, age: number): number {
  const mature = SPECIES[species].matureAt; // reaches adult size at maturity (independent of lifespan)
  const t = Math.max(0, Math.min(1, age / mature));
  const eased = t * (2 - t); // ease-out: fast early, tapering into adulthood
  return NEWBORN_SCALE + (1 - NEWBORN_SCALE) * eased;
}

// How full a creature is, 0..1, relative to its own breeding-full energy — so the
// Ficha shows hunger meaningfully across species with very different energy scales.
export function fullness(species: SpeciesId, energy: number): number {
  return Math.max(0, Math.min(1, energy / SPECIES[species].reproduceAt));
}

// A human hunger label for the Ficha, from the fullness above.
export function hungerLabel(species: SpeciesId, energy: number): { label: string; emoji: string; tone: 'ok' | 'low' | 'crit' } {
  const f = fullness(species, energy);
  if (f > 0.7) return { label: 'Bien alimentado', emoji: '😌', tone: 'ok' };
  if (f > 0.4) return { label: 'Buscando comida', emoji: '🌾', tone: 'ok' };
  if (f > 0.18) return { label: 'Con hambre', emoji: '😟', tone: 'low' };
  return { label: 'Hambriento', emoji: '⚠️', tone: 'crit' };
}

// A human label for how grown a creature is (for the Ficha).
export function lifeStage(species: SpeciesId, age: number): { label: string; emoji: string } {
  const g = growthFactor(species, age);
  if (g < 0.72) return { label: 'Cría', emoji: '🐣' };
  if (g < 0.995) return { label: 'Joven', emoji: '🌱' };
  return { label: 'Adulto', emoji: '🌳' };
}
