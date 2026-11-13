import { useEffect, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek,
  format, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns'
import { getEvents, type CalendarEvent } from '../lib/api'
import { EventForm } from './EventForm'
import { formatTime, type TimeFormat } from '../lib/timeFormat'

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

function gridRange(month: Date, weekStartsOn: WeekDay) {
  return {
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  }
}

function eventsOn(day: Date, events: CalendarEvent[]) {
  return events.filter(
    (e) => new Date(e.starts_at) <= endOfDay(day) && new Date(e.ends_at) >= startOfDay(day),
  )
}

export function MonthView({ weekStartsOn = 0, timeFormat = '12h' }: { weekStartsOn?: WeekDay; timeFormat?: TimeFormat }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const { start, end } = gridRange(month, weekStartsOn)
  const days = eachDayOfInterval({ start, end })

  useEffect(() => {
    let cancelled = false
    const range = gridRange(month, weekStartsOn)
    getEvents(range.start, range.end)
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    // Ignore the result if the user changed months before it came back
    return () => { cancelled = true }
  }, [month, reloadKey, weekStartsOn])

  return (
    <section className="month">
      <header className="month-header">
        <button onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <h2>{format(month, 'MMMM yyyy')}</h2>
        <button onClick={() => setMonth(addMonths(month, 1))}>›</button>
        <button onClick={() => setMonth(startOfMonth(new Date()))}>Today</button>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="month-grid">
        {days.slice(0, 7).map((d) => format(d, 'EEE')).map((d) => (
          <div key={d} className="weekday">{d}</div>
        ))}
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={[
              'day',
              !isSameMonth(day, month) && 'outside',
              isToday(day) && 'today',
            ].filter(Boolean).join(' ')}
            onClick={() => setEditing({ day })}
          >
            <span className="day-number">{format(day, 'd')}</span>
            {eventsOn(day, events).map((e) => (
              <div
                key={e.id}
                className="event"
                style={{ background: e.color ?? undefined }}
                onClick={(ev) => { ev.stopPropagation(); setEditing({ event: e }) }}
              >
                {!e.all_day && formatTime(new Date(e.starts_at), timeFormat)} {e.title}
              </div>
            ))}
          </div>
        ))}
      </div>
      {editing && (
        <EventForm {...editing} onDone={() => { setEditing(null); setReloadKey((k) => k + 1) }} />
      )}
    </section>
  )
}