import type { Engine } from '../engine/loop.ts';
import type { RewindUI } from '../engine/store.ts';
import { calendar } from '../sim/time.ts';

function hhmm(f: number): string {
  const total = Math.floor(f * 1440);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Bottom bar for the read-only "view the past" mode: scrub a timeline of captured
// moments, read the calendar of what you're watching, and step back to the present.
export function RewindBar({ engine, rewind }: { engine: Engine; rewind: RewindUI }) {
  const cal = calendar(rewind.day);
  const last = Math.max(0, rewind.count - 1);
  const pct = last ? Math.round((rewind.index / last) * 100) : 100;
  return (
    <section className="rewind">
      <div className="rw-top">
        <span className="rw-tag">⏪ Viendo el pasado</span>
        <span className="rw-ro">👁 solo lectura</span>
        <span className="rw-when">🗓️ Año {cal.year} · Día {cal.dayOfYear} · {hhmm(rewind.clock)}</span>
      </div>
      <div className="rw-scrub">
        <button className="rw-play" onClick={() => engine.toggleRewindPlay()}
          title={rewind.playing ? 'Pausar' : 'Reproducir el pasado'}>
          {rewind.playing ? '❚❚' : '▶'}
        </button>
        <span className="rw-ends">antes</span>
        <input
          type="range" min={0} max={last} step={1} value={rewind.index}
          onChange={(e) => engine.seekRewind(parseInt(e.target.value, 10))}
        />
        <span className="rw-ends">ahora</span>
      </div>
      <div className="rw-foot">
        <span className="rw-pos">{rewind.playing ? '▶ reproduciendo' : '❚❚ en pausa'} · {pct}% · momento {rewind.index + 1}/{rewind.count}</span>
        <button className="rw-exit" onClick={() => engine.exitRewind()}>⏏ Volver al presente</button>
      </div>
    </section>
  );
}
