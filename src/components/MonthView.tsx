import { useEffect, useRef, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { eventsOn } from '../lib/dayLayout'
import { getEvents, type CalendarEvent } from '../lib/api'
import { EventForm } from './EventForm'
import { formatTime, type TimeFormat } from '../lib/timeFormat'
import { eventStyle } from '../lib/eventStyle'
import { eventTooltip } from '../lib/eventLabel'
import { activate } from '../lib/a11y'
import { inTz, nowIn } from '../lib/tz'

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

// Approximate pixel sizes of cell contents, used to work out how many events fit in a day cell
const FALLBACK_VISIBLE = 3 // before the first measurement
const NUMBER_PX = 32       // the day number circle (2rem)
const MORE_PX = 22         // the "+N more" button
const sizes = (compact: boolean) => ({ chip: compact ? 19 : 28, pad: compact ? 6.4 : 16 })

// How many of `total` events fit in a cell `cellH` px tall (leaving room for "+N more" if some are cut)
function fitCount(total: number, cellH: number, compact: boolean) {
  if (!cellH) return Math.min(total, FALLBACK_VISIBLE)
  const { chip, pad } = sizes(compact)
  const avail = cellH - pad - NUMBER_PX
  if (total * chip <= avail) return total
  return Math.max(0, Math.floor((avail - MORE_PX) / chip))
}

function gridRange(month: Date, weekStartsOn: WeekDay) {
  return {
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  }
}

export function MonthView({ weekStartsOn = 0, timeFormat = '12h', timeZone }: { weekStartsOn?: WeekDay; timeFormat?: TimeFormat; timeZone: string }) {
  const [month, setMonth] = useState(() => startOfMonth(nowIn(timeZone)))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null) // day (ms) showing all its events
  const [reloadKey, setReloadKey] = useState(0)
  const { start, end } = gridRange(month, weekStartsOn)
  const days = eachDayOfInterval({ start, end })

  // Track the day-cell height so we show as many events as fit instead of a fixed number
  const gridRef = useRef<HTMLDivElement>(null)
  const [cellH, setCellH] = useState(0)
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    // Re-observed when the number of week rows changes, which changes the cell height
    const ro = new ResizeObserver(() => setCellH(grid.querySelector('.day')?.clientHeight ?? 0))
    ro.observe(grid)
    return () => ro.disconnect()
  }, [days.length])

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
        <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <h2>{format(month, 'MMMM yyyy')}</h2>
        <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
        <button onClick={() => setMonth(startOfMonth(nowIn(timeZone)))}>Today</button>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="month-grid" ref={gridRef}>
        {days.slice(0, 7).map((d) => format(d, 'EEE')).map((d) => (
          <div key={d} className="weekday">{d}</div>
        ))}
        {days.map((day) => {
          const dayEvents = eventsOn(day, events)
          const isExpanded = expanded === day.getTime()
          const visible = isExpanded ? dayEvents : dayEvents.slice(0, fitCount(dayEvents.length, cellH, compact))
          const hidden = dayEvents.length - visible.length
          return (
            <div
              key={day.toISOString()}
              className={[
                'day',
                !isSameMonth(day, month) && 'outside',
                isToday(day) && 'today',
                isExpanded && 'expanded',
              ].filter(Boolean).join(' ')}
              role="button"
              tabIndex={0}
              aria-label={`${format(day, 'EEEE, MMMM d')}: add event`}
              onClick={() => setEditing({ day })}
              onKeyDown={activate(() => setEditing({ day }))}
            >
              <span className="day-number">{format(day, 'd')}</span>
              {visible.map((e) => {
                // Multi-day events show their start time only on the day they begin
                const startsToday = isSameDay(inTz(e.starts_at, timeZone), day)
                return (
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
                    {!e.all_day && startsToday && `${formatTime(inTz(e.starts_at, timeZone), timeFormat)} `}{e.title}
                  </div>
                )
              })}
              {(hidden > 0 || isExpanded) && (
                <button
                  type="button"
                  className="more"
                  onClick={(ev) => { ev.stopPropagation(); setExpanded(isExpanded ? null : day.getTime()) }}
                >
                  {isExpanded ? 'Show less' : `+${hidden} more`}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {editing && (
        <EventForm {...editing} timeZone={timeZone} onDone={() => { setEditing(null); setReloadKey((k) => k + 1) }} />
      )}
    </section>
  )
}
