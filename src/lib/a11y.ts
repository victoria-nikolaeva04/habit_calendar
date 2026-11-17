import type { KeyboardEvent } from 'react'

// onKeyDown handler that makes a clickable <div role="button"> respond to Enter / Space.
// Ignores keys that bubbled up from a child (e.g. an event inside a day cell).
export const activate = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}
