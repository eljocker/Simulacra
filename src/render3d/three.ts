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

// ---- low-poly geometry per species. Every part carries a baked vertex COLOR so a
// ---- single instanced draw call can show a body, face, legs and details in many
// ---- colours. Parts are non-indexed so flat shading looks faceted and merges. ----
const EYE = 0x14110f;
const HOOF = 0x2b2824;

function tint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function combine(...parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts)!;
}
// a symmetric pair of dark eyes on the head
function eyes(x: number, y: number, z: number, r = 0.07): THREE.BufferGeometry[] {
  return [
    tint(new THREE.SphereGeometry(r, 6, 5).translate(x, y, z), EYE),
    tint(new THREE.SphereGeometry(r, 6, 5).translate(x, y, -z), EYE),
  ];
}
function leg(x: number, y: number, z: number, w: number, h: number, color: number): THREE.BufferGeometry {
  return tint(new THREE.BoxGeometry(w, h, w).translate(x, y, z), color);
}

function chickenGeo(): THREE.BufferGeometry {
  const body = 0xf4d35e, beak = 0xe8963a, comb = 0xd8402e;
  return combine(
    tint(new THREE.SphereGeometry(0.5, 8, 6), body),
    tint(new THREE.SphereGeometry(0.3, 8, 6).translate(0.42, 0.35, 0), body),
    tint(new THREE.ConeGeometry(0.12, 0.3, 6).rotateZ(-Math.PI / 2).translate(0.75, 0.32, 0), beak),
    tint(new THREE.SphereGeometry(0.09, 6, 5).scale(1, 1.4, 0.6).translate(0.4, 0.62, 0), comb), // comb
    tint(new THREE.SphereGeometry(0.08, 6, 5).translate(0.62, 0.2, 0), comb), // wattle
    ...eyes(0.58, 0.42, 0.13, 0.06),
    leg(0.08, -0.52, 0.14, 0.07, 0.42, beak), leg(0.08, -0.52, -0.14, 0.07, 0.42, beak),
  );
}
function sheepGeo(): THREE.BufferGeometry {
  const wool = 0xeef0f2, face = 0x3b3733;
  return combine(
    tint(new THREE.IcosahedronGeometry(0.62, 0), wool),
    tint(new THREE.SphereGeometry(0.26, 8, 6).translate(0.55, 0.05, 0), face),
    tint(new THREE.SphereGeometry(0.11, 6, 5).scale(0.7, 1, 1).translate(0.5, 0.26, 0.2), face), // ears
    tint(new THREE.SphereGeometry(0.11, 6, 5).scale(0.7, 1, 1).translate(0.5, 0.26, -0.2), face),
    ...eyes(0.72, 0.1, 0.1, 0.05),
    leg(0.3, -0.62, 0.22, 0.1, 0.5, HOOF), leg(-0.28, -0.62, 0.22, 0.1, 0.5, HOOF),
    leg(0.3, -0.62, -0.22, 0.1, 0.5, HOOF), leg(-0.28, -0.62, -0.22, 0.1, 0.5, HOOF),
  );
}
function cowGeo(): THREE.BufferGeometry {
  const body = 0xdadfe3, spot = 0x2b2b30, snout = 0xd7a2a2, horn = 0xe8e2d2;
  const patch = (x: number, y: number, z: number, s: number) =>
    tint(new THREE.SphereGeometry(s, 6, 5).scale(1.3, 0.5, 1.2).translate(x, y, z), spot);
  return combine(
    tint(new THREE.BoxGeometry(1.3, 0.66, 0.74), body),
    tint(new THREE.BoxGeometry(0.52, 0.5, 0.5).translate(0.82, 0.06, 0), body),
    tint(new THREE.BoxGeometry(0.18, 0.22, 0.5).translate(1.08, -0.06, 0), snout), // muzzle
    // Holstein spots
    patch(-0.2, 0.34, 0.28, 0.3), patch(0.28, 0.3, -0.3, 0.26), patch(-0.45, 0.1, -0.34, 0.22), patch(0.1, 0.36, 0.34, 0.2),
    // little horns
    tint(new THREE.ConeGeometry(0.06, 0.2, 5).translate(0.7, 0.36, 0.18), horn),
    tint(new THREE.ConeGeometry(0.06, 0.2, 5).translate(0.7, 0.36, -0.18), horn),
    ...eyes(1.0, 0.16, 0.17, 0.07),
    leg(-0.4, -0.5, 0.26, 0.15, 0.42, HOOF), leg(0.4, -0.5, 0.26, 0.15, 0.42, HOOF),
    leg(-0.4, -0.5, -0.26, 0.15, 0.42, HOOF), leg(0.4, -0.5, -0.26, 0.15, 0.42, HOOF),
  );
}
function foxGeo(): THREE.BufferGeometry {
  const body = 0xe8712f, nose = 0x24201e, tailTip = 0xf4efe6, ear = 0x3a2418;
  return combine(
    tint(new THREE.BoxGeometry(0.95, 0.44, 0.44), body),
    tint(new THREE.BoxGeometry(0.42, 0.4, 0.4).translate(0.6, 0.08, 0), body),
    tint(new THREE.ConeGeometry(0.14, 0.34, 6).rotateZ(-Math.PI / 2).translate(0.92, 0.02, 0), nose),
    tint(new THREE.ConeGeometry(0.22, 0.7, 6).rotateZ(Math.PI / 2).translate(-0.7, 0.1, 0), body),
    tint(new THREE.SphereGeometry(0.12, 6, 5).translate(-0.95, 0.12, 0), tailTip), // white tail tip
    tint(new THREE.ConeGeometry(0.1, 0.24, 5).translate(0.52, 0.36, 0.14), ear), // ears
    tint(new THREE.ConeGeometry(0.1, 0.24, 5).translate(0.52, 0.36, -0.14), ear),
    ...eyes(0.78, 0.14, 0.13, 0.055),
    leg(0.3, -0.34, 0.16, 0.1, 0.34, HOOF), leg(-0.3, -0.34, 0.16, 0.1, 0.34, HOOF),
    leg(0.3, -0.34, -0.16, 0.1, 0.34, HOOF), leg(-0.3, -0.34, -0.16, 0.1, 0.34, HOOF),
  );
}
function duckGeo(): THREE.BufferGeometry {
  const body = 0xf3efe6, head = 0x2f7d46, beak = 0xdb4a2a, wing = 0xd9d3c4;
  return combine(
    tint(new THREE.SphereGeometry(0.5, 8, 6).scale(1.25, 0.72, 0.82), body),
    tint(new THREE.SphereGeometry(0.3, 8, 6).translate(0.55, 0.42, 0), head), // mallard-green head
    tint(new THREE.ConeGeometry(0.11, 0.28, 6).rotateZ(-Math.PI / 2).translate(0.88, 0.34, 0), beak), // red beak
    tint(new THREE.SphereGeometry(0.16, 6, 5).scale(1.1, 0.5, 0.7).translate(-0.2, 0.18, 0.3), wing), // wings
    tint(new THREE.SphereGeometry(0.16, 6, 5).scale(1.1, 0.5, 0.7).translate(-0.2, 0.18, -0.3), wing),
    tint(new THREE.ConeGeometry(0.12, 0.3, 5).rotateZ(1.9).translate(-0.6, 0.18, 0), body), // tail
    ...eyes(0.68, 0.5, 0.12, 0.045),
  );
}
const GEO: Record<SpeciesId, () => THREE.BufferGeometry> = { chicken: chickenGeo, sheep: sheepGeo, cow: cowGeo, fox: foxGeo, duck: duckGeo };

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

// a rounded pill with the sector's name, for a floating map label
function makeLabelTexture(text: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(38,30,16,0.84)';
  g.fillRect(20, 44, 472, 72);
  g.fillStyle = '#ffe6a0';
  g.font = 'bold 50px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 82);
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
  private instIds: Record<SpeciesId, number[]> = { chicken: [], sheep: [], cow: [], fox: [], duck: [] };
  private moved = 0;

  // selection placemark: a small pin that hovers above the chosen entity (kept
  // clear of the animal's silhouette) — plus a smooth camera follow.
  private selectedId: number | null = null;
  private markPin!: THREE.Mesh;
  private following = false;

  // sector highlight: a translucent disc + ring + floating label over a map region
  private sectorFill!: THREE.Mesh;
  private sectorRing!: THREE.Mesh;
  private sectorLabel: THREE.Sprite | null = null;
  private sector: { name: string; cx: number; cy: number; r: number } | null = null;

  setPickHandler(cb: (id: number | null) => void): void {
    this.pickCb = cb;
  }

  setSelected(id: number | null): void {
    this.selectedId = id;
    this.markPin.visible = id != null;
    this.following = id != null;
  }

  setZoom(zoom: number): void {
    this.camera.zoom = Math.max(0.4, Math.min(6, zoom));
    this.camera.updateProjectionMatrix();
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
      // colours come from the baked vertex colours (body, face, legs, spots, beak)
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
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

    // selection placemark — a small teal pin that hovers above the head, well
    // clear of the animal so it never covers it. Draws on top (depthTest off) so
    // it stays visible behind hills, and gently bobs so the eye can find it.
    this.markPin = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.62, 4),
      new THREE.MeshBasicMaterial({ color: 0x14e0c8, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.markPin.rotation.x = Math.PI; // tip points straight down at the creature
    this.markPin.renderOrder = 999;
    this.markPin.visible = false;
    this.scene.add(this.markPin);

    // sector highlight — a soft filled disc + a bright ring, drawn over the terrain
    const secColor = 0xffd23f;
    this.sectorFill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 44).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: secColor, transparent: true, opacity: 0.14, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
    );
    this.sectorRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.02, 8, 56).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: secColor, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }),
    );
    this.sectorFill.renderOrder = 996;
    this.sectorRing.renderOrder = 997;
    this.sectorFill.visible = this.sectorRing.visible = false;
    this.scene.add(this.sectorFill, this.sectorRing);

    this.attachControls();
  }

  setSector(sector: { name: string; cx: number; cy: number; r: number } | null): void {
    this.sector = sector;
    const on = sector != null;
    this.sectorFill.visible = this.sectorRing.visible = on;
    if (this.sectorLabel) { this.scene.remove(this.sectorLabel); (this.sectorLabel.material as THREE.SpriteMaterial).map?.dispose(); (this.sectorLabel.material as THREE.SpriteMaterial).dispose(); this.sectorLabel = null; }
    if (sector) {
      this.sectorLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(sector.name), transparent: true, depthTest: false, depthWrite: false }));
      this.sectorLabel.renderOrder = 998;
      this.scene.add(this.sectorLabel);
    }
  }

  private updateSector(world: World): void {
    if (!this.sector) return;
    const s = this.sector;
    const sx = (s.cx * world.w - world.w / 2) * SC;
    const sz = (s.cy * world.h - world.h / 2) * SC;
    const r = s.r * world.w * SC;
    const gy = this.terrainY(sx, sz) + 0.25;
    this.sectorFill.position.set(sx, gy, sz);
    this.sectorFill.scale.set(r, r, r);
    this.sectorRing.position.set(sx, gy, sz);
    const pulse = r * (1 + Math.sin(this.t * 0.1) * 0.02);
    this.sectorRing.scale.set(pulse, 1, pulse);
    if (this.sectorLabel) {
      this.sectorLabel.position.set(sx, gy + r * 0.5 + 3, sz);
      this.sectorLabel.scale.set(9, 9 * 0.32, 1);
    }
  }

  // Hover the pin above the selected entity and glide the camera so it stays
  // centred. Called every frame so both track the creature as it moves.
  private updateSelection(world: World): void {
    if (this.selectedId == null) return;
    const bob = Math.sin(this.t * 0.1) * 0.1;

    // resolve the entity's scene position + a clear gap above its head
    let sx = 0, sz = 0, pinY = 0, focusY = 0, found = true;
    const a = world.animals.find((x) => x.id === this.selectedId);
    if (a) {
      sx = (a.x - world.w / 2) * SC; sz = (a.y - world.h / 2) * SC;
      const gy = this.terrainY(sx, sz);
      const s = a.genes.size * growthFactor(a.species, a.age) * a.born * 0.085;
      const top = gy + this.modelH[a.species] * s;
      pinY = top + 0.55 + this.modelH[a.species] * s * 0.35 + bob; // gap scales with the animal
      focusY = (gy + top) * 0.5;
    } else {
      const sc = world.scavengers.find((x) => x.id === this.selectedId);
      if (sc) {
        sx = (sc.x - world.w / 2) * SC; sz = (sc.y - world.h / 2) * SC;
        const fly = this.terrainY(sx, sz) + sc.h * SC;
        pinY = fly + 1.6 + bob;
        focusY = fly;
      } else {
        found = false; // the selected creature died — retire the marker + follow
      }
    }

    if (!found) { this.markPin.visible = false; this.following = false; return; }

    this.markPin.position.set(sx, pinY, sz);

    // smoothly glide the orbit target toward the creature so it stays centred;
    // the user can still drag to rotate and wheel to zoom around it
    if (this.following) {
      const k = 0.09;
      this.target.x += (sx - this.target.x) * k;
      this.target.y += (focusY - this.target.y) * k;
      this.target.z += (sz - this.target.z) * k;
      this.updateCamera();
    }
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

    // frame the whole field (iso diamond spans ~gw+gh); user zooms from there.
    // recentre the orbit target too, so a rebuilt world isn't left off-centre
    // from a previous camera-follow.
    this.target.set(0, 0, 0);
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

    const counts: Record<SpeciesId, number> = { chicken: 0, sheep: 0, cow: 0, fox: 0, duck: 0 };
    (Object.keys(this.instIds) as SpeciesId[]).forEach((k) => { this.instIds[k].length = 0; });
    for (const a of world.animals) {
      const im = this.meshes[a.species];
      const i = counts[a.species];
      if (i >= MAX_INST) continue;
      const s = a.genes.size * growthFactor(a.species, a.age) * a.born * 0.085;
      const sx = (a.x - world.w / 2) * SC, sz = (a.y - world.h / 2) * SC;
      // ducks float on the water surface; every other animal's feet rest on the
      // terrain at its position, so nothing floats or sinks — even over hills.
      const baseY = a.species === 'duck' ? this.pondY + 0.1 : this.terrainY(sx, sz);
      const spd = Math.hypot(a.vx, a.vy);
      // walk cycle: a gentle bob + waddle roll while moving, driven by sim-time so
      // it freezes on pause (legs are modelled; this sells the gait for instances)
      const walk = Math.min(1, spd / 42);
      const gait = a.age * 9 + a.id;
      const bob = a.eating > 0 ? 0 : Math.abs(Math.sin(gait)) * this.modelH[a.species] * s * 0.09 * walk;
      this.dummy.position.set(sx, baseY + this.foot[a.species] * s + bob, sz);
      this.dummy.rotation.set(0, -a.heading, 0);
      if (a.eating > 0) this.dummy.rotateZ(-(0.32 + Math.sin(a.age * 8 + a.id) * 0.08)); // chew dip
      else if (walk > 0.05) this.dummy.rotateX(Math.sin(gait) * 0.12 * walk); // waddle roll
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
    const cc: Record<SpeciesId, number> = { chicken: 0, sheep: 0, cow: 0, fox: 0, duck: 0 };
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

    this.updateSelection(world);
    this.updateSector(world);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
