import { useEffect, useState } from 'react'
import { addDays, endOfDay, format, isToday, startOfDay } from 'date-fns'
import { getEvents, type CalendarEvent } from '../lib/api'
import { EventForm } from './EventForm'

const HOUR_PX = 48
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function timedStyle(e: CalendarEvent, day: Date) {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = endOfDay(day).getTime()
  const s = Math.max(new Date(e.starts_at).getTime(), dayStart)
  const en = Math.min(new Date(e.ends_at).getTime(), dayEnd)
  const top = ((s - dayStart) / 3_600_000) * HOUR_PX
  const height = Math.max(((en - s) / 3_600_000) * HOUR_PX, 18)
  return { top, height, background: e.color ?? undefined }
}

export function DayView() {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getEvents(startOfDay(day), endOfDay(day))
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => { cancelled = true }
  }, [day, reloadKey])

  const allDay = events.filter((e) => e.all_day)
  const timed = events.filter((e) => !e.all_day)

  return (
    <section className="month week">
      <header className="month-header">
        <button onClick={() => setDay(addDays(day, -1))}>‹</button>
        <h2>
          {isToday(day) && <span className="today-dot" title="Today" />}
          {format(day, 'EEEE, MMM d, yyyy')}
        </h2>
        <button onClick={() => setDay(addDays(day, 1))}>›</button>
        <button onClick={() => setDay(startOfDay(new Date()))}>Today</button>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="week-scroll">
        <div className="week-grid day-grid single week-allday">
          <div className="week-gutter">all-day</div>
          <div className="week-col" onClick={() => setEditing({ day })}>
            {allDay.map((e) => (
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
        </div>

        <div className="week-grid day-grid single week-body">
          <div className="week-gutter">
            {HOURS.map((h) => (
              <div key={h} className="week-hour-label" style={{ height: HOUR_PX }}>
                {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'ha')}
              </div>
            ))}
          </div>
          <div
            className="week-col week-timed"
            style={{ height: HOUR_PX * 24 }}
            onClick={() => setEditing({ day })}
          >
            {HOURS.map((h) => (
              <div key={h} className="week-hour-line" style={{ top: h * HOUR_PX }} />
            ))}
            {timed.map((e) => (
              <div
                key={e.id}
                className="event week-event"
                style={timedStyle(e, day)}
                onClick={(ev) => { ev.stopPropagation(); setEditing({ event: e }) }}
              >
                <strong>
                  {format(new Date(e.starts_at), 'HH:mm')}–{format(new Date(e.ends_at), 'HH:mm')}
                </strong>{' '}
                {e.title}
              </div>
            ))}
          </div>
        </div>
      </div>
      {editing && (
        <EventForm {...editing} onDone={() => { setEditing(null); setReloadKey((k) => k + 1) }} />
      )}
    </section>
  )
}
