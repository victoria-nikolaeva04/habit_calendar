import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addWeeks, eachDayOfInterval, endOfWeek, format,
  isToday, startOfWeek,
} from 'date-fns'
import { getEvents, type CalendarEvent } from '../lib/api'
import { EventForm } from './EventForm'
import { formatTime, formatHour, type TimeFormat } from '../lib/timeFormat'
import { eventStyle } from '../lib/eventStyle'
import { eventTooltip } from '../lib/eventLabel'
import { activate } from '../lib/a11y'
import { inTz, nowIn } from '../lib/tz'
import { HOUR_PX, eventsOn, layoutTimed, slotAt } from '../lib/dayLayout'
import { useNow } from '../hooks/useNow'

const HOURS = Array.from({ length: 24 }, (_, i) => i)

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export function WeekView({ weekStartsOn = 0, timeFormat = '12h', timeZone }: { weekStartsOn?: WeekDay; timeFormat?: TimeFormat; timeZone: string }) {
  const opts = useMemo(() => ({ weekStartsOn }), [weekStartsOn])
  // Any date inside the visible week; the week itself is derived so a changed "week starts on" re-aligns it
  const [anchor, setAnchor] = useState(() => nowIn(timeZone))
  const weekStart = useMemo(() => startOfWeek(anchor, opts), [anchor, opts])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date; at?: Date } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, opts) })
  const scrollRef = useRef<HTMLDivElement>(null)
  const nowInZone = inTz(useNow(), timeZone)
  const nowTop = ((nowInZone.getHours() * 60 + nowInZone.getMinutes()) / 60) * HOUR_PX

  // Open scrolled to about the current hour instead of midnight
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, nowIn(timeZone).getHours() - 1) * HOUR_PX
  }, [timeZone])

  useEffect(() => {
    let cancelled = false
    getEvents(weekStart, endOfWeek(weekStart, opts))
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => { cancelled = true }
  }, [weekStart, reloadKey, opts])

  const last = days[6]
  const title = weekStart.getMonth() === last.getMonth()
    ? `${format(weekStart, 'MMM d')} – ${format(last, 'd, yyyy')}`
    : `${format(weekStart, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`

  return (
    <section className="month week">
      <header className="month-header">
        <button aria-label="Previous week" onClick={() => setAnchor(addWeeks(anchor, -1))}>‹</button>
        <h2>{title}</h2>
        <button aria-label="Next week" onClick={() => setAnchor(addWeeks(anchor, 1))}>›</button>
        <button onClick={() => setAnchor(nowIn(timeZone))}>Today</button>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="week-scroll" ref={scrollRef}>
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
            <div
              key={day.toISOString()}
              className="week-col"
              role="button"
              tabIndex={0}
              aria-label={`${format(day, 'EEEE, MMMM d')}: add all-day event`}
              onClick={() => setEditing({ day })}
              onKeyDown={activate(() => setEditing({ day }))}
            >
              {eventsOn(day, events).filter((e) => e.all_day).map((e) => (
                <div
                  key={e.id}
                  className="event"
                  style={eventStyle(e.color)}
                  role="button"
                  tabIndex={0}
                  title={eventTooltip(e, timeZone, timeFormat)}
                  onClick={(ev) => { ev.stopPropagation(); setEditing({ event: e }) }}
                  onKeyDown={activate(() => setEditing({ event: e }))}
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
                {h === 0 ? '' : formatHour(h, timeFormat)}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`week-col week-timed${isToday(day) ? ' today' : ''}`}
              style={{ height: HOUR_PX * 24 }}
              role="button"
              tabIndex={0}
              aria-label={`${format(day, 'EEEE, MMMM d')}: add event`}
              onClick={(ev) => setEditing({ day, at: slotAt(ev, day) })}
              onKeyDown={activate(() => setEditing({ day }))}
            >
              {HOURS.map((h) => (
                <div key={h} className="week-hour-line" style={{ top: h * HOUR_PX }} />
              ))}
              {layoutTimed(eventsOn(day, events).filter((e) => !e.all_day), day).map(({ event: e, style }) => (
                <div
                  key={e.id}
                  className="event week-event"
                  style={style}
                  role="button"
                  tabIndex={0}
                  title={eventTooltip(e, timeZone, timeFormat)}
                  onClick={(ev) => { ev.stopPropagation(); setEditing({ event: e }) }}
                  onKeyDown={activate(() => setEditing({ event: e }))}
                >
                  <strong>{formatTime(inTz(e.starts_at, timeZone), timeFormat)}</strong> {e.title}
                </div>
              ))}
              {isToday(day) && <div className="now-line" style={{ top: nowTop }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <EventForm {...editing} timeZone={timeZone} onDone={() => { setEditing(null); setReloadKey((k) => k + 1) }} />
      )}
    </section>
  )
}
