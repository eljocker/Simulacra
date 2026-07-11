// The farm's own calendar. Time is driven by the simulation itself (not the wall
// clock), so pausing or changing speed changes how fast days — and lives — pass.
// A "year" is short in real terms: it just lets an animal live out a realistic
// span of years within a few minutes of watching.

export const DAY_LENGTH = 12;      // sim-seconds in one full day↔night cycle
export const DAYS_PER_YEAR = 2;    // days that make up one year of a life
export const SECONDS_PER_YEAR = DAY_LENGTH * DAYS_PER_YEAR; // 24s lived = one "year"

export function years(ageSeconds: number): number {
  return ageSeconds / SECONDS_PER_YEAR;
}

// A human age label: months for the very young, whole years after that.
export function ageLabel(ageSeconds: number): string {
  const y = years(ageSeconds);
  if (y < 1) {
    const months = Math.max(1, Math.round(y * 12));
    return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  }
  const yr = Math.floor(y);
  return `${yr} ${yr === 1 ? 'año' : 'años'}`;
}

// Calendar position (year + day-of-year) from the running day counter.
export function calendar(day: number): { year: number; dayOfYear: number } {
  const idx = Math.max(0, day - 1);
  return { year: Math.floor(idx / DAYS_PER_YEAR) + 1, dayOfYear: (idx % DAYS_PER_YEAR) + 1 };
}
