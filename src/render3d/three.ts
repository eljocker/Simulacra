import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../sim/world.ts';
import type { SpeciesId } from '../sim/types.ts';
import type { IRenderer } from '../render/IRenderer.ts';

const SC = 0.06; // world px -> scene units
const MAX_INST = 280;

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
  if (clock > 0.8) return Math.min(1, (clock - 0.8) / 0.08);
  if (clock < 0.16) return Math.min(1, (0.16 - clock) / 0.08);
  return 0;
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
  private foot = {} as Record<SpeciesId, number>; // -min.y of each model: how high to sit it so its feet rest on the ground
  private dummy = new THREE.Object3D();
  private rain: THREE.Points;
  private built = false;

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

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0x5f8f3e, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground, this.scenery);

    (Object.keys(GEO) as SpeciesId[]).forEach((sp) => {
      const mat = new THREE.MeshStandardMaterial({ color: COLOR[sp], flatShading: true, roughness: 0.85 });
      const im = new THREE.InstancedMesh(GEO[sp](), mat, MAX_INST);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.geometry.computeBoundingBox();
      this.foot[sp] = -(im.geometry.boundingBox?.min.y ?? 0); // grounding offset
      this.meshes[sp] = im;
      this.scene.add(im);
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

    this.attachControls();
  }

  // ---- camera controls: drag to rotate, wheel to zoom, arrows/±to nudge ----
  private attachControls(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = true; this.lx = e.clientX; this.ly = e.clientY;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.az -= (e.clientX - this.lx) * 0.006;
      this.pol = clamp(this.pol - (e.clientY - this.ly) * 0.006, 0.22, 1.45);
      this.lx = e.clientX; this.ly = e.clientY;
      this.updateCamera();
    });
    const end = () => { this.drag = false; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
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

    const gw = world.w * SC, gh = world.h * SC;
    this.ground.geometry.dispose();
    this.ground.geometry = new THREE.PlaneGeometry(gw, gh);

    const toScene = (x: number, y: number) => new THREE.Vector3((x - world.w / 2) * SC, 0, (y - world.h / 2) * SC);

    // barn
    const barn = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: 0xc2503c, flatShading: true }));
    walls.position.y = 0.9;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x3a2b23, flatShading: true }));
    roof.position.y = 2.5; roof.rotation.y = Math.PI / 4;
    barn.add(walls, roof);
    barn.position.copy(toScene(world.w * 0.52 + 40, 90));
    this.scenery.add(barn);

    // pond
    const pond = new THREE.Mesh(new THREE.CircleGeometry(gw * 0.09, 24), new THREE.MeshStandardMaterial({ color: 0x3e7fa6, roughness: 0.3, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2; pond.position.copy(toScene(world.w * 0.82, world.h * 0.8)); pond.position.y = 0.02;
    this.scenery.add(pond);

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
      trunk.position.y = 0.6;
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), leafMat);
      leaves.position.y = 1.7;
      t.scale.setScalar(0.8 + Math.abs(fx) * 0.8);
      t.add(trunk, leaves);
      t.position.copy(toScene(x, y));
      this.scenery.add(t);
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
    for (const a of world.animals) {
      const im = this.meshes[a.species];
      const i = counts[a.species];
      if (i >= MAX_INST) continue;
      const s = a.genes.size * a.born * 0.085;
      // gravity rule: feet rest on the ground plane — foot offset scales with size,
      // so no animal can ever float or sink regardless of its model or scale.
      this.dummy.position.set((a.x - world.w / 2) * SC, this.foot[a.species] * s, (a.y - world.h / 2) * SC);
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

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
