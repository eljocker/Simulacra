// Verifies snapshot fidelity: serialize a world, round-trip it through JSON
// (as IndexedDB would), load it into a fresh world, then advance both and
// confirm they evolve identically. Run:
//   node --experimental-strip-types --no-warnings scripts/snapshot.ts
import { World } from '../src/sim/world.ts';

function statLine(w: World): string {
  const s = w.stats();
  return [s.chicken, s.sheep, s.cow, s.fox, Math.round(s.grass), s.day, s.born, s.died].join(',');
}

const a = new World(1280, 720, 12345);
a.seed();
for (let i = 0; i < 3000; i++) a.tick(1 / 60); // 50s in

// snapshot -> JSON -> parse -> load into a fresh world
const json = JSON.stringify(a.serialize());
const b = new World(320, 240, 999); // different size/seed on purpose
b.seed();
b.load(JSON.parse(json));

let ok = true;
const before = statLine(a) === statLine(b);
if (!before) { ok = false; console.log('estado tras cargar difiere:\n  A', statLine(a), '\n  B', statLine(b)); }

// advance both the same amount; they must stay identical
for (let i = 0; i < 1800; i++) { a.tick(1 / 60); b.tick(1 / 60); }
const after = statLine(a) === statLine(b);
if (!after) { ok = false; console.log('divergen tras avanzar:\n  A', statLine(a), '\n  B', statLine(b)); }

console.log('snapshot round-trip:', ok ? '✓ idéntico (estado + 30s de evolución)' : '✗ FALLA');
console.log('  json size:', (json.length / 1024).toFixed(1), 'KB');
if (!ok) throw new Error('snapshot round-trip mismatch');
