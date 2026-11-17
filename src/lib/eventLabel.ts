import type { CalendarEvent } from './api'
import { formatTime, type TimeFormat } from './timeFormat'
import { inTz } from './tz'

// Hover text for an event chip: full title, time range and notes (chips truncate long titles)
export function eventTooltip(e: CalendarEvent, timeZone: string, tf: TimeFormat) {
  const when = e.all_day
    ? 'All day'
    : `${formatTime(inTz(e.starts_at, timeZone), tf)} – ${formatTime(inTz(e.ends_at, timeZone), tf)}`
  return [e.title, when, e.notes].filter(Boolean).join('\n')
}
