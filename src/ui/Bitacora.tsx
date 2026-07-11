import { useState } from 'react';
import type { LifeEvent, SpeciesId } from '../sim/types.ts';
import { ageLabel } from '../sim/time.ts';

const SP: Record<SpeciesId, { n: string; e: string }> = {
  chicken: { n: 'Gallina', e: '🐔' },
  sheep: { n: 'Oveja', e: '🐑' },
  cow: { n: 'Vaca', e: '🐄' },
  fox: { n: 'Zorro', e: '🦊' },
};

function hhmm(f: number): string {
  const total = Math.floor(f * 1440);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const DIVINE: Record<string, string> = {
  lluvia: '🌧️ Trajiste lluvia', sequía: '🏜️ Trajiste sequía', sol: '☀️ Despejaste el cielo',
  bendición: '✨ Bendición', meteorito: '☄️ Meteorito', alimento: '🌾 Esparciste grano',
};

function describe(e: LifeEvent): { icon: string; main: string; sub: string; tone: string } {
  if (e.kind === 'divine') {
    if (e.cause === 'peste') return { icon: '🦠', main: 'Peste', sub: `${e.by ?? 0} enfermaron`, tone: 'divine' };
    return { icon: DIVINE[e.cause ?? '']?.split(' ')[0] ?? '✨', main: (DIVINE[e.cause ?? ''] ?? 'Intervención').replace(/^\S+\s/, ''), sub: 'poder divino', tone: 'divine' };
  }
  const sp = e.species ? SP[e.species] : { n: 'Ser', e: '•' };
  if (e.kind === 'birth') {
    if (e.cause === 'huevo') return { icon: '🥚', main: `${sp.n} #${e.id}`, sub: 'puso un huevo', tone: 'birth' };
    const sub = e.cause === 'llegada' ? 'llegó de los bosques'
      : e.cause === 'divino' ? 'invocada por ti'
      : e.parent ? `nació · cría de #${e.parent}` : 'nació';
    return { icon: sp.e, main: `${sp.n} #${e.id}`, sub, tone: 'birth' };
  }
  const c = e.cause;
  const how = c === 'cazado' ? `cazada por 🦊 #${e.by}`
    : c === 'vejez' ? `murió de vejez · ${ageLabel(e.age ?? 0)}`
    : c === 'hambre' ? 'murió de hambre'
    : c === 'peste' ? 'murió por la peste'
    : c === 'meteorito' ? 'murió por un meteorito'
    : 'murió';
  return { icon: sp.e, main: `${sp.n} #${e.id}`, sub: how, tone: 'death' };
}

export function Bitacora({ events }: { events: LifeEvent[] }) {
  const [open, setOpen] = useState(window.innerWidth > 900);
  // meals and birthdays live in each animal's own story (the Ficha) — the Bitácora
  // stays a feed of births, deaths and divine acts so it doesn't get too noisy.
  const feed = events.filter((e) => e.kind !== 'meal' && e.kind !== 'milestone');
  const recent = feed.slice(-80).reverse();
  return (
    <section className={`bitacora${open ? '' : ' closed'}`}>
      <div className="bit-head" onClick={() => setOpen((o) => !o)}>
        <span className="bit-title">📜 Bitácora</span>
        <span className="bit-count">{feed.length}</span>
        <span className="chev">▾</span>
      </div>
      {open && (
        <div className="bit-body">
          {recent.length === 0
            ? <div className="bit-empty">Todavía no pasó nada digno de registrar. Cada nacimiento y muerte aparecerá aquí.</div>
            : recent.map((e) => {
              const d = describe(e);
              return (
                <div className={`bit-row ${d.tone}`} key={e.seq}>
                  <span className="bit-ic">{d.icon}</span>
                  <span className="bit-txt"><b>{d.main}</b> {d.sub}</span>
                  <span className="bit-time">{hhmm(e.clock)}</span>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
