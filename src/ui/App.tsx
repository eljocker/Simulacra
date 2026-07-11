import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Engine, type RendererFactory } from '../engine/loop.ts';
import { HUD } from './HUD.tsx';
import { GodPanel } from './GodPanel.tsx';
import { Bitacora } from './Bitacora.tsx';

export function App({ makeRenderer }: { makeRenderer?: RendererFactory } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [gallery, setGallery] = useState(false);

  // Gallery / zero-player mode: hide the whole UI so it reads as a living painting.
  useEffect(() => {
    document.body.classList.toggle('gallery', gallery);
  }, [gallery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === 'g' || e.key === 'G') { e.preventDefault(); setGallery((v) => !v); }
      else if (e.key === 'Escape') setGallery(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // in gallery mode, fade the cursor + exit button away when the viewer is idle
  useEffect(() => {
    if (!gallery) { document.body.classList.remove('idle'); return; }
    let t = 0;
    const bump = () => {
      document.body.classList.remove('idle');
      clearTimeout(t);
      t = window.setTimeout(() => document.body.classList.add('idle'), 2600);
    };
    window.addEventListener('mousemove', bump);
    window.addEventListener('pointerdown', bump);
    bump();
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('pointerdown', bump);
      document.body.classList.remove('idle');
    };
  }, [gallery]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const eng = new Engine(canvas, makeRenderer);
    eng.start();
    setEngine(eng);
    // resume the previous session in the background — never block startup on it
    void eng.restoreLast();

    const onResize = () => eng.resize();
    const onHide = () => { if (document.visibilityState === 'hidden') void eng.saveAuto(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', () => void eng.saveAuto());
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onHide);
      void eng.saveAuto();
      eng.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="field" />
      <header className="masthead">
        <div className="eyebrow">Simulacra · La Granja</div>
        <h1>Una granja que <em>vive sola</em></h1>
        <p className="dek">Gallinas, ovejas y vacas pastan; los zorros acechan. Un cuadro vivo en 3D que evoluciona solo — y en el que puedes intervenir como un dios.</p>
      </header>
      {engine && <Connected engine={engine} />}
      <div className="toolhint">
        <b>Arrastrá</b> para girar la vista · <b>rueda</b> para zoom · <b>flechas</b> para ajustar
      </div>
      <button
        className={`gallery-btn${gallery ? ' exit' : ''}`}
        onClick={() => setGallery((v) => !v)}
        title="Modo galería (tecla G)"
      >
        {gallery ? '✕ Salir · G' : '⛶ Modo galería'}
      </button>
    </>
  );
}

function Connected({ engine }: { engine: Engine }) {
  const ui = useSyncExternalStore(engine.store.subscribe, engine.store.getSnapshot);
  return (
    <>
      <HUD stats={ui.stats} />
      <Bitacora events={ui.events} />
      <GodPanel engine={engine} ui={ui} />
    </>
  );
}
