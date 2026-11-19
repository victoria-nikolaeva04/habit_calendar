import { useEffect, useRef, useState } from 'react'
import { addDays, endOfDay, format, isToday, startOfDay } from 'date-fns'
import { getEvents, type CalendarEvent } from '../lib/api'
import { EventPopup } from './EventPopup'
import { formatTime, formatHour, type TimeFormat } from '../lib/timeFormat'
import { eventStyle } from '../lib/eventStyle'
import { eventTooltip } from '../lib/eventLabel'
import { RepeatMark } from './RepeatMark'
import { activate } from '../lib/a11y'
import { useHolidays } from '../hooks/useHolidays'
import { HolidayChip } from './HolidayChip'
import { inTz, nowIn } from '../lib/tz'
import { HOUR_PX, layoutTimed, slotAt } from '../lib/dayLayout'
import { useNow } from '../hooks/useNow'

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function DayView({ timeFormat = '12h', timeZone, holidayCountry, jump }: { timeFormat?: TimeFormat; timeZone: string; holidayCountry?: string | null; jump?: { date: Date } | null }) {
  const [day, setDay] = useState(() => startOfDay(nowIn(timeZone)))
  // Search results ask the calendar to show a date: follow each new request (adjusting state while rendering)
  const [seenJump, setSeenJump] = useState(jump)
  if (jump !== seenJump) {
    setSeenJump(jump)
    if (jump) setDay(startOfDay(jump.date))
  }
  const dayHolidays = useHolidays(holidayCountry, day, day).get(format(day, 'yyyy-MM-dd')) ?? []
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date; at?: Date } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
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
    getEvents(startOfDay(day), endOfDay(day), timeZone)
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => { cancelled = true }
  }, [day, reloadKey, timeZone])

  const allDay = events.filter((e) => e.all_day)
  const timed = events.filter((e) => !e.all_day)

  return (
    <section className="month week">
      <header className="month-header">
        <button aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>‹</button>
        <h2>
          {isToday(day) && <span className="today-dot" title="Today" />}
          {format(day, 'EEEE, MMM d, yyyy')}
        </h2>
        <button aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>›</button>
        <button onClick={() => setDay(startOfDay(nowIn(timeZone)))}>Today</button>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="week-scroll" ref={scrollRef}>
        <div className="week-grid day-grid single week-allday">
          <div className="week-gutter">all-day</div>
          <div
            className="week-col"
            role="button"
            tabIndex={0}
            aria-label="Add all-day event"
            onClick={() => setEditing({ day })}
            onKeyDown={activate(() => setEditing({ day }))}
          >
            {dayHolidays.map((h) => <HolidayChip key={h.name} holiday={h} />)}
            {allDay.map((e) => (
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
                {e.title}{e.series_id && <RepeatMark />}
              </div>
            ))}
          </div>
        </div>

        <div className="week-grid day-grid single week-body">
          <div className="week-gutter">
            {HOURS.map((h) => (
              <div key={h} className="week-hour-label" style={{ height: HOUR_PX }}>
                {h === 0 ? '' : formatHour(h, timeFormat)}
              </div>
            ))}
          </div>
          <div
            className="week-col week-timed"
            style={{ height: HOUR_PX * 24 }}
            role="button"
            tabIndex={0}
            aria-label="Add event"
            onClick={(ev) => setEditing({ day, at: slotAt(ev, day) })}
            onKeyDown={activate(() => setEditing({ day }))}
          >
            {HOURS.map((h) => (
              <div key={h} className="week-hour-line" style={{ top: h * HOUR_PX }} />
            ))}
            {layoutTimed(timed, day).map(({ event: e, style }) => (
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
                <strong>
                  {formatTime(inTz(e.starts_at, timeZone), timeFormat)}–{formatTime(inTz(e.ends_at, timeZone), timeFormat)}
                </strong>{' '}
                {e.title}{e.series_id && <RepeatMark />}
              </div>
            ))}
            {isToday(day) && <div className="now-line" style={{ top: nowTop }} aria-hidden="true" />}
          </div>
        </div>
      </div>
      {editing && (
        <EventPopup {...editing} timeZone={timeZone} timeFormat={timeFormat} onDone={() => { setEditing(null); setReloadKey((k) => k + 1) }} />
      )}
    </section>
  )
}
