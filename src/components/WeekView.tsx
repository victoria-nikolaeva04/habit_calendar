import { useEffect, useState } from 'react'
import {
  addWeeks, eachDayOfInterval, endOfDay, endOfWeek, format,
  isToday, startOfDay, startOfWeek,
} from 'date-fns'
import { getEvents, type CalendarEvent } from '../lib/api'
import { EventForm } from './EventForm'

const HOUR_PX = 48
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function eventsOn(day: Date, events: CalendarEvent[]) {
  return events.filter(
    (e) => new Date(e.starts_at) <= endOfDay(day) && new Date(e.ends_at) >= startOfDay(day),
  )
}

// Position a timed event inside a day column, clamped to that day
function timedStyle(e: CalendarEvent, day: Date) {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = endOfDay(day).getTime()
  const s = Math.max(new Date(e.starts_at).getTime(), dayStart)
  const en = Math.min(new Date(e.ends_at).getTime(), dayEnd)
  const top = ((s - dayStart) / 3_600_000) * HOUR_PX
  const height = Math.max(((en - s) / 3_600_000) * HOUR_PX, 18)
  return { top, height, background: e.color ?? undefined }
}

export function WeekView() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart) })

  useEffect(() => {
    let cancelled = false
    getEvents(weekStart, endOfWeek(weekStart))
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => { cancelled = true }
  }, [weekStart, reloadKey])

  const last = days[6]
  const title = weekStart.getMonth() === last.getMonth()
    ? `${format(weekStart, 'MMM d')} – ${format(last, 'd, yyyy')}`
    : `${format(weekStart, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`

  return (
    <section className="month week">
      <header className="month-header">
        <button onClick={() => setWeekStart(addWeeks(weekStart, -1))}>‹</button>
        <h2>{title}</h2>
        <button onClick={() => setWeekStart(addWeeks(weekStart, 1))}>›</button>
        <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="week-scroll">
        <div className="week-grid week-head">
          <div className="week-gutter" />
          {days.map((day) => (
            <div key={day.toISOString()} className={`week-dayhead${isToday(day) ? ' today' : ''}`}>
              <span>{format(day, 'EEE')}</span>
              <span className="day-number">{format(day, 'd')}</span>
            </div>
          ))}
        </div>

        <div className="week-grid week-allday">
          <div className="week-gutter">all-day</div>
          {days.map((day) => (
            <div key={day.toISOString()} className="week-col" onClick={() => setEditing({ day })}>
              {eventsOn(day, events).filter((e) => e.all_day).map((e) => (
                <div
                  key={e.id}
                  className="event"
                  style={{ background: e.color ?? undefined }}
                  onClick={(ev) => { ev.stopPropagation(); setEditing({ event: e }) }}
                >
                  {e.title}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="week-grid week-body">
          <div className="week-gutter">
            {HOURS.map((h) => (
              <div key={h} className="week-hour-label" style={{ height: HOUR_PX }}>
                {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'ha')}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`week-col week-timed${isToday(day) ? ' today' : ''}`}
              style={{ height: HOUR_PX * 24 }}
              onClick={() => setEditing({ day })}
            >
              {HOURS.map((h) => (
                <div key={h} className="week-hour-line" style={{ top: h * HOUR_PX }} />
              ))}
              {eventsOn(day, events).filter((e) => !e.all_day).map((e) => (
                <div
                  key={e.id}
                  className="event week-event"
                  style={timedStyle(e, day)}
                  onClick={(ev) => { ev.stopPropagation(); setEditing({ event: e }) }}
                >
                  <strong>{format(new Date(e.starts_at), 'HH:mm')}</strong> {e.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <EventForm {...editing} onDone={() => { setEditing(null); setReloadKey((k) => k + 1) }} />
      )}
    </section>
  )
}
