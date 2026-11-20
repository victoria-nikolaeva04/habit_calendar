import type { CSSProperties } from 'react'

// Relative luminance of a #rrggbb color (WCAG)
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Black or white, whichever contrasts more with the background
export function textOn(hex: string) {
  const l = luminance(hex)
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#111827'
}

// Colors for an event chip; null/invalid color falls back to the stylesheet's default look
export function eventStyle(color: string | null): CSSProperties {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return {}
  // The stylesheet tints the chip from this color (dark tinted background, lighter text, colored accent)
  return { '--ev': color } as CSSProperties
}
