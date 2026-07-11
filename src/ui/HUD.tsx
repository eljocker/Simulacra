import { useState } from 'react';
import type { Stats } from '../sim/types.ts';
import type { EntityKind, Roster } from '../engine/store.ts';
import { calendar } from '../sim/time.ts';

function timeOfDay(clock: number): { label: string; icon: string } {
  if (clock < 0.1 || clock >= 0.88) return { label: 'Noche', icon: '🌙' };
  if (clock < 0.3) return { label: 'Amanecer', icon: '🌅' };
  if (clock < 0.5) return { label: 'Mañana', icon: '☀️' };
  if (clock < 0.7) return { label: 'Tarde', icon: '🌤️' };
  return { label: 'Atardecer', icon: '🌇' };
}
function formatClock(f: number): string {
  const total = Math.floor(f * 1440);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
const WEATHER: Record<Stats['weather'], string> = { clear: '☀️ Despejado', rain: '🌧️ Lluvia', drought: '🏜️ Sequía' };

// a fullness dot colour: green well-fed, amber peckish, red starving
function dotColor(f: number): string {
  if (f > 0.4) return 'var(--grass)';
  if (f > 0.18) return '#e0a13a';
  return '#c2503c';
}

const GROUPS: { kind: EntityKind; ic: string; name: string; col: string }[] = [
  { kind: 'chicken', ic: '🐔', name: 'Gallinas', col: 'var(--chicken)' },
  { kind: 'sheep', ic: '🐑', name: 'Ovejas', col: 'var(--sheep)' },
  { kind: 'cow', ic: '🐄', name: 'Vacas', col: 'var(--cow)' },
  { kind: 'fox', ic: '🦊', name: 'Zorros', col: 'var(--fox)' },
  { kind: 'duck', ic: '🦆', name: 'Patos', col: 'var(--duck)' },
  { kind: 'scavenger', ic: '🦅', name: 'Buitres', col: 'var(--ink-soft)' },
];

export function HUD({ stats, roster, selectedId, onSelect }: {
  stats: Stats;
  roster: Roster;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const tod = timeOfDay(stats.clock);
  const cal = calendar(stats.day);
  const [open, setOpen] = useState<EntityKind | null>(null);

  return (
    <div className="hud">
      <div className="clock">
        <span className="day">🕐 {formatClock(stats.clock)}</span>
        <span className="tod">{tod.icon} {tod.label}</span>
      </div>
      <div className="cal">🗓️ Año {cal.year} · Día {cal.dayOfYear}</div>
      <div className="rows">
        {GROUPS.map(({ kind, ic, name, col }) => {
          const count = stats[kind];
          const list = roster[kind];
          const isOpen = open === kind;
          return (
            <div className="grp" key={kind}>
              <button
                className={`r rbtn${isOpen ? ' open' : ''}`}
                onClick={() => setOpen(isOpen ? null : kind)}
                title="Ver individuos"
              >
                <span className="lft">
                  <span className={`chev${isOpen ? ' down' : ''}`}>▸</span>
                  <span className="ic">{ic}</span>{name}
                </span>
                <span className="v" style={{ color: col }}>{count}</span>
              </button>
              {isOpen && (
                <div className="sub">
                  {list.length === 0
                    ? <div className="sub-empty">Ninguno por ahora</div>
                    : list.map((e) => (
                      <button
                        key={e.id}
                        className={`sub-i${selectedId === e.id ? ' sel' : ''}`}
                        onClick={() => onSelect(e.id)}
                        title={`Seguir a #${e.id}`}
                      >
                        <span className="sub-ic">{ic}</span>
                        <span className="sub-id">#{e.id}</span>
                        <span className="sub-age">{Math.round(e.age)}s</span>
                        <span className="sub-dot" style={{ background: dotColor(e.f) }} />
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between' }}>
        <span>🌾 Pasto</span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{Math.round(stats.grass)}%</span>
      </div>
      <div className="bar"><span style={{ width: `${Math.round(stats.grass)}%` }} /></div>
      <div style={{ marginTop: 9, fontSize: 11, color: 'var(--ink-soft)' }}>{WEATHER[stats.weather]}</div>
    </div>
  );
}
