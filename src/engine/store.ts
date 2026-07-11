import type { Genes, LifeEvent, Scavenger, SpeciesId, Stats } from '../sim/types.ts';

export type HistoryPoint = { chicken: number; sheep: number; cow: number; fox: number; grass: number };

// Everything the HUD can list and select: the four species plus the aerial
// scavenger, which isn't a grazing species but is a countable, selectable creature.
export type EntityKind = SpeciesId | 'scavenger';

// One line in an expandable HUD group — enough to render a compact roster row.
export interface RosterEntry {
  id: number;
  f: number; // fullness 0..1 (energy relative to its own breeding-full)
  age: number;
}

export type Roster = Record<EntityKind, RosterEntry[]>;

export interface SelectedInfo {
  id: number;
  species: EntityKind;
  alive: boolean;
  age?: number;
  energy?: number;
  genes?: Genes;
  eating?: boolean;
  state?: Scavenger['state']; // scavengers only: cruise | dive | feed
}

export interface UIState {
  stats: Stats;
  history: HistoryPoint[];
  events: LifeEvent[];
  running: boolean;
  speed: number;
  terrainSize: number;
  density: number;
  selected: SelectedInfo | null;
  roster: Roster;
}

const EMPTY_STATS: Stats = {
  chicken: 0, sheep: 0, cow: 0, fox: 0, scavenger: 0, grass: 0, day: 1, clock: 0.5, weather: 'clear', born: 0, died: 0,
};

const EMPTY_ROSTER: Roster = { chicken: [], sheep: [], cow: [], fox: [], scavenger: [] };

// Minimal external store compatible with React's useSyncExternalStore.
export class Store {
  private state: UIState = {
    stats: EMPTY_STATS, history: [], events: [], running: true, speed: 1,
    terrainSize: 1, density: 1, selected: null, roster: EMPTY_ROSTER,
  };
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): UIState => this.state;

  private emit(next: Partial<UIState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setFrame(stats: Stats, history: HistoryPoint[], events: LifeEvent[], selected: SelectedInfo | null, roster: Roster): void {
    this.emit({ stats, history, events, selected, roster });
  }
  setWorldCfg(terrainSize: number, density: number): void {
    this.emit({ terrainSize, density });
  }
  setRunning(running: boolean): void {
    this.emit({ running });
  }
  setSpeed(speed: number): void {
    this.emit({ speed });
  }
}
