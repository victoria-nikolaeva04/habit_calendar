import { Repeat } from 'lucide-react'

// Small "repeats" marker shown after the title of events that belong to a series
export function RepeatMark() {
  return <span className="repeat-mark" role="img" aria-label="Repeating event"><Repeat size={11} aria-hidden="true" /></span>
}
