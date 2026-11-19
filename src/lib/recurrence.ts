import {
  addDays, addMonths, addYears, differenceInCalendarDays, differenceInCalendarMonths,
  differenceInCalendarWeeks, differenceInCalendarYears, endOfDay, format, set,
} from 'date-fns'
import { inTz, wallTime } from './tz'

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'

// Stored as JSON on the series' master event; the occurrences themselves are never stored.
//   interval: repeat every N days/weeks/months/years (default 1)
//   days:     weekly only, 0 = Sunday ... 6 = Saturday (default: the start's weekday)
//   until:    last date, "yyyy-MM-dd"        count: total number of events
//   never:    no end (neither `until` nor `count`)
export type Recurrence = {
  freq: Freq; interval?: number; days?: number[]; until?: string; count?: number; never?: boolean
}

// Most events a series with an end may have (keeps counting and the form summary cheap)
export const MAX_REPEATS = 5000

const intervalOf = (rule: Recurrence) => Math.max(1, Math.floor(rule.interval ?? 1))

// The start of every occurrence, in order. `start` must be a zoned date (from wallTime/inTz), so the
// wall-clock time stays the same across daylight-saving changes.
// `from` is only a hint to skip ahead: generation may begin a step or two before it, never after.
// Endless for rules without an end, so callers must stop reading.
function* starts(start: Date, rule: Recurrence, timeZone: string, from?: Date): Generator<Date> {
  const n = intervalOf(rule)
  const until = rule.until ? endOfDay(wallTime(rule.until, timeZone)) : null
  const limit = rule.count ?? Infinity
  const zonedFrom = from && inTz(from, timeZone)

  if (rule.freq === 'weekly') {
    const days = [...new Set(rule.days?.length ? rule.days : [start.getDay()])].sort((a, b) => a - b)
    const startDay = start.getDay()
    const firstWeek = days.filter((d) => d >= startDay).length // events in the first (partial) week
    let w = zonedFrom ? Math.max(0, Math.floor(differenceInCalendarWeeks(zonedFrom, start) / n) - 1) : 0
    let emitted = w === 0 ? 0 : firstWeek + (w - 1) * days.length
    // Weeks run Sunday-Saturday; every `n`-th week gets the chosen days
    for (; ; w++) {
      const base = 7 * n * w - startDay // offset (in days) of this week's Sunday
      if (until && addDays(start, base) > until) return
      for (const d of days) {
        const offset = base + d
        if (offset < 0) continue // earlier than the first event
        if (emitted >= limit) return
        const s = addDays(start, offset)
        if (until && s > until) return
        emitted++
        yield s
      }
    }
  } else {
    const step = { daily: addDays, monthly: addMonths, yearly: addYears }[rule.freq]
    const diff = {
      daily: differenceInCalendarDays, monthly: differenceInCalendarMonths, yearly: differenceInCalendarYears,
    }[rule.freq]
    for (let i = zonedFrom ? Math.max(0, Math.floor(diff(zonedFrom, start) / n) - 1) : 0; i < limit; i++) {
      const s = step(start, i * n)
      if (until && s > until) return
      yield s
    }
  }
}

// Every occurrence keeps the original length: the same number of days after its start, ending at the
// same wall-clock time. (Shifting start and end separately would stretch an event across short months.)
function endOf(s: Date, start: Date, end: Date) {
  return set(addDays(s, differenceInCalendarDays(end, start)), {
    hours: end.getHours(), minutes: end.getMinutes(), seconds: end.getSeconds(), milliseconds: end.getMilliseconds(),
  })
}

export type Occurrence = { start: Date; end: Date }

// The occurrences of a series that overlap [from, to). Works for endless rules, and only walks the
// part of the series near the range.
export function expand(start: Date, end: Date, rule: Recurrence, timeZone: string, from: Date, to: Date) {
  const out: Occurrence[] = []
  // Begin early enough that an occurrence still running at `from` isn't skipped
  const lookback = addDays(from, -(differenceInCalendarDays(end, start) + 1))
  for (const s of starts(start, rule, timeZone, lookback)) {
    if (s >= to) break
    const e = endOf(s, start, end)
    if (e > from) out.push({ start: s, end: e })
  }
  return out
}

// All occurrences of a rule that ends (not `never`). Null if there are more than MAX_REPEATS.
export function occurrences(start: Date, end: Date, rule: Recurrence, timeZone: string) {
  if (rule.never || (!rule.until && rule.count == null)) return []
  const out: Occurrence[] = []
  for (const s of starts(start, rule, timeZone)) {
    if (out.length >= MAX_REPEATS) return null
    out.push({ start: s, end: endOf(s, start, end) })
  }
  return out
}

// The final occurrence of a rule that ends, or undefined if it has none
export function lastOccurrence(start: Date, end: Date, rule: Recurrence, timeZone: string): Occurrence | undefined {
  if (rule.never || (!rule.until && rule.count == null)) return undefined
  // With an end date, skip straight to the end of the series instead of walking all of it
  const from = rule.count == null && rule.until ? wallTime(rule.until, timeZone) : undefined
  let last: Date | undefined
  for (const s of starts(start, rule, timeZone, from)) last = s
  return last && { start: last, end: endOf(last, start, end) }
}

// The occurrence to show for a series in a list: the first one still running or ahead of `after` that `skip`
// doesn't exclude (e.g. deleted ones), or else the last one. Undefined if there is none.
export function upcomingOccurrence(
  start: Date, end: Date, rule: Recurrence, timeZone: string, after: Date, skip: (start: Date) => boolean,
): Occurrence | undefined {
  const lookback = addDays(after, -(differenceInCalendarDays(end, start) + 1))
  let tries = 0
  for (const s of starts(start, rule, timeZone, lookback)) {
    if (++tries > 1000) break
    const e = endOf(s, start, end)
    if (e > after && !skip(s)) return { start: s, end: e }
  }
  const last = lastOccurrence(start, end, rule, timeZone)
  return last && !skip(last.start) ? last : undefined
}

// Splits a series at the occurrence starting at `at` (a zoned date) for "this and following events":
//   before: the rule for the part before it (ends the day before), with its end
//           (null = nothing left before `at`, so the old series goes away)
//   after:  the rule for the new series that starts at `at`, running to the original end
export function splitRule(start: Date, end: Date, rule: Recurrence, timeZone: string, at: Date) {
  const { never, count, until, ...base } = rule
  const beforeRule: Recurrence = { ...base, until: format(addDays(at, -1), 'yyyy-MM-dd') }
  const last = lastOccurrence(start, end, beforeRule, timeZone)

  let after: Recurrence
  if (never) after = { ...base, never: true }
  else if (count != null) {
    let before = 0
    for (const s of starts(start, rule, timeZone)) { if (s >= at) break; before++ }
    after = { ...base, count: Math.max(1, count - before) }
  } else after = { ...base, until }

  return { before: last ? { rule: beforeRule, endsAt: last.end } : null, after }
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
