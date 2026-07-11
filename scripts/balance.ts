// Balance harness: runs the pure simulation core headlessly (no DOM) across
// several seeds and reports whether the farm stays alive. Run with:
//   node --experimental-strip-types --no-warnings scripts/balance.ts
import { World } from '../src/sim/world.ts';

const W = 1280, H = 720, SECONDS = 240, STEPS = SECONDS * 60;

interface Result {
  seed: number;
  chicken: number; sheep: number; cow: number; fox: number;
  minFox: number; maxZeroFox: number; grass: number;
}

function trial(seed: number): Result {
  const world = new World(W, H, seed);
  world.seed();
  let minFox = 1e9, run0 = 0, maxZero = 0;
  for (let i = 0; i < STEPS; i++) {
    world.tick(1 / 60);
    if (i > 120) {
      const f = world.stats().fox;
      minFox = Math.min(minFox, f);
      run0 = f === 0 ? run0 + 1 : 0;
      maxZero = Math.max(maxZero, run0);
    }
  }
  const s = world.stats();
  return { seed, chicken: s.chicken, sheep: s.sheep, cow: s.cow, fox: s.fox, minFox, maxZeroFox: +(maxZero / 60).toFixed(1), grass: Math.round(s.grass) };
}

console.log(`Granja · ${SECONDS}s × 8 semillas\n`);
console.log('seed   🐔    🐑    🐄    🦊   minFox  maxZeroFox  pasto%   estado');
let ok = 0;
for (let t = 1; t <= 8; t++) {
  const r = trial(t * 7919);
  const herbAlive = r.chicken + r.sheep + r.cow > 0;
  const foxOk = r.maxZeroFox < 10; // foxes never gone for long
  const alive = herbAlive && foxOk;
  if (alive) ok++;
  console.log(
    String(r.seed).padStart(5),
    String(r.chicken).padStart(4), String(r.sheep).padStart(5), String(r.cow).padStart(5), String(r.fox).padStart(5),
    String(r.minFox).padStart(7), String(r.maxZeroFox + 's').padStart(11), String(r.grass + '%').padStart(7),
    '  ', alive ? '✓ viva' : (!herbAlive ? '✗ sin herbívoros' : '✗ sin zorros'),
  );
}
console.log(`\nGranjas sanas: ${ok}/8`);
