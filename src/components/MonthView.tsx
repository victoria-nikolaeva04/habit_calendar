import { useEffect, useRef, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns'
import { eventsOn } from '../lib/dayLayout'
import { getEvents, type CalendarEvent } from '../lib/api'
import type { Task, TaskList } from '../lib/taskApi'
import { EventPopup } from './EventPopup'
import { formatTime, type TimeFormat } from '../lib/timeFormat'
import { eventStyle } from '../lib/eventStyle'
import { eventTooltip } from '../lib/eventLabel'
import { RepeatMark } from './RepeatMark'
import { activate } from '../lib/a11y'
import { useHolidays } from '../hooks/useHolidays'
import { HolidayChip } from './HolidayChip'
import { TaskChip } from './TaskChip'
import { TaskPopup } from './TaskPopup'
import { useTasks } from '../hooks/useTasks'
import { dayKey } from '../lib/tasks'
import { inTz, nowIn } from '../lib/tz'
import { useEventDrag } from '../hooks/useEventDrag'
import type { History } from '../hooks/useUndoStack'

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

// Approximate pixel sizes of cell contents, used to work out how many events fit in a day cell
const FALLBACK_VISIBLE = 3 // before the first measurement
const NUMBER_PX = 28       // the day number circle (1.6rem) plus spacing
const MORE_PX = 22         // the "+N more" button
const sizes = (compact: boolean) => ({ chip: compact ? 19 : 25, pad: compact ? 6.4 : 13 })

// How many of `total` events fit in a cell `cellH` px tall (leaving room for "+N more" if some are cut)
function fitCount(total: number, cellH: number, compact: boolean, reserved = 0) {
  if (!cellH) return Math.min(total, FALLBACK_VISIBLE)
  const { chip, pad } = sizes(compact)
  const avail = cellH - pad - NUMBER_PX - reserved * chip
  if (total * chip <= avail) return total
  return Math.max(0, Math.floor((avail - MORE_PX) / chip))
}

function gridRange(month: Date, weekStartsOn: WeekDay) {
  return {
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  }
}

export function MonthView({ weekStartsOn = 0, timeFormat = '12h', timeZone, holidayCountry, jump, selected, version = 0, onSelectDay, onChanged, lists, listFilter, history }: { weekStartsOn?: WeekDay; timeFormat?: TimeFormat; timeZone: string; holidayCountry?: string | null; jump?: { date: Date } | null; selected: Date; version?: number; onSelectDay?: (day: Date) => void; onChanged?: () => void; lists: TaskList[]; listFilter: string; history: History }) {
  const [month, setMonth] = useState(() => startOfMonth(selected))
  // Search results ask the calendar to show a date: follow each new request (adjusting state while rendering)
  const [seenJump, setSeenJump] = useState(jump)
  if (jump !== seenJump) {
    setSeenJump(jump)
    if (jump) setMonth(startOfMonth(jump.date))
  }
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null) // day (ms) showing all its events
  const [editingTask, setEditingTask] = useState<{ task?: Task } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const { begin, preview, clear, classFor } = useEventDrag({ timeZone, history, onChanged: () => onChanged?.(), onError: setError })
  const withDrag = preview(events)
  const { start, end } = gridRange(month, weekStartsOn)
  const days = eachDayOfInterval({ start, end })
  const taskDays = useTasks(start, end, version, listFilter)
  const holidays = useHolidays(holidayCountry, start, end)

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
    getEvents(range.start, range.end, timeZone)
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        clear()
        setError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    // Ignore the result if the user changed months before it came back
    return () => { cancelled = true }
  }, [month, reloadKey, weekStartsOn, timeZone, version, clear])

  return (
    <section className="month">
      <header className="month-header">
        <h2>{format(month, 'MMMM')} <span className="year">{format(month, 'yyyy')}</span></h2>
        <button className="today-btn" onClick={() => { const now = nowIn(timeZone); setMonth(startOfMonth(now)); onSelectDay?.(startOfDay(now)) }}>Today</button>
        <button className="nav-btn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <button className="nav-btn" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="month-grid" ref={gridRef}>
        {days.slice(0, 7).map((d) => format(d, 'EEE')).map((d) => (
          <div key={d} className="weekday">{d}</div>
        ))}
        {days.map((day) => {
          const dayEvents = eventsOn(day, withDrag)
          const isExpanded = expanded === day.getTime()
          const dayHolidays = holidays.get(format(day, 'yyyy-MM-dd')) ?? []
          const dayTasks = taskDays.get(dayKey(day)) ?? []
          // Events come first, then tasks; whatever doesn't fit goes under "+N more"
          const total = dayEvents.length + dayTasks.length
          const shown = isExpanded ? total : fitCount(total, cellH, compact, dayHolidays.length)
          const visible = dayEvents.slice(0, shown)
          const visibleTasks = dayTasks.slice(0, Math.max(0, shown - dayEvents.length))
          const hidden = total - visible.length - visibleTasks.length
          return (
            <div
              key={day.toISOString()}
              className={[
                'day',
                !isSameMonth(day, month) && 'outside',
                isToday(day) && 'today',
                isSameDay(day, selected) && 'selected',
                isExpanded && 'expanded',
              ].filter(Boolean).join(' ')}
              data-grid="day"
              data-day={format(day, 'yyyy-MM-dd')}
              role="button"
              tabIndex={0}
              aria-label={`${format(day, 'EEEE, MMMM d')}: add event`}
              onClick={() => setEditing({ day })}
              onKeyDown={activate(() => setEditing({ day }))}
            >
              <span className="day-number" title="Show this day in the side panel"
                onClick={(ev) => { ev.stopPropagation(); onSelectDay?.(day) }}>{format(day, 'd')}</span>
              {dayHolidays.map((h) => <HolidayChip key={h.name} holiday={h} />)}
              {visible.map((e) => {
                // Multi-day events show their start time only on the day they begin
                const startsToday = isSameDay(inTz(e.starts_at, timeZone), day)
                return (
                  <div
                    key={e.id}
                    className={`event${classFor(e)}`}
                    style={eventStyle(e.color)}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(ev) => begin(ev, e, 'move', 'day')}
                    title={eventTooltip(e, timeZone, timeFormat)}
                    onClick={(ev) => { ev.stopPropagation(); setEditing({ event: e }) }}
                    onKeyDown={activate(() => setEditing({ event: e }))}
                  >
                    {!e.all_day && startsToday && `${formatTime(inTz(e.starts_at, timeZone), timeFormat)} `}{e.title}{e.series_id && <RepeatMark />}
                  </div>
                )
              })}
              {visibleTasks.map((t) => (
                <TaskChip key={t.id} task={t} timeFormat={timeFormat}
                  onOpen={(task) => setEditingTask({ task })} onChanged={() => onChanged?.()} />
              ))}
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
        <EventPopup {...editing} timeZone={timeZone} timeFormat={timeFormat} onDone={() => { setEditing(null); setReloadKey((k) => k + 1); onChanged?.() }} />
      )}
      {editingTask && (
        <TaskPopup {...editingTask} lists={lists} timeFormat={timeFormat} onChanged={() => onChanged?.()} onDone={() => { setEditingTask(null); onChanged?.() }} />
      )}
    </section>
  )
}
