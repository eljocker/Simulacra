import { useEffect, useRef } from 'react';
import type { HistoryPoint } from '../engine/store.ts';

const SERIES: { key: keyof HistoryPoint; color: string; scale: number; fill: number }[] = [
  { key: 'grass', color: '#5a9440', scale: 1, fill: 0.14 },
  { key: 'cow', color: '#33333b', scale: 6, fill: 0 },
  { key: 'sheep', color: '#7b8695', scale: 3, fill: 0 },
  { key: 'fox', color: '#e0692a', scale: 8, fill: 0 },
  { key: 'chicken', color: '#cf9c1e', scale: 2.4, fill: 0 },
];
const CAP = 200;

export function PopulationChart({ history }: { history: HistoryPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cv.clientWidth || 280;
    const ch = cv.clientHeight || 76;
    if (cv.width !== Math.round(cw * dpr)) cv.width = Math.round(cw * dpr);
    if (cv.height !== Math.round(ch * dpr)) cv.height = Math.round(ch * dpr);
    const ctx = cv.getContext('2d')!;
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    if (history.length < 2) return;

    let mx = 12;
    for (const p of history) {
      mx = Math.max(mx, p.grass, p.chicken * 2.4, p.sheep * 3, p.cow * 6, p.fox * 8);
    }
    const pad = 3 * dpr;
    const xOf = (i: number) => (i / (CAP - 1)) * w;
    const yOf = (v: number, s: number) => h - pad - Math.min(1, (v * s) / mx) * (h - 2 * pad);

    for (const s of SERIES) {
      if (s.fill > 0) {
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
          const x = xOf(i), y = yOf(history[i][s.key], s.scale);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.lineTo(xOf(history.length - 1), h);
        ctx.lineTo(xOf(0), h);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.fill;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = xOf(i), y = yOf(history[i][s.key], s.scale);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = (s.key === 'grass' ? 1.2 : 1.8) * dpr;
      ctx.globalAlpha = s.key === 'grass' ? 0.6 : 1;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [history]);

  return <canvas ref={ref} className="chart" />;
}
