import type { Animal } from '../sim/types.ts';
import { ANIMAL } from './palette.ts';

type C = CanvasRenderingContext2D;

function shadow(ctx: C, s: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.7, s * 1.1, s * 0.5, 0, 0, 6.2832);
  ctx.fill();
}

function eyes(ctx: C, s: number): void {
  ctx.fillStyle = ANIMAL.eye;
  const ex = s * 0.6, ey = s * 0.32, r = Math.max(0.9, s * 0.14);
  ctx.beginPath();
  ctx.arc(ex, -ey, r, 0, 6.2832);
  ctx.arc(ex, ey, r, 0, 6.2832);
  ctx.fill();
}

function chicken(ctx: C, s: number): void {
  shadow(ctx, s);
  // body
  ctx.fillStyle = ANIMAL.chickenBody;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 1.1, s * 0.95, 0, 0, 6.2832);
  ctx.fill();
  // comb
  ctx.fillStyle = ANIMAL.chickenComb;
  ctx.beginPath();
  ctx.arc(s * 0.5, -s * 0.75, s * 0.28, 0, 6.2832);
  ctx.fill();
  // beak
  ctx.fillStyle = ANIMAL.chickenBeak;
  ctx.beginPath();
  ctx.moveTo(s * 1.05, 0);
  ctx.lineTo(s * 1.7, -s * 0.22);
  ctx.lineTo(s * 1.7, s * 0.22);
  ctx.closePath();
  ctx.fill();
  eyes(ctx, s);
}

function sheep(ctx: C, s: number): void {
  shadow(ctx, s);
  // fluffy wool = overlapping circles
  ctx.fillStyle = ANIMAL.sheepWool;
  const puffs = [[-0.5, -0.4], [0.4, -0.5], [0.7, 0.2], [-0.1, 0.5], [-0.7, 0.1], [0.1, -0.1]];
  for (const [px, py] of puffs) {
    ctx.beginPath();
    ctx.arc(px * s, py * s, s * 0.62, 0, 6.2832);
    ctx.fill();
  }
  // face
  ctx.fillStyle = ANIMAL.sheepFace;
  ctx.beginPath();
  ctx.ellipse(s * 0.75, 0, s * 0.4, s * 0.32, 0, 0, 6.2832);
  ctx.fill();
}

function cow(ctx: C, s: number): void {
  shadow(ctx, s);
  // body
  ctx.fillStyle = ANIMAL.cowBody;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 1.2, s * 0.85, 0, 0, 6.2832);
  ctx.fill();
  // spots
  ctx.fillStyle = ANIMAL.cowSpot;
  ctx.beginPath();
  ctx.ellipse(-s * 0.4, -s * 0.25, s * 0.42, s * 0.34, 0.4, 0, 6.2832);
  ctx.ellipse(s * 0.35, s * 0.3, s * 0.34, s * 0.26, -0.3, 0, 6.2832);
  ctx.fill();
  // head
  ctx.fillStyle = ANIMAL.cowBody;
  ctx.beginPath();
  ctx.ellipse(s * 1.05, 0, s * 0.45, s * 0.4, 0, 0, 6.2832);
  ctx.fill();
  eyes(ctx, s * 1.1);
}

function fox(ctx: C, s: number): void {
  shadow(ctx, s);
  // tail (behind, opposite heading)
  ctx.fillStyle = ANIMAL.foxDark;
  ctx.beginPath();
  ctx.ellipse(-s * 1.1, 0, s * 0.8, s * 0.42, 0, 0, 6.2832);
  ctx.fill();
  ctx.fillStyle = ANIMAL.foxTip;
  ctx.beginPath();
  ctx.arc(-s * 1.7, 0, s * 0.3, 0, 6.2832);
  ctx.fill();
  // body
  ctx.fillStyle = ANIMAL.foxBody;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 1.05, s * 0.72, 0, 0, 6.2832);
  ctx.fill();
  // ears
  ctx.fillStyle = ANIMAL.foxDark;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, -s * 0.55);
  ctx.lineTo(s * 0.95, -s * 1.05);
  ctx.lineTo(s * 1.0, -s * 0.35);
  ctx.moveTo(s * 0.55, s * 0.55);
  ctx.lineTo(s * 0.95, s * 1.05);
  ctx.lineTo(s * 1.0, s * 0.35);
  ctx.fill();
  // snout
  ctx.fillStyle = ANIMAL.foxTip;
  ctx.beginPath();
  ctx.moveTo(s * 0.8, 0);
  ctx.lineTo(s * 1.5, -s * 0.2);
  ctx.lineTo(s * 1.5, s * 0.2);
  ctx.closePath();
  ctx.fill();
  eyes(ctx, s);
}

const DRAW: Record<Animal['species'], (ctx: C, s: number) => void> = {
  chicken, sheep, cow, fox,
};

export function drawAnimal(ctx: C, a: Animal): void {
  const s = a.genes.size * a.born;
  if (s <= 0.2) return;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.heading);
  if (a.flash > 0) {
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
  }
  DRAW[a.species](ctx, s);
  ctx.restore();
  // sickness tint
  if (a.sick > 0) {
    ctx.fillStyle = 'rgba(150,220,90,0.35)';
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.genes.size * 1.3, 0, 6.2832);
    ctx.fill();
  }
}
