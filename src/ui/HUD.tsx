import type { Stats } from '../sim/types.ts';

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

export function HUD({ stats }: { stats: Stats }) {
  const tod = timeOfDay(stats.clock);
  const rows: [string, string, number, string][] = [
    ['🐔', 'Gallinas', stats.chicken, 'var(--chicken)'],
    ['🐑', 'Ovejas', stats.sheep, 'var(--sheep)'],
    ['🐄', 'Vacas', stats.cow, 'var(--cow)'],
    ['🦊', 'Zorros', stats.fox, 'var(--fox)'],
  ];
  return (
    <div className="hud">
      <div className="clock">
        <span className="day">🕐 {formatClock(stats.clock)}</span>
        <span className="tod">{tod.icon} {tod.label}</span>
      </div>
      <div className="rows">
        {rows.map(([ic, name, v, col]) => (
          <div className="r" key={name}>
            <span className="lft"><span className="ic">{ic}</span>{name}</span>
            <span className="v" style={{ color: col }}>{v}</span>
          </div>
        ))}
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
