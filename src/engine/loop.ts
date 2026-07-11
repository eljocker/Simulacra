import { World, SCAV_REPRO_AT } from '../sim/world.ts';
import type { Intervention, WorldSnapshot } from '../sim/types.ts';
import { Renderer } from '../render/renderer.ts';
import type { IRenderer } from '../render/IRenderer.ts';
import { fullness } from '../sim/species.ts';
import { Store, type EntityKind, type HistoryPoint, type Roster, type SelectedInfo } from './store.ts';
import { AUTOSAVE_ID, deleteSnapshot, getSnapshot, listSnapshots, putSnapshot, type SnapshotRecord } from '../persistence/db.ts';

export type RendererFactory = (canvas: HTMLCanvasElement) => IRenderer;
const default2D: RendererFactory = (c) => new Renderer(c);

const FIXED = 1 / 60;
const HISTORY_MAX = 200;
const AUTOSAVE_EVERY = 15;
const PACE = 0.6; // global calm factor: 1× runs the ecosystem at this fraction of real time
const BASE_AREA = 1152 * 720; // reference terrain area for density = 1

export class Engine {
  world: World;
  renderer: IRenderer;
  store = new Store();
  private running = true;
  private speed = 1;
  private terrainSize = 1;
  private density = 1;
  private selected: { id: number; species: EntityKind } | null = null;
  private last = 0;
  private raf = 0;
  private statAcc = 0;
  private histAcc = 0;
  private autoAcc = 0;
  private history: HistoryPoint[] = [];

  constructor(private canvas: HTMLCanvasElement, makeRenderer: RendererFactory = default2D) {
    const { w, h } = this.baseDims();
    this.world = new World(w, h, (Math.random() * 1e9) | 0);
    this.world.capScale = this.capScale(w, h);
    this.world.seed();
    this.renderer = makeRenderer(canvas);
    this.renderer.resize(this.canvasSize().w, this.canvasSize().h);
    this.renderer.setPickHandler?.((id) => this.select(id));
    this.store.setWorldCfg(this.terrainSize, this.density);
  }

  private canvasSize() {
    return { w: this.canvas.clientWidth || 1280, h: this.canvas.clientHeight || 720 };
  }
  private baseDims() {
    const { w, h } = this.canvasSize();
    const asp = w / h;
    return { w: 720 * asp * this.terrainSize, h: 720 * this.terrainSize };
  }
  private capScale(w: number, h: number): number {
    return this.density * (w * h) / BASE_AREA;
  }

  private selectedInfo(): SelectedInfo | null {
    if (!this.selected) return null;
    if (this.selected.species === 'scavenger') {
      const s = this.world.scavengers.find((x) => x.id === this.selected!.id);
      if (s) return { id: s.id, species: 'scavenger', alive: true, age: s.age, energy: s.energy, state: s.state };
      return { id: this.selected.id, species: 'scavenger', alive: false };
    }
    const a = this.world.animals.find((x) => x.id === this.selected!.id);
    if (a) return { id: a.id, species: a.species, alive: true, age: a.age, energy: a.energy, genes: { ...a.genes }, eating: a.eating > 0 };
    return { id: this.selected.id, species: this.selected.species, alive: false };
  }

  // A compact, id-sorted roster per kind so the HUD can expand a group and let
  // the user pick one individual out of the herd.
  private roster(): Roster {
    const r: Roster = { chicken: [], sheep: [], cow: [], fox: [], scavenger: [] };
    for (const a of this.world.animals) r[a.species].push({ id: a.id, f: fullness(a.species, a.energy), age: a.age });
    for (const s of this.world.scavengers) {
      r.scavenger.push({ id: s.id, f: Math.max(0, Math.min(1, s.energy / SCAV_REPRO_AT)), age: s.age });
    }
    for (const k of Object.keys(r) as EntityKind[]) r[k].sort((a, b) => a.id - b.id);
    return r;
  }

  private pushStats(): void {
    this.store.setFrame(this.world.stats(), this.history, this.world.events, this.selectedInfo(), this.roster());
  }

  select(id: number | null): void {
    if (id == null) { this.selected = null; }
    else {
      const a = this.world.animals.find((x) => x.id === id);
      if (a) this.selected = { id: a.id, species: a.species };
      else {
        const s = this.world.scavengers.find((x) => x.id === id);
        this.selected = s ? { id: s.id, species: 'scavenger' } : null;
      }
    }
    this.renderer.setSelected?.(this.selected?.id ?? null);
    this.pushStats();
  }

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      let real = (now - this.last) / 1000;
      this.last = now;
      if (real > 0.1) real = 0.1;
      if (this.running) {
        let dt = real * this.speed * PACE;
        while (dt > 0) {
          const step = Math.min(FIXED, dt);
          this.world.tick(step);
          dt -= step;
        }
        this.statAcc += real;
        this.histAcc += real * this.speed;
      }
      this.renderer.draw(this.world);
      if (this.statAcc >= 0.2) {
        this.statAcc = 0;
        this.pushStats();
      }
      if (this.histAcc >= 1) {
        this.histAcc = 0;
        const s = this.world.stats();
        this.history.push({ chicken: s.chicken, sheep: s.sheep, cow: s.cow, fox: s.fox, grass: s.grass });
        if (this.history.length > HISTORY_MAX) this.history.shift();
      }
      this.autoAcc += real;
      if (this.autoAcc >= AUTOSAVE_EVERY) {
        this.autoAcc = 0;
        void this.saveAuto();
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
  resize(): void {
    const { w, h } = this.canvasSize();
    this.renderer.resize(w, h);
  }
  setRunning(v: boolean): void { this.running = v; this.store.setRunning(v); }
  toggle(): void { this.setRunning(!this.running); }
  setSpeed(v: number): void { this.speed = v; this.store.setSpeed(v); }

  private reconfigure(): void {
    const { w, h } = this.baseDims();
    this.world.resize(w, h);
    this.world.capScale = this.capScale(w, h);
    this.world.seed();
    this.history = [];
    this.selected = null;
    this.renderer.setSelected?.(null);
    this.renderer.reset?.();
    this.store.setWorldCfg(this.terrainSize, this.density);
    this.pushStats();
  }
  setTerrainSize(v: number): void { this.terrainSize = v; this.reconfigure(); }
  setDensity(v: number): void { this.density = v; this.reconfigure(); }

  reset(): void {
    this.world.seed();
    this.history = [];
    this.selected = null;
    this.renderer.setSelected?.(null);
    this.renderer.reset?.();
    this.pushStats();
  }
  intervene(iv: Intervention): void {
    this.world.applyIntervention(iv);
  }

  // ---- persistence ----
  private applySnapshot(snap: WorldSnapshot): void {
    this.world.load(snap);
    this.terrainSize = Math.max(this.terrainSize, 1); // keep UI factor; caps come from snapshot
    this.history = [];
    this.selected = null;
    this.renderer.setSelected?.(null);
    this.renderer.reset?.();
    this.pushStats();
  }
  async saveAuto(): Promise<void> {
    try {
      await putSnapshot({ id: AUTOSAVE_ID, name: 'Sesión anterior', createdAt: Date.now(), day: this.world.day, auto: true, snapshot: this.world.serialize() });
    } catch { /* storage unavailable */ }
  }
  async restoreLast(): Promise<boolean> {
    try {
      const rec = await getSnapshot(AUTOSAVE_ID);
      if (rec && rec.snapshot?.v === 1) { this.applySnapshot(rec.snapshot); return true; }
    } catch { /* ignore */ }
    return false;
  }
  async saveNamed(name: string): Promise<void> {
    const id = (crypto.randomUUID?.() ?? String(Date.now() + Math.random()));
    await putSnapshot({ id, name, createdAt: Date.now(), day: this.world.day, snapshot: this.world.serialize() });
  }
  async listSaved(): Promise<SnapshotRecord[]> {
    try { return await listSnapshots(); } catch { return []; }
  }
  async loadSaved(id: string): Promise<void> {
    const rec = await getSnapshot(id);
    if (rec && rec.snapshot?.v === 1) this.applySnapshot(rec.snapshot);
  }
  async deleteSaved(id: string): Promise<void> {
    await deleteSnapshot(id);
  }
}
