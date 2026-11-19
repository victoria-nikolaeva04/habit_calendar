import { MAX_REPEATS, describeRule, occurrences, type Freq, type Recurrence } from './recurrence'

// What the "Repeat" controls of the event and task forms hold: the dropdown choice (like Google Calendar:
// presets named after the start date, plus Custom) and the end of the repetition.
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom'

export type RepeatState = {
  repeat: Repeat
  until: string               // end date "yyyy-MM-dd"
  endMode: 'until' | 'count'
  count: string               // number of events, as typed
  never: boolean
  interval: string            // custom: repeat every N, as typed
  unit: Freq                  // custom: days / weeks / months / years
  days: number[]              // custom weekly: 0 = Sunday ... 6 = Saturday
}

export const initialRepeat = (weekday: number): RepeatState => ({
  repeat: 'none', until: '', endMode: 'until', count: '10', never: false, interval: '1', unit: 'weekly', days: [weekday],
})

// The chosen repeat pattern, without its end
export function repeatBase(s: RepeatState): Recurrence | null {
  return s.repeat === 'none' ? null
    : s.repeat === 'custom' ? { freq: s.unit, interval: Math.floor(Number(s.interval)) || 1, ...(s.unit === 'weekly' && { days: s.days }) }
    : s.repeat === 'weekdays' ? { freq: 'weekly', days: [1, 2, 3, 4, 5] }
    : { freq: s.repeat }
}

// The full rule to store, or null for "does not repeat"
export function repeatRule(s: RepeatState): Recurrence | null {
  const base = repeatBase(s)
  if (!base) return null
  return s.never ? { ...base, never: true } : { ...base, ...(s.endMode === 'until' ? { until: s.until } : { count: Math.floor(Number(s.count)) }) }
}

// A message about the first thing wrong with the repeat settings, or null
export function repeatError(s: RepeatState, noun: string): string | null {
  if (s.repeat === 'none') return null
  if (s.repeat === 'custom' && !(Math.floor(Number(s.interval)) >= 1)) return 'Repeat every must be 1 or more.'
  if (!s.never && s.endMode === 'until' && !s.until) return 'Please choose when the repetition ends.'
  if (!s.never && s.endMode === 'count' && !(Math.floor(Number(s.count)) >= 1)) return `Number of ${noun} must be 1 or more.`
  if (s.repeat === 'custom' && s.unit === 'weekly' && s.days.length === 0) return 'Pick at least one day of the week.'
  return null
}

// Plain-English summary, e.g. "Every 2 weeks on Mon, Wed, until Dec 31, 2026 · 14 events". `start` may be invalid
// while the date field is being edited. `zone` is the zone the occurrences are counted in.
export function repeatSummary(s: RepeatState, start: Date, zone: string, noun: string): string | null {
  const base = repeatBase(s)
  if (!base) return null
  const count = Math.floor(Number(s.count))
  const rule: Recurrence = {
    ...base,
    ...(s.never ? { never: true } : s.endMode === 'until' ? (s.until ? { until: s.until } : {}) : count >= 1 ? { count } : {}),
  }
  let text = describeRule(rule)
  if (!s.never && (rule.until || rule.count) && !isNaN(start.getTime())) {
    const n = occurrences(start, start, rule, zone)?.length
    const word = (k: number) => (k === 1 ? noun.replace(/s$/, '') : noun)
    text += n == null ? ` · over ${MAX_REPEATS} ${noun}` : ` · ${n} ${word(n)}`
  }
  return text
}
