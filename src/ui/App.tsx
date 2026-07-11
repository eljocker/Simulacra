import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Engine } from '../engine/loop.ts';
import { HUD } from './HUD.tsx';
import { GodPanel } from './GodPanel.tsx';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const eng = new Engine(canvas);
    eng.start();
    setEngine(eng);

    const onResize = () => eng.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      eng.stop();
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!engine) return;
    const rect = e.currentTarget.getBoundingClientRect();
    engine.click(e.clientX - rect.left, e.clientY - rect.top);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`field${engine && engineTool(engine) === 'feed' ? ' tool-feed' : ''}`}
        onPointerDown={onPointerDown}
      />
      <header className="masthead">
        <div className="eyebrow">Simulacra · La Granja</div>
        <h1>Una granja que <em>vive sola</em></h1>
        <p className="dek">Gallinas, ovejas y vacas pastan; los zorros acechan. Todo sigue su curso… hasta que intervienes tú. Trae la lluvia, desata una peste o siembra el caos con un meteorito.</p>
      </header>
      {engine && <Connected engine={engine} />}
      <div className="toolhint">
        <b>Clic</b> en el campo para usar la herramienta activa · abre el <b>Panel divino</b> para intervenir
      </div>
    </>
  );
}

function engineTool(engine: Engine): string {
  return engine.store.getSnapshot().tool;
}

function Connected({ engine }: { engine: Engine }) {
  const ui = useSyncExternalStore(engine.store.subscribe, engine.store.getSnapshot);
  return (
    <>
      <HUD stats={ui.stats} />
      <GodPanel engine={engine} ui={ui} />
    </>
  );
}
