import { useEffect, useState } from 'react'
import { addDays, endOfDay, format, isToday, startOfDay } from 'date-fns'
import { getEvents, type CalendarEvent } from '../lib/api'
import { eventStyle } from '../lib/eventStyle'
import { eventTooltip } from '../lib/eventLabel'
import { formatTime, type TimeFormat } from '../lib/timeFormat'
import { inTz } from '../lib/tz'
import { useHolidays } from '../hooks/useHolidays'
import { HolidayChip } from './HolidayChip'
import { EventPopup } from './EventPopup'
import { RepeatMark } from './RepeatMark'

type Props = {
  day: Date                     // the selected day, at the start of the day in the profile time zone
  timeZone: string
  timeFormat: TimeFormat
  holidayCountry?: string | null
  version: number               // changes when events were edited elsewhere, so the list reloads
  onGoTo: (day: Date) => void   // show another day (the calendar follows)
  onChanged: () => void         // an event was added, edited or deleted here
}

// When an event happens on `day`: "All day", "9:00 AM – 10:00 AM", or the part that falls on this day
function describeTime(e: CalendarEvent, day: Date, timeZone: string, tf: TimeFormat) {
  if (e.all_day) return 'All day'
  const start = inTz(e.starts_at, timeZone)
  const end = inTz(e.ends_at, timeZone)
  const startsEarlier = start < startOfDay(day)
  const endsLater = end > endOfDay(day)
  if (startsEarlier && endsLater) return 'All day'
  if (startsEarlier) return `Until ${formatTime(end, tf)}`
  if (endsLater) return `From ${formatTime(start, tf)}`
  return `${formatTime(start, tf)} – ${formatTime(end, tf)}`
}

// Side panel next to the calendar, built as a stack of sections so more can be added under "Events".
export function SidePanel({ day, timeZone, timeFormat, holidayCountry, version, onGoTo, onChanged }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const holidays = useHolidays(holidayCountry, day, day).get(format(day, 'yyyy-MM-dd')) ?? []

  useEffect(() => {
    let cancelled = false
    getEvents(startOfDay(day), endOfDay(day), timeZone)
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        setLoaded(true)
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => { cancelled = true }
  }, [day, timeZone, version, reloadKey])

  // All-day events first, then by start time
  const sorted = [...events].sort((a, b) => Number(b.all_day) - Number(a.all_day))

  return (
    <aside className="side-panel" aria-label="Day details">
      <header className="panel-header">
        <button aria-label="Previous day" onClick={() => onGoTo(addDays(day, -1))}>‹</button>
        <h2>
          {isToday(day) && <span className="today-dot" title="Today" />}
          {format(day, 'EEE, MMM d')}
        </h2>
        <button aria-label="Next day" onClick={() => onGoTo(addDays(day, 1))}>›</button>
      </header>

      {/* Sections: add new ones below (or above) this one; the panel scrolls when they don't fit */}
      <div className="panel-body">
        <section className="panel-section" aria-labelledby="panel-events-title">
          <div className="panel-section-head">
            <h3 id="panel-events-title">Events</h3>
            <button type="button" onClick={() => setEditing({ day })}>+ Add</button>
          </div>
          {holidays.map((h) => <HolidayChip key={h.name} holiday={h} />)}
          {error && <p role="alert">{error}</p>}
          {!error && loaded && sorted.length === 0 && <p className="panel-empty">Nothing planned for this day.</p>}
          <ul className="panel-events">
            {sorted.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="panel-event"
                  style={eventStyle(e.color)}
                  title={eventTooltip(e, timeZone, timeFormat)}
                  onClick={() => setEditing({ event: e })}
                >
                  <strong>{e.title}{e.series_id && <RepeatMark />}</strong>
                  <small>{describeTime(e, day, timeZone, timeFormat)}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {editing && (
        <EventPopup
          {...editing}
          timeZone={timeZone}
          timeFormat={timeFormat}
          onDone={() => { setEditing(null); setReloadKey((k) => k + 1); onChanged() }}
        />
      )}
    </aside>
  )
}
