import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../sim/world.ts';
import type { Effect, Scavenger, SpeciesId } from '../sim/types.ts';
import type { IRenderer } from '../render/IRenderer.ts';
import { growthFactor } from '../sim/species.ts';
import { fbm } from './noise.ts';

const SC = 0.06; // world px -> scene units
const MAX_INST = 280;
const MAX_CORPSE = 160;
const CORPSE_COLOR = 0x6b665f; // ashen, lifeless grey (darker than the bluish rocks)

// ---- low-poly geometry per species (merged so it can be instanced: one draw
// ---- call per species). Parts are non-indexed so mixing indexed and
// ---- non-indexed sources merges cleanly and flat shading looks faceted. ----
function merge(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}
function chickenGeo(): THREE.BufferGeometry {
  return merge(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.SphereGeometry(0.3, 8, 6).translate(0.42, 0.35, 0),
    new THREE.ConeGeometry(0.12, 0.3, 6).rotateZ(-Math.PI / 2).translate(0.75, 0.32, 0),
  );
}
function sheepGeo(): THREE.BufferGeometry {
  return merge(
    new THREE.IcosahedronGeometry(0.62, 0),
    new THREE.SphereGeometry(0.26, 8, 6).translate(0.55, 0.05, 0),
  );
}
function cowGeo(): THREE.BufferGeometry {
  return merge(
    new THREE.BoxGeometry(1.3, 0.66, 0.74),
    new THREE.BoxGeometry(0.52, 0.5, 0.5).translate(0.82, 0.06, 0),
    new THREE.BoxGeometry(0.14, 0.4, 0.14).translate(-0.4, -0.5, 0.26),
    new THREE.BoxGeometry(0.14, 0.4, 0.14).translate(0.4, -0.5, 0.26),
    new THREE.BoxGeometry(0.14, 0.4, 0.14).translate(-0.4, -0.5, -0.26),
    new THREE.BoxGeometry(0.14, 0.4, 0.14).translate(0.4, -0.5, -0.26),
  );
}
function foxGeo(): THREE.BufferGeometry {
  return merge(
    new THREE.BoxGeometry(0.95, 0.44, 0.44),
    new THREE.BoxGeometry(0.42, 0.4, 0.4).translate(0.6, 0.08, 0),
    new THREE.ConeGeometry(0.14, 0.34, 6).rotateZ(-Math.PI / 2).translate(0.92, 0.02, 0),
    new THREE.ConeGeometry(0.22, 0.7, 6).rotateZ(Math.PI / 2).translate(-0.7, 0.1, 0),
  );
}
const GEO: Record<SpeciesId, () => THREE.BufferGeometry> = { chicken: chickenGeo, sheep: sheepGeo, cow: cowGeo, fox: foxGeo };
const COLOR: Record<SpeciesId, number> = { chicken: 0xf4d35e, sheep: 0xeef0f2, cow: 0xdadfe3, fox: 0xe8712f };

function nightFactor(clock: number): number {
  // coupled to the sun's height so darkness and the sun are always in sync
  const elev = Math.sin(clock * Math.PI * 2 - Math.PI / 2);
  return Math.max(0, Math.min(1, (0.12 - elev) / 0.24));
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// soft radial glow for the sun/moon sprite
function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.22, 'rgba(255,246,222,0.95)');
  grd.addColorStop(0.5, 'rgba(255,228,160,0.42)');
  grd.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// fluffy cloud silhouette from a few overlapping soft blobs
function makeCloudTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const blob = (cx: number, cy: number, r: number, a: number) => {
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  };
  blob(54, 74, 34, 0.9); blob(80, 70, 30, 0.85); blob(66, 60, 26, 0.8); blob(40, 66, 22, 0.7); blob(92, 78, 20, 0.7);
  return new THREE.CanvasTexture(c);
}

// a little angel / soul that rises from a death
function makeAngelTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gl = g.createRadialGradient(32, 34, 2, 32, 34, 30);
  gl.addColorStop(0, 'rgba(255,255,240,0.85)');
  gl.addColorStop(1, 'rgba(255,255,240,0)');
  g.fillStyle = gl; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.beginPath(); g.ellipse(20, 37, 10, 7, 0.5, 0, 6.2832); g.fill();
  g.beginPath(); g.ellipse(44, 37, 10, 7, -0.5, 0, 6.2832); g.fill();
  g.beginPath(); g.moveTo(32, 31); g.lineTo(41, 53); g.lineTo(23, 53); g.closePath(); g.fill();
  g.beginPath(); g.arc(32, 28, 7, 0, 6.2832); g.fill();
  g.strokeStyle = 'rgba(255,214,90,0.95)'; g.lineWidth = 2.4;
  g.beginPath(); g.ellipse(32, 17, 7, 3, 0, 0, 6.2832); g.stroke();
  return new THREE.CanvasTexture(c);
}

// a dark bird silhouette (two wings) for the aerial scavengers, seen from below
function makeBirdTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(38,36,40,0.92)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(6, 34); g.quadraticCurveTo(24, 16, 32, 30); // left wing
  g.quadraticCurveTo(40, 16, 58, 34); // right wing
  g.stroke();
  g.fillStyle = 'rgba(30,28,32,0.95)';
  g.beginPath(); g.ellipse(32, 31, 3.2, 5.2, 0, 0, 6.2832); g.fill(); // body
  return new THREE.CanvasTexture(c);
}

export class ThreeRenderer implements IRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sunSprite: THREE.Sprite;
  private ground: THREE.Mesh;
  private scenery = new THREE.Group();
  private meshes = {} as Record<SpeciesId, THREE.InstancedMesh>;
  private corpseMeshes = {} as Record<SpeciesId, THREE.InstancedMesh>; // grey fallen bodies
  private foot = {} as Record<SpeciesId, number>; // -min.y of each model: how high to sit it so its feet rest on the ground
  private lieHalf = {} as Record<SpeciesId, number>; // resting height once tipped on its side
  private modelH = {} as Record<SpeciesId, number>; // full standing height (max.y - min.y) — for the placemark
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private rain: THREE.Points;
  private eggMesh: THREE.InstancedMesh; // incubating chicken eggs
  private duckMesh: THREE.InstancedMesh; // ducks floating on the pond
  private fruitMesh: THREE.InstancedMesh; // apples/berries fallen from the trees
  private clouds: THREE.Sprite[] = [];
  private foliage: THREE.Object3D[] = []; // tree crowns, swayed by wind
  private angelTex = makeAngelTexture();
  private souls = new Map<Effect, THREE.Sprite>(); // rising souls, keyed by their effect
  private birdTex = makeBirdTexture();
  private birds = new Map<Scavenger, THREE.Sprite>(); // aerial scavengers
  private built = false;
  private t = 0; // frame counter for ambient motion (clouds, wind)

  // terrain relief (procedural, deterministic) + pond basin
  private terAmp = 2.2;
  private terScale = 0.05;
  private readonly terOff = 137.2;
  private pondC = new THREE.Vector3();
  private pondR = 0;
  private pondY = 0; // water surface height (ducks float here)

  // fixed isometric camera rig — no auto motion; user nudges with mouse/keys
  private az = Math.PI * 0.25;
  private pol = 0.955; // ~isometric elevation (~35° above ground)
  private target = new THREE.Vector3();
  private aspect = 1;
  private viewHalf = 30; // half of the vertical world extent framed by the ortho camera
  private camDist = 240;
  private drag = false;
  private lx = 0;
  private ly = 0;

  // click-to-inspect
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pickCb: ((id: number | null) => void) | null = null;
  private instIds: Record<SpeciesId, number[]> = { chicken: [], sheep: [], cow: [], fox: [] };
  private moved = 0;

  // selection placemark: a ground ring + a bobbing downward pin that tracks the chosen entity
  private selectedId: number | null = null;
  private markRing!: THREE.Mesh;
  private markPin!: THREE.Mesh;

  setPickHandler(cb: (id: number | null) => void): void {
    this.pickCb = cb;
  }

  setSelected(id: number | null): void {
    this.selectedId = id;
    const on = id != null;
    this.markRing.visible = on;
    this.markPin.visible = on;
  }

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 2000);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a7a3a, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.4);
    this.scene.add(this.sun, this.sun.target);
    // soft glowing sun/moon: a camera-facing sprite with a radial-gradient glow
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sunSprite.scale.setScalar(20);
    this.scene.add(this.sunSprite);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    this.scene.add(this.ground, this.scenery);

    (Object.keys(GEO) as SpeciesId[]).forEach((sp) => {
      const mat = new THREE.MeshStandardMaterial({ color: COLOR[sp], flatShading: true, roughness: 0.85 });
      const im = new THREE.InstancedMesh(GEO[sp](), mat, MAX_INST);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.geometry.computeBoundingBox();
      im.geometry.computeBoundingSphere(); // needed for raycasting the instances
      const bb = im.geometry.boundingBox;
      this.foot[sp] = -(bb?.min.y ?? 0); // grounding offset (standing)
      this.modelH[sp] = (bb?.max.y ?? 0.5) - (bb?.min.y ?? -0.5); // full standing height
      // once tipped 90° on its side, local +X becomes the vertical axis
      this.lieHalf[sp] = Math.max(Math.abs(bb?.min.x ?? 0.4), Math.abs(bb?.max.x ?? 0.4));
      this.meshes[sp] = im;
      this.scene.add(im);

      // a parallel grey instanced mesh for the fallen bodies of this species
      const cmat = new THREE.MeshStandardMaterial({ color: CORPSE_COLOR, flatShading: true, roughness: 1 });
      const cm = new THREE.InstancedMesh(GEO[sp](), cmat, MAX_CORPSE);
      cm.frustumCulled = false;
      cm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      cm.count = 0;
      this.corpseMeshes[sp] = cm;
      this.scene.add(cm);
    });

    const rainGeo = new THREE.BufferGeometry();
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 45;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbcd6ef, size: 0.18, transparent: true, opacity: 0.6 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);

    // incubating eggs: a small cream ovoid, instanced
    const eggGeo = new THREE.SphereGeometry(0.5, 8, 6);
    this.eggMesh = new THREE.InstancedMesh(eggGeo, new THREE.MeshStandardMaterial({ color: 0xf3ecd8, flatShading: true, roughness: 0.7 }), 160);
    this.eggMesh.frustumCulled = false;
    this.eggMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eggMesh.count = 0;
    this.scene.add(this.eggMesh);

    // ducks: a tiny low-poly body + head + beak (only ever seen on the water)
    const duckGeo = merge(
      new THREE.SphereGeometry(0.5, 8, 6).scale(1.25, 0.72, 0.82), // body
      new THREE.SphereGeometry(0.3, 8, 6).translate(0.55, 0.42, 0), // head
      new THREE.ConeGeometry(0.1, 0.24, 5).rotateZ(-Math.PI / 2).translate(0.86, 0.36, 0), // beak
    );
    this.duckMesh = new THREE.InstancedMesh(duckGeo, new THREE.MeshStandardMaterial({ color: 0xf1eee4, flatShading: true, roughness: 0.8 }), 24);
    this.duckMesh.frustumCulled = false;
    this.duckMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.duckMesh.count = 0;
    this.scene.add(this.duckMesh);

    // fruit: a small berry-sized sphere, per-instance colour (apple red / berry purple)
    this.fruitMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 7, 5), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 }), 32);
    this.fruitMesh.frustumCulled = false;
    this.fruitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fruitMesh.count = 0;
    this.scene.add(this.fruitMesh);

    // drifting procedural clouds (the brief's "anti-loop": the sky never repeats)
    const cloudTex = makeCloudTexture();
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false }));
      const sc = 10 + Math.random() * 16;
      s.scale.set(sc * 1.6, sc, 1);
      // high and behind the field, so they read as sky and never sit on the ground
      s.position.set((Math.random() - 0.5) * 165, 32 + Math.random() * 20, -28 - Math.random() * 72);
      s.userData.speed = 0.6 + Math.random() * 0.9;
      this.clouds.push(s);
      this.scene.add(s);
    }

    // selection placemark — a bright teal ring on the ground and a pin pointing
    // down at the head. Both draw on top (depthTest off) so they never hide behind
    // scenery, and they track the selected entity every frame.
    const markColor = 0x14e0c8;
    this.markRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.085, 8, 40),
      new THREE.MeshBasicMaterial({ color: markColor, transparent: true, opacity: 0.92, depthTest: false }),
    );
    this.markRing.rotation.x = -Math.PI / 2;
    this.markRing.renderOrder = 998;
    this.markRing.visible = false;
    this.markPin = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1, 4),
      new THREE.MeshBasicMaterial({ color: markColor, depthTest: false }),
    );
    this.markPin.rotation.x = Math.PI; // tip points straight down
    this.markPin.renderOrder = 999;
    this.markPin.visible = false;
    this.scene.add(this.markRing, this.markPin);

    this.attachControls();
  }

  // Place the tracking marker over the selected entity (animal on the ground or
  // scavenger in the air). Called every frame so it follows the creature.
  private updateMarker(world: World): void {
    if (this.selectedId == null) return;
    const pulse = 1 + Math.sin(this.t * 0.14) * 0.09;
    const bob = Math.sin(this.t * 0.1) * 0.12;

    const a = world.animals.find((x) => x.id === this.selectedId);
    if (a) {
      const sx = (a.x - world.w / 2) * SC, sz = (a.y - world.h / 2) * SC;
      const gy = this.terrainY(sx, sz);
      const s = a.genes.size * growthFactor(a.species, a.age) * a.born * 0.085;
      const r = Math.max(0.9, this.lieHalf[a.species] * s * 1.7);
      const top = gy + this.modelH[a.species] * s;
      this.markRing.position.set(sx, gy + 0.06, sz);
      this.markRing.scale.set(r * pulse, r * pulse, r * pulse);
      this.markPin.position.set(sx, top + 1.1 + bob, sz);
      this.markPin.scale.setScalar(Math.max(0.7, r * 0.8));
      return;
    }

    const sc = world.scavengers.find((x) => x.id === this.selectedId);
    if (sc) {
      const sx = (sc.x - world.w / 2) * SC, sz = (sc.y - world.h / 2) * SC;
      const fly = this.terrainY(sx, sz) + sc.h * SC;
      const r = 1.9;
      this.markRing.position.set(sx, fly - 1.1, sz);
      this.markRing.scale.set(r * pulse, r * pulse, r * pulse);
      this.markPin.position.set(sx, fly + 2 + bob, sz);
      this.markPin.scale.setScalar(1.2);
      return;
    }

    // the selected creature is gone (died) — retire the marker
    this.markRing.visible = false;
    this.markPin.visible = false;
  }

  // procedural terrain height at a scene-space point (matches the mesh, so
  // animals and props sit exactly on the relief). Carves a basin under the pond.
  private terrainY(sx: number, sz: number): number {
    let h = (fbm(sx * this.terScale + this.terOff, sz * this.terScale + this.terOff, 4) - 0.5) * 2 * this.terAmp;
    if (this.pondR > 0) {
      const d = Math.hypot(sx - this.pondC.x, sz - this.pondC.z);
      const edge = this.pondR * 1.4;
      if (d < edge) {
        const k = 1 - d / edge;
        h = h * (1 - k) + (-this.terAmp * 0.5) * k;
      }
    }
    return h;
  }

  // ---- camera controls: drag to rotate, wheel to zoom, arrows/±to nudge ----
  private attachControls(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = true; this.lx = e.clientX; this.ly = e.clientY; this.moved = 0;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.lx, dy = e.clientY - this.ly;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.az -= dx * 0.006;
      this.pol = clamp(this.pol - dy * 0.006, 0.22, 1.45);
      this.lx = e.clientX; this.ly = e.clientY;
      this.updateCamera();
    });
    c.addEventListener('pointerup', (e) => {
      if (this.drag && this.moved < 6) this.pick(e); // a click, not a drag → select
      this.drag = false;
    });
    c.addEventListener('pointercancel', () => { this.drag = false; });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.zoom = clamp(this.camera.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.4, 6);
      this.camera.updateProjectionMatrix();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft': this.az -= 0.09; break;
        case 'ArrowRight': this.az += 0.09; break;
        case 'ArrowUp': this.pol = clamp(this.pol - 0.06, 0.22, 1.45); break;
        case 'ArrowDown': this.pol = clamp(this.pol + 0.06, 0.22, 1.45); break;
        case '+': case '=': this.camera.zoom = clamp(this.camera.zoom * 1.12, 0.4, 6); this.camera.updateProjectionMatrix(); break;
        case '-': case '_': this.camera.zoom = clamp(this.camera.zoom * 0.89, 0.4, 6); this.camera.updateProjectionMatrix(); break;
        default: handled = false;
      }
      if (handled) { e.preventDefault(); this.updateCamera(); }
    });
  }

  private pick(e: PointerEvent): void {
    if (!this.pickCb) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(Object.values(this.meshes), false);
    for (const hit of hits) {
      if (hit.instanceId == null) continue;
      const sp = (Object.keys(this.meshes) as SpeciesId[]).find((k) => this.meshes[k] === hit.object);
      const id = sp ? this.instIds[sp][hit.instanceId] : undefined;
      if (id != null) { this.pickCb(id); return; }
    }
    // no ground animal under the cursor — try the birds circling overhead
    const birdHits = this.raycaster.intersectObjects(Array.from(this.birds.values()), false);
    if (birdHits.length) {
      for (const [sc, sp] of this.birds) {
        if (sp === birdHits[0].object) { this.pickCb(sc.id); return; }
      }
    }
    this.pickCb(null); // clicked empty ground → clear selection
  }

  private updateCamera(): void {
    const dir = new THREE.Vector3(
      Math.sin(this.pol) * Math.sin(this.az),
      Math.cos(this.pol),
      Math.sin(this.pol) * Math.cos(this.az),
    );
    this.camera.position.copy(this.target).addScaledVector(dir, this.camDist);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }

  private updateFrustum(): void {
    const half = this.viewHalf;
    this.camera.left = -half * this.aspect;
    this.camera.right = half * this.aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.near = 1;
    this.camera.far = this.camDist * 2 + 400;
    this.camera.updateProjectionMatrix();
  }

  private buildScenery(world: World): void {
    // clear previous scenery (dispose so repeated loads don't leak)
    for (const o of this.scenery.children) {
      o.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.scenery.clear();

    this.foliage = [];
    const gw = world.w * SC, gh = world.h * SC;
    this.terAmp = Math.min(2.6, Math.max(gw, gh) * 0.05);
    // pond geometry comes from the sim now, so the water rule matches the visible water
    this.pondC.set((world.pond.x - world.w / 2) * SC, 0, (world.pond.y - world.h / 2) * SC);
    this.pondR = world.pond.r * SC;

    // ---- terrain relief: subdivided plane displaced by noise, coloured by height ----
    const segX = Math.max(8, Math.round(gw / 1.3));
    const segY = Math.max(8, Math.round(gh / 1.3));
    const geo = new THREE.PlaneGeometry(gw, gh, segX, segY);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(0x496d2b), hi = new THREE.Color(0x79a44b), dry = new THREE.Color(0x9c8c46);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.terrainY(x, z);
      pos.setY(i, y);
      const tint = Math.max(0, Math.min(1, (y / this.terAmp) * 0.5 + 0.5));
      const patch = fbm(x * 0.12 + 5, z * 0.12 + 5, 3);
      tmp.copy(lo).lerp(hi, tint).lerp(dry, patch * 0.16);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.ground.geometry.dispose();
    this.ground.geometry = geo;

    // props follow the relief
    const toScene = (x: number, y: number) => {
      const sx = (x - world.w / 2) * SC, sz = (y - world.h / 2) * SC;
      return new THREE.Vector3(sx, this.terrainY(sx, sz), sz);
    };

    // barn
    const barn = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: 0xc2503c, flatShading: true }));
    walls.position.y = 0.9;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x3a2b23, flatShading: true }));
    roof.position.y = 2.5; roof.rotation.y = Math.PI / 4;
    barn.add(walls, roof);
    barn.position.copy(toScene(world.w * 0.52 + 40, 90));
    this.scenery.add(barn);

    // pond (sits in its carved basin)
    const pond = new THREE.Mesh(new THREE.CircleGeometry(this.pondR * 1.15, 28), new THREE.MeshStandardMaterial({ color: 0x4691b6, roughness: 0.2, metalness: 0.15 }));
    pond.rotation.x = -Math.PI / 2;
    this.pondY = this.terrainY(this.pondC.x, this.pondC.z) + 0.3; // water surface height — ducks float here
    pond.position.set(this.pondC.x, this.pondY, this.pondC.z);
    this.scenery.add(pond);

    // trees — positions come from the sim now (so fruit falls from real trees);
    // crowns collected for wind sway
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a34, flatShading: true });
    world.trees.forEach((tr, i) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), trunkMat);
      trunk.position.y = 0.6;
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), leafMat);
      leaves.position.y = 1.7;
      leaves.userData.phase = i * 1.7;
      this.foliage.push(leaves);
      t.scale.setScalar(tr.scale);
      t.add(trunk, leaves);
      t.position.copy(toScene(tr.x, tr.y));
      this.scenery.add(t);
    });

    // rocks for a bit of texture
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8f92, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const fx = (Math.sin(i * 31.7 + 2) * 9137.7) % 1;
      const fy = (Math.sin(i * 51.3 + 4) * 3571.3) % 1;
      const x = (Math.abs(fx) * 0.84 + 0.08) * world.w;
      const y = (Math.abs(fy) * 0.84 + 0.08) * world.h;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + Math.abs(fx) * 0.4, 0), rockMat);
      rock.scale.y = 0.6;
      rock.position.copy(toScene(x, y));
      rock.position.y += 0.12;
      rock.rotation.y = fx * 6;
      this.scenery.add(rock);
    }

    // frame the whole field (iso diamond spans ~gw+gh); user zooms from there
    this.viewHalf = (gw + gh) * 0.42;
    this.updateFrustum();
    this.updateCamera();
    this.built = true;
  }

  reset(): void {
    this.built = false; // next draw rebuilds scenery for the (possibly new) world size
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.updateFrustum();
  }

  draw(world: World): void {
    if (!this.built) this.buildScenery(world);

    const counts: Record<SpeciesId, number> = { chicken: 0, sheep: 0, cow: 0, fox: 0 };
    (Object.keys(this.instIds) as SpeciesId[]).forEach((k) => { this.instIds[k].length = 0; });
    for (const a of world.animals) {
      const im = this.meshes[a.species];
      const i = counts[a.species];
      if (i >= MAX_INST) continue;
      const s = a.genes.size * growthFactor(a.species, a.age) * a.born * 0.085;
      // gravity rule: feet rest on the terrain surface at the animal's position,
      // so no animal can ever float or sink — even over hills.
      const sx = (a.x - world.w / 2) * SC, sz = (a.y - world.h / 2) * SC;
      this.dummy.position.set(sx, this.terrainY(sx, sz) + this.foot[a.species] * s, sz);
      this.dummy.rotation.set(0, -a.heading, 0);
      // eating: dip the nose toward the ground with a little chewing bob. The bob
      // is driven by the animal's own age (sim time), so it freezes when paused.
      if (a.eating > 0) this.dummy.rotateZ(-(0.32 + Math.sin(a.age * 8 + a.id) * 0.08));
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      im.setMatrixAt(i, this.dummy.matrix);
      this.instIds[a.species][i] = a.id;
      counts[a.species] = i + 1;
    }
    (Object.keys(this.meshes) as SpeciesId[]).forEach((sp) => {
      const im = this.meshes[sp];
      im.count = counts[sp];
      im.instanceMatrix.needsUpdate = true;
    });

    // fallen bodies — tipped on their side, grey, resting on the terrain
    const cc: Record<SpeciesId, number> = { chicken: 0, sheep: 0, cow: 0, fox: 0 };
    for (const c of world.corpses) {
      const cm = this.corpseMeshes[c.species];
      const i = cc[c.species];
      if (i >= MAX_CORPSE) continue;
      const s = c.size * growthFactor(c.species, c.age) * Math.max(c.born, 0.5) * 0.085;
      const sx = (c.x - world.w / 2) * SC, sz = (c.y - world.h / 2) * SC;
      const k = c.t / c.life; // 0..1 — settle a touch as it lies
      this.dummy.position.set(sx, this.terrainY(sx, sz) + this.lieHalf[c.species] * s * (1 - k * 0.25), sz);
      this.dummy.rotation.set(0, -c.heading, Math.PI * 0.5); // tip over
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      cm.setMatrixAt(i, this.dummy.matrix);
      cc[c.species] = i + 1;
    }
    (Object.keys(this.corpseMeshes) as SpeciesId[]).forEach((sp) => {
      const cm = this.corpseMeshes[sp];
      cm.count = cc[sp];
      cm.instanceMatrix.needsUpdate = true;
    });

    // incubating eggs — small ovoids that wobble a little more as hatching nears
    let ei = 0;
    for (const eg of world.eggs) {
      if (ei >= 160) break;
      const sx = (eg.x - world.w / 2) * SC, sz = (eg.y - world.h / 2) * SC;
      const es = 1.05;
      const k = eg.t / eg.life; // 0..1
      const wob = Math.sin(this.t * 0.22 + eg.wobble) * 0.12 * k; // gentle rocking that grows
      this.dummy.position.set(sx, this.terrainY(sx, sz) + 0.42 * es, sz);
      this.dummy.rotation.set(wob, eg.wobble, wob * 0.6);
      this.dummy.scale.set(0.42 * es, 0.56 * es, 0.42 * es); // taller than wide → egg shape
      this.dummy.updateMatrix();
      this.eggMesh.setMatrixAt(ei, this.dummy.matrix);
      ei++;
    }
    this.eggMesh.count = ei;
    this.eggMesh.instanceMatrix.needsUpdate = true;

    // ducks — float on the water surface with a gentle bob
    let di = 0;
    for (const d of world.ducks) {
      if (di >= 24) break;
      const sx = (d.x - world.w / 2) * SC, sz = (d.y - world.h / 2) * SC;
      const bob = Math.sin(d.paddle) * 0.05;
      this.dummy.position.set(sx, this.pondY + 0.16 + bob, sz);
      this.dummy.rotation.set(0, -d.heading, 0);
      this.dummy.scale.setScalar(0.62);
      this.dummy.updateMatrix();
      this.duckMesh.setMatrixAt(di, this.dummy.matrix);
      di++;
    }
    this.duckMesh.count = di;
    this.duckMesh.instanceMatrix.needsUpdate = true;

    // fruit — falls from the tree canopy, then rests on the ground until eaten
    let fi = 0;
    for (const fr of world.fruits) {
      if (fi >= 32) break;
      const sx = (fr.x - world.w / 2) * SC, sz = (fr.y - world.h / 2) * SC;
      const groundY = this.terrainY(sx, sz) + 0.16;
      const fall = fr.t < 0.6 ? (1 - fr.t / 0.6) * 2.4 : 0; // drop from the canopy
      this.dummy.position.set(sx, groundY + fall, sz);
      this.dummy.rotation.set(0, fr.x + fr.y, 0);
      this.dummy.scale.setScalar(0.42);
      this.dummy.updateMatrix();
      this.fruitMesh.setMatrixAt(fi, this.dummy.matrix);
      this.fruitMesh.setColorAt(fi, this.tmpColor.set(fr.kind === 'apple' ? 0xd8402e : 0x8046b0));
      fi++;
    }
    this.fruitMesh.count = fi;
    this.fruitMesh.instanceMatrix.needsUpdate = true;
    if (this.fruitMesh.instanceColor) this.fruitMesh.instanceColor.needsUpdate = true;

    // day / night
    const n = nightFactor(world.clock);
    const sky = new THREE.Color(lerp(0.49, 0.04, n), lerp(0.68, 0.06, n), lerp(0.9, 0.16, n));
    this.scene.background = sky;
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(sky);
    this.hemi.intensity = lerp(0.98, 0.25, n);
    this.sun.intensity = lerp(1.5, 0.18, n);
    this.sun.color.setRGB(lerp(1, 0.5, n), lerp(0.95, 0.6, n), lerp(0.84, 0.9, n));
    const ang = world.clock * Math.PI * 2 - Math.PI / 2;
    const R = this.camDist;
    this.sun.position.set(Math.cos(ang) * R * 0.6, Math.sin(ang) * R * 0.55 + 4, R * 0.3);
    this.sunSprite.position.copy(this.sun.position).multiplyScalar(0.62);
    const sm = this.sunSprite.material as THREE.SpriteMaterial;
    sm.color.setRGB(lerp(1, 0.55, n), lerp(0.93, 0.62, n), lerp(0.7, 0.98, n)); // warm sun → cool moon
    sm.opacity = lerp(0.95, 0.7, n);

    // weather
    this.rain.visible = world.weather === 'rain';
    if (this.rain.visible) {
      const p = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - 0.9;
        if (y < 0) y = 45;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }

    // ambient motion — the anti-loop: clouds drift, trees sway (wind picks up in rain)
    this.t++;
    const wind = world.weather === 'rain' ? 2.1 : 1;
    for (const cl of this.clouds) {
      cl.position.x += 0.02 * (cl.userData.speed as number) * wind;
      if (cl.position.x > 82) cl.position.x = -82;
      const m = cl.material as THREE.SpriteMaterial;
      m.opacity = lerp(0.9, 0.42, n) * (world.weather === 'drought' ? 0.45 : 1);
      m.color.setRGB(lerp(1, 0.55, n), lerp(1, 0.58, n), lerp(1, 0.72, n));
    }
    for (const f of this.foliage) {
      const ph = f.userData.phase as number;
      f.rotation.z = Math.sin(this.t * 0.03 + ph) * 0.06 * wind;
      f.rotation.x = Math.cos(this.t * 0.025 + ph) * 0.04 * wind;
    }

    // souls — a little angel rises from each death and fades into the sky
    for (const [eff, sp] of this.souls) {
      if (!world.effects.includes(eff)) {
        this.scene.remove(sp);
        (sp.material as THREE.SpriteMaterial).dispose();
        this.souls.delete(eff);
      }
    }
    for (const eff of world.effects) {
      if (eff.kind !== 'soul') continue;
      let sp = this.souls.get(eff);
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.angelTex, transparent: true, depthWrite: false }));
        this.souls.set(eff, sp);
        this.scene.add(sp);
      }
      const k = eff.t / eff.life; // 0..1
      const sx = (eff.x - world.w / 2) * SC, sz = (eff.y - world.h / 2) * SC;
      sp.position.set(sx + Math.sin(eff.t * 3) * 0.5, this.terrainY(sx, sz) + 1 + k * 11, sz);
      sp.scale.setScalar(1.7 + k * 1.3);
      (sp.material as THREE.SpriteMaterial).opacity = Math.min(1, k / 0.15) * (1 - k * k);
    }

    // aerial scavengers — dark birds circling overhead, diving to corpses
    for (const [sc, sp] of this.birds) {
      if (!world.scavengers.includes(sc)) {
        this.scene.remove(sp);
        (sp.material as THREE.SpriteMaterial).dispose();
        this.birds.delete(sc);
      }
    }
    for (const sc of world.scavengers) {
      let sp = this.birds.get(sc);
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.birdTex, transparent: true, depthWrite: false }));
        this.birds.set(sc, sp);
        this.scene.add(sp);
      }
      const sx = (sc.x - world.w / 2) * SC, sz = (sc.y - world.h / 2) * SC;
      sp.position.set(sx, this.terrainY(sx, sz) + sc.h * SC, sz);
      const flap = 0.82 + Math.abs(Math.sin(sc.flap)) * 0.5; // wing-beat: squash horizontally
      sp.scale.set(2.6 * flap, 2.6 * (1.3 - flap * 0.4), 1);
      (sp.material as THREE.SpriteMaterial).opacity = lerp(0.9, 0.5, n); // fade a bit at night
    }

    this.updateMarker(world);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
