import { addDays, addMonths, addYears, endOfDay } from 'date-fns'
import { format } from 'date-fns'
import { nowIn, wallTime } from './tz'

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'

// Stored as JSON on every event of a series.
//   interval: repeat every N days/weeks/months/years (default 1)
//   days:     weekly only, 0 = Sunday ... 6 = Saturday (default: the start's weekday)
//   until:    last date, "yyyy-MM-dd"        count: total number of events
// One of `until` / `count` is required: occurrences are stored as rows, so a series can't be endless.
//   never:    "never ends": stored a year ahead and topped up by extendOpenSeries; `anchor` is the
//             first occurrence (ISO instants), which the pattern is counted from
export type Recurrence = {
  freq: Freq; interval?: number; days?: number[]; until?: string; count?: number
  never?: boolean; anchor?: { start: string; end: string }
}

// How far ahead "never ends" series are kept filled
export const horizonDate = (timeZone: string) => format(addYears(nowIn(timeZone), 1), 'yyyy-MM-dd')

export const MAX_OCCURRENCES = 366

// Start/end of each occurrence. `start`/`end` must be zoned dates (from wallTime), so the
// wall-clock time stays the same across daylight-saving changes.
// Returns null if the rule has no end or would create more than MAX_OCCURRENCES.
// `after`: skip occurrences up to and including this instant (they already exist).
export function occurrences(start: Date, end: Date, rule: Recurrence, timeZone: string, after?: Date) {
  const interval = Math.max(1, Math.floor(rule.interval ?? 1))
  const until = rule.until ? endOfDay(wallTime(rule.until, timeZone)) : null
  if (!until && rule.count == null) return null
  const limit = rule.count ?? Infinity
  const out: { start: Date; end: Date }[] = []
  let overflow = false

  // false = stop generating (past the end date, enough events, or too many)
  const add = (s: Date, e: Date) => {
    if (until && s > until) return false
    if (after && s <= after) return true
    if (out.length >= limit) return false
    if (out.length >= MAX_OCCURRENCES) { overflow = true; return false }
    out.push({ start: s, end: e })
    return true
  }

  if (rule.freq === 'weekly') {
    const days = [...new Set(rule.days?.length ? rule.days : [start.getDay()])].sort((a, b) => a - b)
    const startDay = start.getDay()
    // Weeks run Sunday-Saturday; every `interval`-th week gets the chosen days
    weeks: for (let w = 0; ; w++) {
      const base = 7 * interval * w - startDay // offset (in days) of this week's Sunday
      if (until && addDays(start, base) > until) break
      for (const d of days) {
        const offset = base + d
        if (offset < 0) continue // earlier than the first event
        if (!add(addDays(start, offset), addDays(end, offset))) break weeks
      }
    }
  } else {
    const step = { daily: addDays, monthly: addMonths, yearly: addYears }[rule.freq]
    for (let i = 0; add(step(start, i * interval), step(end, i * interval)); i++);
  }
  return overflow ? null : out
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const UNIT_WORD = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }

// "Every 2 weeks on Mon, Wed, until Dec 31, 2026" - shown in the form, and in event tooltips
export function describeRule(rule: Recurrence) {
  const n = Math.max(1, Math.floor(rule.interval ?? 1))
  const days = rule.days?.length ? [...rule.days].sort((a, b) => a - b) : []
  let text: string
  if (n === 1 && rule.freq === 'daily') text = 'Daily'
  else if (rule.freq === 'weekly' && n === 1 && days.join() === '1,2,3,4,5') text = 'Every weekday'
  else {
    text = n === 1 ? `Every ${UNIT_WORD[rule.freq]}` : `Every ${n} ${UNIT_WORD[rule.freq]}s`
    if (rule.freq === 'weekly' && days.length) text += ` on ${days.map((d) => DAY_ABBR[d]).join(', ')}`
  }
  if (rule.never) return `${text}, never ends`
  if (rule.until) return `${text}, until ${format(new Date(`${rule.until}T00:00`), 'MMM d, yyyy')}`
  if (rule.count) return `${text}, ${rule.count} ${rule.count === 1 ? 'time' : 'times'}`
  return text
}
