import type { Genes, LifeEvent, SpeciesId, Stats } from '../sim/types.ts';

export type HistoryPoint = { chicken: number; sheep: number; cow: number; fox: number; grass: number };

export interface SelectedInfo {
  id: number;
  species: SpeciesId;
  alive: boolean;
  age?: number;
  energy?: number;
  genes?: Genes;
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
}

const EMPTY_STATS: Stats = {
  chicken: 0, sheep: 0, cow: 0, fox: 0, grass: 0, day: 1, clock: 0.5, weather: 'clear', born: 0, died: 0,
};

// Minimal external store compatible with React's useSyncExternalStore.
export class Store {
  private state: UIState = {
    stats: EMPTY_STATS, history: [], events: [], running: true, speed: 1,
    terrainSize: 1, density: 1, selected: null,
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

  setFrame(stats: Stats, history: HistoryPoint[], events: LifeEvent[], selected: SelectedInfo | null): void {
    this.emit({ stats, history, events, selected });
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
