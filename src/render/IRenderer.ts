import type { World } from '../sim/world.ts';

// Contract every renderer honours. The engine talks only to this, so the
// simulation core (src/sim) is reused unchanged whether we draw with 2D
// canvas or 3D WebGL. Swapping renderers is a one-line change.
export interface IRenderer {
  resize(w: number, h: number): void;
  draw(world: World): void;
  reset?(): void; // rebuild scenery after a world reset/snapshot load
  setPickHandler?(cb: (id: number | null) => void): void; // click-to-select an animal
  setSelected?(id: number | null): void; // highlight + track an entity with a placemark
  setZoom?(zoom: number): void; // camera zoom factor (1 = whole field framed)
  setSector?(sector: { name: string; cx: number; cy: number; r: number } | null): void; // highlight a map region
  dispose?(): void;
}
