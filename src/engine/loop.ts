import { World } from '../sim/world.ts';
import type { Intervention, WorldSnapshot } from '../sim/types.ts';
import { Renderer } from '../render/renderer.ts';
import type { IRenderer } from '../render/IRenderer.ts';
import { Store, type HistoryPoint } from './store.ts';
import { AUTOSAVE_ID, deleteSnapshot, getSnapshot, listSnapshots, putSnapshot, type SnapshotRecord } from '../persistence/db.ts';

export type RendererFactory = (canvas: HTMLCanvasElement) => IRenderer;
const default2D: RendererFactory = (c) => new Renderer(c);

// fraction of the real day (local time) — drives the sun so it's aligned to the
// actual hour of day. Independent of the sim speed (which paces the ecosystem).
function realClockFraction(): number {
  const d = new Date();
  return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000) / 86400;
}

const FIXED = 1 / 60;
const HISTORY_MAX = 200;
const AUTOSAVE_EVERY = 15; // seconds of real time

// Owns the world + renderer and drives them with a fixed-timestep accumulator.
// Publishes lightweight stats to the Store and persists state to IndexedDB.
export class Engine {
  world: World;
  renderer: IRenderer;
  store = new Store();
  private running = true;
  private speed = 1;
  private last = 0;
  private raf = 0;
  private statAcc = 0;
  private histAcc = 0;
  private autoAcc = 0;
  private history: HistoryPoint[] = [];

  constructor(private canvas: HTMLCanvasElement, makeRenderer: RendererFactory = default2D) {
    const { w, h } = this.canvasSize();
    this.world = new World(w, h, (Math.random() * 1e9) | 0);
    this.world.seed();
    this.renderer = makeRenderer(canvas);
    this.renderer.resize(w, h);
  }

  private canvasSize() {
    return { w: this.canvas.clientWidth || 1280, h: this.canvas.clientHeight || 720 };
  }

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      let real = (now - this.last) / 1000;
      this.last = now;
      if (real > 0.1) real = 0.1;
      this.world.clock = realClockFraction(); // sun follows the real hour of day
      if (this.running) {
        let dt = real * this.speed;
        while (dt > 0) {
          const step = Math.min(FIXED, dt);
          this.world.tick(step);
          dt -= step;
        }
        this.statAcc += real;
        this.histAcc += real * this.speed;
      }
      this.renderer.draw(this.world);
      if (this.statAcc >= 0.25) {
        this.statAcc = 0;
        this.store.setStats(this.world.stats(), this.history, this.world.events);
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

  setRunning(v: boolean): void {
    this.running = v;
    this.store.setRunning(v);
  }
  toggle(): void {
    this.setRunning(!this.running);
  }
  setSpeed(v: number): void {
    this.speed = v;
    this.store.setSpeed(v);
  }
  reset(): void {
    this.world.seed();
    this.history = [];
    this.renderer.reset?.();
    this.store.setStats(this.world.stats(), this.history, this.world.events);
  }
  intervene(iv: Intervention): void {
    this.world.applyIntervention(iv);
  }

  // ---- persistence ----
  private applySnapshot(snap: WorldSnapshot): void {
    this.world.load(snap);
    this.history = [];
    this.renderer.reset?.();
    this.store.setStats(this.world.stats(), this.history, this.world.events);
  }

  async saveAuto(): Promise<void> {
    try {
      await putSnapshot({ id: AUTOSAVE_ID, name: 'Sesión anterior', createdAt: Date.now(), day: this.world.day, auto: true, snapshot: this.world.serialize() });
    } catch { /* storage unavailable — keep running */ }
  }

  async restoreLast(): Promise<boolean> {
    try {
      const rec = await getSnapshot(AUTOSAVE_ID);
      if (rec && rec.snapshot?.v === 1) {
        this.applySnapshot(rec.snapshot);
        return true;
      }
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
