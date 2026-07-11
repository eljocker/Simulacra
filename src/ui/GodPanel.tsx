import { useCallback, useEffect, useState } from 'react';
import type { Engine } from '../engine/loop.ts';
import type { UIState } from '../engine/store.ts';
import type { SnapshotRecord } from '../persistence/db.ts';
import { PopulationChart } from './PopulationChart.tsx';
import { SECTORS, sectorById } from '../sim/sectors.ts';

const TERRAINS = [
  { n: 'Chico', v: 0.75 },
  { n: 'Mediano', v: 1.0 },
  { n: 'Grande', v: 1.4 },
];
const DENSITIES = [
  { n: 'Baja', v: 0.6 },
  { n: 'Media', v: 1.0 },
  { n: 'Alta', v: 1.5 },
];
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

// how long one in-game day lasts in real time at a given speed (1× = 5 min)
const REAL_SECONDS_PER_DAY_1X = 300;
function dayLength(speed: number): string {
  const secs = REAL_SECONDS_PER_DAY_1X / speed;
  if (secs < 60) return `${Math.round(secs)} s`;
  const m = Math.floor(secs / 60), s = Math.round(secs % 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}

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

  const past = ui.rewind;
  return (
    <section className={`dock${collapsed ? ' collapsed' : ''}${past.active ? ' viewing-past' : ''}`}>
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
          <button className="b" disabled={past.active} onClick={() => engine.toggle()}>{ui.running ? '❚❚ Pausa' : '▶ Reanudar'}</button>
          <button className="b" onClick={() => engine.reset()}>↺ Reiniciar</button>
        </div>
        <button className="b wide past-btn" style={{ marginBottom: 10 }}
          disabled={past.count < 2 || past.active}
          title={past.count < 2 ? 'Todavía no hay suficiente historia' : 'Retroceder y ver lo que pasó'}
          onClick={() => engine.enterRewind()}>
          <span className="e">⏪</span> Ver el pasado
        </button>
        <div className="speed">
          <span className="lab">Ritmo</span>
          <input type="range" min={0.5} max={8} step={0.5} value={ui.speed}
            onChange={(e) => engine.setSpeed(parseFloat(e.target.value))} />
          <span className="val">{ui.speed}×</span>
        </div>
        <div className="speed-hint">🕐 A <b>1×</b> un día dura <b>5 min</b> reales · ahora un día ≈ <b>{dayLength(ui.speed)}</b></div>

        <div className="group" style={{ marginTop: 15 }}>
          <div className="glab">🌍 Mundo <span className="ghint">reinicia la granja</span></div>
          <div className="seg-lab">Tamaño del terreno</div>
          <div className="seg">
            {TERRAINS.map((t) => (
              <button key={t.v} className={`sb${near(ui.terrainSize, t.v) ? ' on' : ''}`}
                onClick={() => engine.setTerrainSize(t.v)}>{t.n}</button>
            ))}
          </div>
          <div className="seg-lab">Densidad de población</div>
          <div className="seg">
            {DENSITIES.map((d) => (
              <button key={d.v} className={`sb${near(ui.density, d.v) ? ' on' : ''}`}
                onClick={() => engine.setDensity(d.v)}>{d.n}</button>
            ))}
          </div>
        </div>

        <div className="group">
          <div className="glab">☁️ Clima</div>
          <div className="btnrow c3">
            <button className={`b tall${ui.stats.weather === 'clear' ? ' on' : ''}`} onClick={() => engine.intervene({ kind: 'clear' })}><span className="e">☀️</span>Sol</button>
            <button className={`b tall${ui.stats.weather === 'rain' ? ' on' : ''}`} onClick={() => engine.intervene({ kind: 'rain' })}><span className="e">🌧️</span>Lluvia</button>
            <button className={`b tall${ui.stats.weather === 'drought' ? ' on' : ''}`} onClick={() => engine.intervene({ kind: 'drought' })}><span className="e">🏜️</span>Sequía</button>
          </div>
        </div>

        <div className="group">
          <div className="glab">🗺️ Sectores <span className="ghint">dónde nacen · click resalta</span></div>
          <div className="sectors">
            {SECTORS.map((s) => (
              <button key={s.id} className={`sector-chip${ui.sector === s.id ? ' on' : ''}`}
                onClick={() => engine.setSector(s.id)} title={s.desc}>
                <span className="e">{s.emoji}</span>{s.name.replace(/^(El |La |Campo de |Pradera de )/, '')}
              </button>
            ))}
          </div>
          {ui.sector
            ? <div className="sector-desc">{sectorById(ui.sector)?.emoji} <b>{sectorById(ui.sector)?.name}</b> — {sectorById(ui.sector)?.desc}</div>
            : <div className="sector-desc dim">Sin sector: las crías nacen en cualquier parte. Elegí uno para dirigir dónde nacen.</div>}
        </div>

        <div className="group">
          <div className="glab">🐾 Poblar <span className="ghint">nacen con edad 0{ui.sector ? ` · en ${sectorById(ui.sector)?.name}` : ''}</span></div>
          <div className="btnrow" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            <button className="b tall" onClick={() => engine.spawn('chicken', 3)}><span className="e">🐔</span>+3</button>
            <button className="b tall" onClick={() => engine.spawn('sheep', 2)}><span className="e">🐑</span>+2</button>
            <button className="b tall" onClick={() => engine.spawn('cow', 1)}><span className="e">🐄</span>+1</button>
            <button className="b tall" onClick={() => engine.spawn('fox', 1)}><span className="e">🦊</span>+1</button>
            <button className="b tall" onClick={() => engine.spawn('duck', 2)}><span className="e">🦆</span>+2</button>
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
