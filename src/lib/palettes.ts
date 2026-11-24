// Swatch sets ("themes") for event colors. An event stores only its hex color, so
// switching palette never recolors existing events.
export interface Palette { id: string; name: string; colors: string[] }

export const PALETTES: Palette[] = [
  { id: 'classic', name: 'Classic', colors: ['#5b6cff', '#ffa95c', '#38bdf8', '#34d399', '#f87171', '#f472b6', '#a78bfa', '#64748b'] },
  { id: 'pastel', name: 'Pastel', colors: ['#a5b4fc', '#fdba74', '#7dd3fc', '#86efac', '#fca5a5', '#f9a8d4', '#d8b4fe', '#cbd5e1'] },
  { id: 'vivid', name: 'Vivid', colors: ['#2563eb', '#f97316', '#0891b2', '#16a34a', '#dc2626', '#db2777', '#7c3aed', '#ca8a04'] },
  { id: 'earth', name: 'Earth', colors: ['#b45309', '#92400e', '#65a30d', '#4d7c0f', '#0f766e', '#9a3412', '#78716c', '#a16207'] },
  { id: 'matcha-strawberry', name: 'Strawberry', colors: ['#c66f80', '#f4c7d0', '#fcebf1', '#4a6644', '#9faa74', '#d7dab3', '#ece3d2', '#7d3a4a'] },
  { id: 'moonlight', name: 'Moonlight', colors: ['#241942', '#5f558d', '#9f86c0', '#be95c4', '#e0b1cb', '#3b2d63', '#7b6aa8', '#cdb4e0'] },
  { id: 'pastel-leafs', name: 'Leaf', colors: ['#839176', '#bfd1b7', '#9dada1', '#b3b88b', '#bdc8be', '#c1c4a3', '#cfd3c6', '#5f6e55'] },
  { id: 'summer-sunset', name: 'Sunset', colors: ['#f28c81', '#efa28a', '#e1bab3', '#e0a7bb', '#acaec6', '#d9695f', '#c98f9f', '#8e92b3'] },
]

const KEY = 'event-palette'

/** The palette chosen on the profile page (kept in this browser). */
export function getPalette(): Palette {
  try {
    const saved = localStorage.getItem(KEY)
    return PALETTES.find((p) => p.id === saved) ?? PALETTES[0]
  } catch { return PALETTES[0] }
}

export function setPalette(id: string) {
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
}
