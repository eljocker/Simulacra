// Named regions of the farm. Positions are fractions of the field (w, h) — the
// same convention as the species habitats — so they map onto any terrain size.
// Used to highlight parts of the map and to choose where new creatures are born.
export interface Sector {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  cx: number; // centre, fraction of field width
  cy: number; // centre, fraction of field height
  r: number;  // radius, fraction of field width
}

export const SECTORS: Sector[] = [
  { id: 'gallinero', emoji: '🐔', name: 'El Gallinero', desc: 'La loma soleada del norte donde las gallinas picotean.', cx: 0.56, cy: 0.16, r: 0.17 },
  { id: 'pradera', emoji: '🐑', name: 'Pradera de Ovejas', desc: 'Pastizal alto del oeste donde el rebaño se junta a pastar.', cx: 0.28, cy: 0.62, r: 0.19 },
  { id: 'campo', emoji: '🐄', name: 'Campo de Vacas', desc: 'Tierra abierta y llana para el ganado.', cx: 0.72, cy: 0.48, r: 0.18 },
  { id: 'laguna', emoji: '🦆', name: 'La Laguna', desc: 'El agua del sureste donde nadan los patos.', cx: 0.82, cy: 0.8, r: 0.11 },
  { id: 'bosque', emoji: '🌳', name: 'El Bosque', desc: 'Arboleda del noroeste de la que caen frutas.', cx: 0.16, cy: 0.2, r: 0.15 },
];

export function sectorById(id: string | null): Sector | undefined {
  return id ? SECTORS.find((s) => s.id === id) : undefined;
}
