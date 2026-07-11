import type { Engine } from '../engine/loop.ts';
import type { LifeEvent } from '../sim/types.ts';
import type { EntityKind, SelectedInfo } from '../engine/store.ts';
import { fullness, growthFactor, hungerLabel, lifeStage } from '../sim/species.ts';
import { SCAV_MAXAGE, SCAV_REPRO_AT } from '../sim/world.ts';
import { ageLabel } from '../sim/time.ts';

const MEAL: Record<string, string> = {
  pasto: '🌾 Pastó', grano: '🌽 Comió grano', fruta: '🍎 Comió fruta', presa: '🍖 Cazó una presa',
};

const SP: Record<EntityKind, { n: string; e: string; diet: string }> = {
  chicken: { n: 'Gallina', e: '🐔', diet: 'Herbívora · pica pasto' },
  sheep: { n: 'Oveja', e: '🐑', diet: 'Herbívora · pasta' },
  cow: { n: 'Vaca', e: '🐄', diet: 'Herbívora · pasta' },
  fox: { n: 'Zorro', e: '🦊', diet: 'Carnívoro · caza gallinas' },
  scavenger: { n: 'Buitre', e: '🦅', diet: 'Carroñero · devora cadáveres' },
};

const SCAV_STATE: Record<NonNullable<SelectedInfo['state']>, string> = {
  cruise: '🕊️ Sobrevolando',
  dive: '⬇️ En picada',
  feed: '🍖 Devorando',
};

function hhmm(f: number): string {
  const total = Math.floor(f * 1440);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// A one-line story for each event in this creature's timeline.
function line(e: LifeEvent): { ic: string; txt: string; tone: string } {
  if (e.kind === 'birth') {
    if (e.cause === 'huevo') return { ic: '🥚', txt: 'Puso un huevo', tone: 'birth' };
    const t = e.cause === 'llegada' ? 'Llegó de los bosques'
      : e.cause === 'divino' ? 'Invocada por ti'
      : e.parent ? `Nació · cría de #${e.parent}` : 'Nació';
    return { ic: '🌱', txt: t, tone: 'birth' };
  }
  if (e.kind === 'death') {
    const c = e.cause;
    const t = c === 'cazado' ? `Cazada por 🦊 #${e.by}`
      : c === 'vejez' ? `Murió de vejez · ${ageLabel(e.age ?? 0)}`
      : c === 'hambre' ? 'Murió de hambre'
      : c === 'peste' ? 'Murió por la peste'
      : c === 'meteorito' ? 'Murió por un meteorito'
      : 'Murió';
    return { ic: '🕊️', txt: t, tone: 'death' };
  }
  if (e.kind === 'meal') {
    const m = MEAL[e.cause ?? ''] ?? '🍽 Comió';
    return { ic: m.split(' ')[0], txt: m.replace(/^\S+\s/, ''), tone: 'meal' };
  }
  return { ic: '✨', txt: 'Intervención divina', tone: 'divine' };
}

function Bar({ label, v, max, color }: { label: string; v: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="fk-bar">
      <span className="fk-bl">{label}</span>
      <span className="fk-track"><span className="fk-fill" style={{ width: `${pct}%`, background: color }} /></span>
    </div>
  );
}

export function Ficha({ engine, selected, events }: { engine: Engine; selected: SelectedInfo; events: LifeEvent[] }) {
  const sp = SP[selected.species];
  const story = events.filter((e) => e.id === selected.id).sort((a, b) => a.seq - b.seq);

  return (
    <section className="ficha">
      <div className="fk-head">
        <span className="fk-emoji">{sp.e}</span>
        <div className="fk-id">
          <b>{sp.n} #{selected.id}</b>
          <span className={`fk-status ${selected.alive ? 'live' : 'gone'}`}>
            {selected.alive ? '● Con vida' : '† Ya no está entre nosotros'}
          </span>
        </div>
        <button className="fk-close" title="Cerrar" onClick={() => engine.select(null)}>✕</button>
      </div>

      <div className="fk-diet">{sp.diet}</div>

      {selected.alive && selected.species === 'scavenger' && (
        <div className="fk-stats">
          {(() => {
            const energy = selected.energy ?? 0;
            const f = Math.max(0, Math.min(1, energy / SCAV_REPRO_AT));
            const col = f > 0.4 ? 'var(--grass)' : f > 0.18 ? '#e0a13a' : '#c2503c';
            return (
              <>
                <div className="fk-bar">
                  <span className="fk-bl">Energía</span>
                  <span className="fk-track"><span className="fk-fill" style={{ width: `${Math.round(f * 100)}%`, background: col }} /></span>
                </div>
                <div className="fk-hunger">
                  <span className="fk-hstate ok">{selected.state ? SCAV_STATE[selected.state] : '🕊️ Sobrevolando'}</span>
                </div>
              </>
            );
          })()}
          <div className="fk-meta">
            <span>⏳ Edad <b>{ageLabel(selected.age ?? 0)}</b></span>
            <span>❤️ Vida <b>{Math.round(Math.max(0, 100 - ((selected.age ?? 0) / SCAV_MAXAGE) * 100))}%</b></span>
          </div>
        </div>
      )}

      {selected.alive && selected.species !== 'scavenger' && (
        <div className="fk-stats">
          {(() => {
            const energy = selected.energy ?? 0;
            const f = fullness(selected.species, energy);
            const hl = hungerLabel(selected.species, energy);
            const col = hl.tone === 'crit' ? '#c2503c' : hl.tone === 'low' ? '#e0a13a' : 'var(--grass)';
            return (
              <>
                <div className="fk-bar">
                  <span className="fk-bl">Energía</span>
                  <span className="fk-track"><span className="fk-fill" style={{ width: `${Math.round(f * 100)}%`, background: col }} /></span>
                </div>
                <div className="fk-hunger">
                  <span className={`fk-hstate ${hl.tone}`}>{hl.emoji} {hl.label}</span>
                  {selected.eating && <span className="fk-eat">🍽 Comiendo</span>}
                </div>
              </>
            );
          })()}
          {(() => {
            const age = selected.age ?? 0;
            const stage = lifeStage(selected.species, age);
            const pct = Math.round(growthFactor(selected.species, age) * 100);
            return (
              <div className="fk-meta">
                <span>⏳ Edad <b>{ageLabel(age)}</b></span>
                <span>{stage.emoji} {stage.label} <b>{pct}%</b></span>
              </div>
            );
          })()}
          {selected.genes && (
            <div className="fk-genes">
              <span className="fk-gt">Genes</span>
              <Bar label="⚡ Velocidad" v={selected.genes.speed} max={2} color="#e8c15a" />
              <Bar label="👁 Sentido" v={selected.genes.sense} max={2} color="#7fc7e8" />
              <Bar label="⬆ Tamaño" v={selected.genes.size} max={2} color="#c88fe0" />
            </div>
          )}
        </div>
      )}

      <div className="fk-story">
        <div className="fk-st-lab">📜 Su historia</div>
        {story.length === 0
          ? <div className="fk-empty">Sin eventos registrados todavía.</div>
          : story.map((e) => {
            const l = line(e);
            return (
              <div className={`fk-ev ${l.tone}`} key={e.seq}>
                <span className="fk-ev-ic">{l.ic}</span>
                <span className="fk-ev-tx">{l.txt}</span>
                <span className="fk-ev-tm">{hhmm(e.clock)}</span>
              </div>
            );
          })}
      </div>
    </section>
  );
}
