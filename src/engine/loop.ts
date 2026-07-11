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
const KEYFRAME_EVERY = 1.5; // sim-seconds between rewind keyframes
const KEYFRAME_MAX = 220; // ~330 sim-sec of history (≈5.5 min at 1×)

// a captured moment for the rewind buffer
type Keyframe = { day: number; clock: number; snap: WorldSnapshot };

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

  // rewind (read-only "view the past") — a real playback: re-simulate forward
  private keyframes: Keyframe[] = [];
  private kfAcc = 0;
  private rewinding = false;
  private rewindPlaying = false;
  private rewindIndex = 0; // segment start (which keyframe the playback is on)
  private rewindSegT = 0;  // sim-seconds elapsed into the current segment
  private wasRunning = true;
  private liveSnap: WorldSnapshot | null = null;

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
    const rewind = {
      active: this.rewinding,
      playing: this.rewindPlaying,
      index: this.rewindIndex,
      count: this.keyframes.length,
      day: this.world.day,
      clock: this.world.clock,
    };
    this.store.setFrame(this.world.stats(), this.history, this.world.events, this.selectedInfo(), this.roster(), rewind);
  }

  // advance the world by simDt sim-seconds in fixed substeps (shared by live + playback)
  private step(simDt: number): void {
    let dt = simDt;
    while (dt > 0) {
      const s = Math.min(FIXED, dt);
      this.world.tick(s);
      dt -= s;
    }
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
      if (this.rewinding) {
        if (this.rewindPlaying) { this.advancePlayback(real * this.speed * PACE); this.statAcc += real; }
      } else if (this.running) {
        const simDt = real * this.speed * PACE;
        this.step(simDt);
        this.statAcc += real;
        this.histAcc += real * this.speed;
        // capture rewind keyframes as sim-time advances (never while viewing the past)
        this.kfAcc += simDt;
        while (this.kfAcc >= KEYFRAME_EVERY) {
          this.kfAcc -= KEYFRAME_EVERY;
          this.captureKeyframe();
        }
      }
      this.renderer.draw(this.world);
      if (this.statAcc >= 0.2) {
        this.statAcc = 0;
        this.pushStats();
      }
      if (!this.rewinding && this.histAcc >= 1) {
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
  toggle(): void { if (this.rewinding) return; this.setRunning(!this.running); }
  setSpeed(v: number): void { this.speed = v; this.store.setSpeed(v); }

  private reconfigure(): void {
    this.abortRewind();
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
    this.abortRewind();
    this.world.seed();
    this.history = [];
    this.selected = null;
    this.renderer.setSelected?.(null);
    this.renderer.reset?.();
    this.pushStats();
  }
  intervene(iv: Intervention): void {
    if (this.rewinding) return; // the past is read-only — no meddling with what already happened
    this.world.applyIntervention(iv);
  }

  // ---- rewind: step back through captured moments and watch them, read-only ----
  private captureKeyframe(): void {
    this.keyframes.push({ day: this.world.day, clock: this.world.clock, snap: this.world.serialize() });
    if (this.keyframes.length > KEYFRAME_MAX) this.keyframes.shift();
  }

  enterRewind(): void {
    if (this.rewinding || this.keyframes.length < 2) return;
    this.wasRunning = this.running;
    this.liveSnap = this.world.serialize(); // remember the present, to return to it later
    this.rewinding = true;
    this.rewindPlaying = false;
    this.setRunning(false); // freeze the live sim while we relive the past
    // open a little back from the edge so there's room to press play and watch it flow
    this.seekRewind(Math.max(0, this.keyframes.length - 1 - Math.floor(this.keyframes.length / 3)));
  }

  // jump to a keyframe and pause there (scrubbing the timeline)
  seekRewind(index: number): void {
    if (!this.rewinding || !this.keyframes.length) return;
    const i = Math.max(0, Math.min(this.keyframes.length - 1, Math.round(index)));
    this.rewindIndex = i;
    this.rewindSegT = 0;
    this.rewindPlaying = false;
    this.world.load(this.keyframes[i].snap);
    this.pushStats();
  }

  setRewindPlaying(on: boolean): void {
    if (!this.rewinding) return;
    // can't play past the newest recorded moment
    if (on && this.rewindIndex >= this.keyframes.length - 1) this.seekRewind(0);
    this.rewindPlaying = on;
    this.pushStats();
  }
  toggleRewindPlay(): void { this.setRewindPlaying(!this.rewindPlaying); }

  // Reproduce the past forward: re-simulate deterministically from the current
  // keyframe, snapping back to each true keyframe as it's crossed so the replay
  // stays faithful to what actually happened.
  private advancePlayback(simDt: number): void {
    const last = this.keyframes.length - 1;
    let remaining = simDt;
    while (remaining > 0 && this.rewindIndex < last) {
      const toBoundary = KEYFRAME_EVERY - this.rewindSegT;
      const s = Math.min(remaining, toBoundary);
      this.step(s);
      this.rewindSegT += s;
      remaining -= s;
      if (this.rewindSegT >= KEYFRAME_EVERY - 1e-6) {
        this.rewindIndex++;
        this.rewindSegT = 0;
        this.world.load(this.keyframes[this.rewindIndex].snap); // re-sync to ground truth
      }
    }
    if (this.rewindIndex >= last) { this.rewindPlaying = false; } // reached the present edge
  }

  exitRewind(): void {
    if (!this.rewinding) return;
    if (this.liveSnap) this.world.load(this.liveSnap); // restore the present exactly as we left it
    this.liveSnap = null;
    this.rewinding = false;
    this.rewindPlaying = false;
    this.setRunning(this.wasRunning);
    this.pushStats();
  }

  // drop rewind without restoring — used when the world is being replaced (reset/load)
  private abortRewind(): void {
    if (this.rewinding) this.setRunning(this.wasRunning);
    this.rewinding = false;
    this.rewindPlaying = false;
    this.liveSnap = null;
    this.keyframes = [];
    this.kfAcc = 0;
    this.rewindIndex = 0;
    this.rewindSegT = 0;
  }

  // ---- persistence ----
  private applySnapshot(snap: WorldSnapshot): void {
    this.abortRewind();
    this.world.load(snap);
    this.terrainSize = Math.max(this.terrainSize, 1); // keep UI factor; caps come from snapshot
    this.history = [];
    this.selected = null;
    this.renderer.setSelected?.(null);
    this.renderer.reset?.();
    this.pushStats();
  }
  async saveAuto(): Promise<void> {
    if (this.rewinding) return; // the world is showing the past — don't persist that as "current"
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
