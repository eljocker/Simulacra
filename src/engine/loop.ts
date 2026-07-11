import { World } from '../sim/world.ts';
import type { Intervention } from '../sim/types.ts';
import { Renderer } from '../render/renderer.ts';
import { Store, type HistoryPoint, type Tool } from './store.ts';

const FIXED = 1 / 60;
const HISTORY_MAX = 200;

// Owns the world + renderer and drives them with a fixed-timestep accumulator.
// Publishes lightweight stats to the Store for React to read.
export class Engine {
  world: World;
  renderer: Renderer;
  store = new Store();
  private running = true;
  private speed = 1;
  private tool: Tool = 'feed';
  private last = 0;
  private raf = 0;
  private statAcc = 0;
  private histAcc = 0;
  private history: HistoryPoint[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const { w, h } = this.canvasSize();
    this.world = new World(w, h, (Math.random() * 1e9) | 0);
    this.world.seed();
    this.renderer = new Renderer(canvas);
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
        this.store.setStats(this.world.stats(), this.history);
      }
      if (this.histAcc >= 1) {
        this.histAcc = 0;
        const s = this.world.stats();
        this.history.push({ chicken: s.chicken, sheep: s.sheep, cow: s.cow, fox: s.fox, grass: s.grass });
        if (this.history.length > HISTORY_MAX) this.history.shift();
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
    this.world.resize(w, h);
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
  setTool(t: Tool): void {
    this.tool = t;
    this.store.setTool(t);
  }
  reset(): void {
    this.world.rng = this.world.rng; // keep instance
    this.world.seed();
    this.history = [];
    this.store.setStats(this.world.stats(), this.history);
  }

  intervene(iv: Intervention): void {
    this.world.applyIntervention(iv);
  }

  // pointer on the field: apply the armed tool
  click(x: number, y: number): void {
    if (this.tool === 'meteor') this.world.applyIntervention({ kind: 'meteor', x, y });
    else this.world.applyIntervention({ kind: 'feed', x, y });
  }
}
