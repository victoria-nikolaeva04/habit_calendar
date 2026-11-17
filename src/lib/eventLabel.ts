import type { CalendarEvent } from './api'
import { formatTime, type TimeFormat } from './timeFormat'
import { inTz } from './tz'
import { describeRule, type Recurrence } from './recurrence'

// Hover text for an event chip: full title, time range and notes (chips truncate long titles)
export function eventTooltip(e: CalendarEvent, timeZone: string, tf: TimeFormat) {
  const when = e.all_day
    ? 'All day'
    : `${formatTime(inTz(e.starts_at, timeZone), tf)} – ${formatTime(inTz(e.ends_at, timeZone), tf)}`
  const repeats = e.series_id && e.recurrence ? `↻ ${describeRule(e.recurrence as Recurrence)}` : null
  return [e.title, when, repeats, e.notes].filter(Boolean).join('\n')
}
