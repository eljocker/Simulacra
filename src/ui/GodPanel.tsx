import { useCallback, useEffect, useState } from 'react';
import type { Engine } from '../engine/loop.ts';
import type { UIState } from '../engine/store.ts';
import type { SnapshotRecord } from '../persistence/db.ts';
import { PopulationChart } from './PopulationChart.tsx';

export function GodPanel({ engine, ui }: { engine: Engine; ui: UIState }) {
  const [collapsed, setCollapsed] = useState(window.innerWidth <= 640);
  const [saves, setSaves] = useState<SnapshotRecord[]>([]);

  const refresh = useCallback(() => {
    void engine.listSaved().then(setSaves);
  }, [engine]);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    await engine.saveNamed(`Día ${ui.stats.day} · ${hh}:${mm}`);
    refresh();
  };
  const load = async (id: string) => { await engine.loadSaved(id); };
  const del = async (id: string) => { await engine.deleteSaved(id); refresh(); };

  return (
    <section className={`dock${collapsed ? ' collapsed' : ''}`}>
      <div className="dock-head" onClick={() => setCollapsed((c) => !c)}>
        <span className="halo" />
        <h2>Panel divino</h2>
        <span className="chev">▾</span>
      </div>
      <div className="dock-body">
        <div className="chartwrap">
          <div className="clab"><span>Población y pasto</span><span>en el tiempo →</span></div>
          <PopulationChart history={ui.history} />
          <div className="legend">
            <span className="li"><span className="sw" style={{ background: 'var(--chicken)' }} />Gallinas</span>
            <span className="li"><span className="sw" style={{ background: 'var(--sheep)' }} />Ovejas</span>
            <span className="li"><span className="sw" style={{ background: 'var(--cow)' }} />Vacas</span>
            <span className="li"><span className="sw" style={{ background: 'var(--fox)' }} />Zorros</span>
            <span className="li"><span className="sw" style={{ background: 'var(--grass)' }} />Pasto</span>
          </div>
        </div>

        <div className="transport">
          <button className="b" onClick={() => engine.toggle()}>{ui.running ? '❚❚ Pausa' : '▶ Reanudar'}</button>
          <button className="b" onClick={() => engine.reset()}>↺ Reiniciar</button>
        </div>
        <div className="speed">
          <span className="lab">Tiempo</span>
          <input type="range" min={0.25} max={3} step={0.25} value={ui.speed}
            onChange={(e) => engine.setSpeed(parseFloat(e.target.value))} />
          <span className="val">{ui.speed.toFixed(2)}×</span>
        </div>

        <div className="group" style={{ marginTop: 15 }}>
          <div className="glab">☁️ Clima</div>
          <div className="btnrow c3">
            <button className={`b tall${ui.stats.weather === 'clear' ? ' on' : ''}`} onClick={() => engine.intervene({ kind: 'clear' })}><span className="e">☀️</span>Sol</button>
            <button className={`b tall${ui.stats.weather === 'rain' ? ' on' : ''}`} onClick={() => engine.intervene({ kind: 'rain' })}><span className="e">🌧️</span>Lluvia</button>
            <button className={`b tall${ui.stats.weather === 'drought' ? ' on' : ''}`} onClick={() => engine.intervene({ kind: 'drought' })}><span className="e">🏜️</span>Sequía</button>
          </div>
        </div>

        <div className="group">
          <div className="glab">🐾 Poblar</div>
          <div className="btnrow c4">
            <button className="b tall" onClick={() => engine.intervene({ kind: 'spawn', species: 'chicken', n: 3 })}><span className="e">🐔</span>+3</button>
            <button className="b tall" onClick={() => engine.intervene({ kind: 'spawn', species: 'sheep', n: 2 })}><span className="e">🐑</span>+2</button>
            <button className="b tall" onClick={() => engine.intervene({ kind: 'spawn', species: 'cow', n: 1 })}><span className="e">🐄</span>+1</button>
            <button className="b tall" onClick={() => engine.intervene({ kind: 'spawn', species: 'fox', n: 1 })}><span className="e">🦊</span>+1</button>
          </div>
        </div>

        <div className="group">
          <div className="glab">✨ Poderes divinos</div>
          <div className="btnrow c2" style={{ marginBottom: 7 }}>
            <button className="b" onClick={() => engine.intervene({ kind: 'blessing' })}><span className="e">✨</span>Bendición</button>
            <button className="b" onClick={() => engine.intervene({ kind: 'plague' })}><span className="e">🦠</span>Peste</button>
          </div>
          <div className="btnrow c2">
            <button className="b" onClick={() => engine.intervene({ kind: 'feed' })}><span className="e">🌾</span>Alimentar</button>
            <button className="b warn" onClick={() => engine.intervene({ kind: 'meteor' })}><span className="e">☄️</span>Meteorito</button>
          </div>
        </div>

        <div className="group" style={{ marginBottom: 4 }}>
          <div className="glab">💾 Memoria</div>
          <button className="b wide" style={{ marginBottom: 8 }} onClick={save}><span className="e">📸</span>Guardar snapshot</button>
          {saves.length === 0
            ? <div className="saves-empty">Aún no guardaste ninguna granja. Tu sesión se restaura sola al volver.</div>
            : (
              <div className="saves">
                {saves.map((s) => (
                  <div className="save-row" key={s.id}>
                    <span className="save-name" title={s.name}>{s.name}</span>
                    <button className="mini" title="Cargar" onClick={() => load(s.id)}>Cargar</button>
                    <button className="mini danger" title="Borrar" onClick={() => del(s.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </section>
  );
}
