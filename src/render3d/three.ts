import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../sim/world.ts';
import type { SpeciesId } from '../sim/types.ts';
import type { IRenderer } from '../render/IRenderer.ts';

const SC = 0.06; // world px -> scene units
const MAX_INST = 280;

// ---- low-poly geometry per species (merged into one BufferGeometry so it can
// ---- be instanced; a single draw call per species) ----
// All parts are made non-indexed before merging: it keeps mergeGeometries happy
// even when mixing indexed (box/sphere) and non-indexed (icosahedron) sources,
// and the faceted result reads nicely as low-poly under flat shading.
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

const GEO: Record<SpeciesId, () => THREE.BufferGeometry> = {
  chicken: chickenGeo, sheep: sheepGeo, cow: cowGeo, fox: foxGeo,
};
const COLOR: Record<SpeciesId, number> = {
  chicken: 0xf4d35e, sheep: 0xeef0f2, cow: 0xdadfe3, fox: 0xe8712f,
};

function nightFactor(clock: number): number {
  if (clock > 0.8) return Math.min(1, (clock - 0.8) / 0.08);
  if (clock < 0.16) return Math.min(1, (0.16 - clock) / 0.08);
  return 0;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class ThreeRenderer implements IRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sunBall: THREE.Mesh;
  private ground: THREE.Mesh;
  private meshes = {} as Record<SpeciesId, THREE.InstancedMesh>;
  private dummy = new THREE.Object3D();
  private rain: THREE.Points;
  private orbit = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a7a3a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.4);
    this.scene.add(this.sun, this.sun.target);
    this.sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
    );
    this.scene.add(this.sunBall);

    // ground
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x5f8f3e, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // instanced animals
    (Object.keys(GEO) as SpeciesId[]).forEach((sp) => {
      const mat = new THREE.MeshStandardMaterial({ color: COLOR[sp], flatShading: true, roughness: 0.85 });
      const im = new THREE.InstancedMesh(GEO[sp](), mat, MAX_INST);
      im.castShadow = true;
      im.frustumCulled = false; // count varies each frame; skip bounding-sphere culling
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      this.meshes[sp] = im;
      this.scene.add(im);
    });

    // rain particles (toggled by weather)
    const rainGeo = new THREE.BufferGeometry();
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbcd6ef, size: 0.18, transparent: true, opacity: 0.6 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  private built = false;
  private buildScenery(world: World): void {
    // called once we know the world size: size ground + place props/trees
    const gw = world.w * SC, gh = world.h * SC;
    this.ground.geometry.dispose();
    this.ground.geometry = new THREE.PlaneGeometry(gw, gh, 1, 1);
    this.scene.fog = new THREE.Fog(0x9fc0e0, gw * 1.2, gw * 3.2);

    const toScene = (x: number, y: number) => new THREE.Vector3((x - world.w / 2) * SC, 0, (y - world.h / 2) * SC);

    // barn
    const barn = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: 0xc2503c, flatShading: true }));
    walls.position.y = 0.9; walls.castShadow = true; walls.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x3a2b23, flatShading: true }));
    roof.position.y = 2.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    barn.add(walls, roof);
    barn.position.copy(toScene(world.w * 0.52 + 40, 90));
    this.scene.add(barn);

    // pond
    const pond = new THREE.Mesh(new THREE.CircleGeometry(gw * 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x3e7fa6, roughness: 0.3, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2; pond.position.copy(toScene(world.w * 0.82, world.h * 0.8)); pond.position.y = 0.02;
    this.scene.add(pond);

    // trees — deterministic scatter (no RNG, keeps sim determinism intact)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a34, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const fx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const fy = (Math.sin(i * 78.233) * 12543.128) % 1;
      const x = (Math.abs(fx) * 0.8 + 0.1) * world.w;
      const y = (Math.abs(fy) * 0.8 + 0.1) * world.h;
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), trunkMat);
      trunk.position.y = 0.6; trunk.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), leafMat);
      leaves.position.y = 1.7; leaves.castShadow = true;
      const s = 0.8 + Math.abs(fx) * 0.8;
      t.scale.setScalar(s);
      t.add(trunk, leaves);
      t.position.copy(toScene(x, y));
      this.scene.add(t);
    }

    // camera framing — lower, more cinematic angle
    const half = Math.max(gw, gh) / 2;
    this.camDist = half * 1.85;
    this.camHeight = half * 0.8;
    this.built = true;
  }

  private camDist = 20;
  private camHeight = 14;

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  draw(world: World): void {
    if (!this.built) this.buildScenery(world);

    // instance transforms
    const counts: Record<SpeciesId, number> = { chicken: 0, sheep: 0, cow: 0, fox: 0 };
    for (const a of world.animals) {
      const im = this.meshes[a.species];
      const i = counts[a.species];
      if (i >= MAX_INST) continue;
      const s = a.genes.size * a.born * 0.085;
      this.dummy.position.set((a.x - world.w / 2) * SC, s * 4, (a.y - world.h / 2) * SC);
      this.dummy.rotation.set(0, -a.heading, 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      im.setMatrixAt(i, this.dummy.matrix);
      counts[a.species] = i + 1;
    }
    (Object.keys(this.meshes) as SpeciesId[]).forEach((sp) => {
      const im = this.meshes[sp];
      im.count = counts[sp];
      im.instanceMatrix.needsUpdate = true;
    });

    // day / night
    const n = nightFactor(world.clock);
    const sky = new THREE.Color(lerp(0.49, 0.04, n), lerp(0.68, 0.06, n), lerp(0.9, 0.16, n));
    this.scene.background = sky;
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(sky);
    this.hemi.intensity = lerp(0.95, 0.25, n);
    this.sun.intensity = lerp(1.5, 0.18, n);
    this.sun.color.setRGB(lerp(1, 0.5, n), lerp(0.95, 0.6, n), lerp(0.84, 0.9, n));
    // sun arc across the sky by clock
    const ang = world.clock * Math.PI * 2 - Math.PI / 2;
    const R = this.camDist * 1.4;
    this.sun.position.set(Math.cos(ang) * R, Math.sin(ang) * R * 0.9 + 3, R * 0.35);
    this.sunBall.position.copy(this.sun.position).multiplyScalar(0.6);
    (this.sunBall.material as THREE.MeshBasicMaterial).color.setRGB(lerp(1, 0.7, n), lerp(0.94, 0.75, n), lerp(0.75, 0.95, n));

    // weather
    this.rain.visible = world.weather === 'rain';
    if (this.rain.visible) {
      const p = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - 0.8;
        if (y < 0) y = 40;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }

    // gentle ambient orbit — the "living painting" camera
    this.orbit += 0.0009;
    this.camera.position.set(Math.sin(this.orbit) * this.camDist, this.camHeight, Math.cos(this.orbit) * this.camDist);
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
