import type { SpeciesId } from './types.ts';

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
  maxAge: number; // seconds
  cap: number; // soft carrying capacity (stops breeding above this)
  preys: SpeciesId[]; // what it hunts (carnivore)
  fleesFrom: SpeciesId[]; // what it runs from
  catchEnergy: number; // energy gained per kill (carnivore)
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  chicken: {
    id: 'chicken', label: 'Gallinas', emoji: '🐔', diet: 'herbivore', color: '#f4d35e',
    e0: 55, speed: 62, sense: 78, size: 6, metabolism: 2.8, moveCost: 0.03,
    grazeGain: 18, reproduceAt: 108, reproCost: 0.5, cooldown: 9, maxAge: 70, cap: 80,
    preys: [], fleesFrom: ['fox'], catchEnergy: 0,
  },
  sheep: {
    id: 'sheep', label: 'Ovejas', emoji: '🐑', diet: 'herbivore', color: '#eef0f2',
    e0: 90, speed: 46, sense: 84, size: 10, metabolism: 2.8, moveCost: 0.03,
    grazeGain: 28, reproduceAt: 135, reproCost: 0.5, cooldown: 13, maxAge: 100, cap: 46,
    preys: [], fleesFrom: ['fox'], catchEnergy: 0,
  },
  cow: {
    id: 'cow', label: 'Vacas', emoji: '🐄', diet: 'herbivore', color: '#d8dde1',
    e0: 150, speed: 34, sense: 76, size: 15, metabolism: 3.2, moveCost: 0.035,
    grazeGain: 36, reproduceAt: 250, reproCost: 0.5, cooldown: 22, maxAge: 135, cap: 24,
    preys: [], fleesFrom: [], catchEnergy: 0,
  },
  fox: {
    id: 'fox', label: 'Zorros', emoji: '🦊', diet: 'carnivore', color: '#e8712f',
    e0: 130, speed: 88, sense: 112, size: 8, metabolism: 4.4, moveCost: 0.04,
    grazeGain: 0, reproduceAt: 210, reproCost: 0.5, cooldown: 20, maxAge: 105, cap: 34,
    preys: ['chicken'], fleesFrom: [], catchEnergy: 72,
  },
};

export const HERBIVORES: SpeciesId[] = ['chicken', 'sheep', 'cow'];
