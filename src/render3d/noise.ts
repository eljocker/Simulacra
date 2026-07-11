// Tiny deterministic value noise + fBm — no dependencies, no assets. Used for
// terrain relief and cloud shapes (the brief's procedural "anti-loop").
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (Math.imul(h ^ (h >>> 13), 1274126177)) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; // 0..1
}

// fractional Brownian motion — layered noise, returns ~0..1
export function fbm(x: number, y: number, octaves = 4): number {
  let f = 0, amp = 0.5, freq = 1, sum = 0;
  for (let i = 0; i < octaves; i++) {
    f += amp * valueNoise(x * freq, y * freq);
    sum += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return f / sum;
}
