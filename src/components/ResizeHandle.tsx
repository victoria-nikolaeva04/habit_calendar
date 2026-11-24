import type { PointerEvent } from 'react'

// The bottom edge of a timed event: drag it to change when the event ends
export function ResizeHandle({ onPointerDown }: { onPointerDown: (e: PointerEvent) => void }) {
  return (
    <span className="resize-handle" aria-hidden="true"
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e) }} />
  )
}
