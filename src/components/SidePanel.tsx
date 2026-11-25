import { useEffect, useState } from 'react'
import { addDays, endOfDay, format, isToday, startOfDay } from 'date-fns'
import { getEvents, type CalendarEvent } from '../lib/api'
import { getBacklogTasks, getTasks, type Task, type TaskList } from '../lib/taskApi'
import { eventStyle, pastClass } from '../lib/eventStyle'
import { useNow } from '../hooks/useNow'
import { eventTooltip } from '../lib/eventLabel'
import { formatTime, type TimeFormat } from '../lib/timeFormat'
import { inTz, nowIn, toUtcIso } from '../lib/tz'
import { ALL_LISTS, DEFAULT_LIST, DEFAULT_LIST_NAME, dayKey, isDone } from '../lib/tasks'
import { useHolidays } from '../hooks/useHolidays'
import { HolidayChip } from './HolidayChip'
import { EventPopup } from './EventPopup'
import { RepeatMark } from './RepeatMark'
import { TaskChip } from './TaskChip'
import { TaskPopup } from './TaskPopup'
import { ListsDialog } from './ListsDialog'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

type Props = {
  day: Date                     // the selected day, at the start of the day in the profile time zone
  timeZone: string
  timeFormat: TimeFormat
  holidayCountry?: string | null
  version: number               // changes when events were edited elsewhere, so the list reloads
  onGoTo: (day: Date) => void   // show another day (the calendar follows)
  onChanged: () => void         // an event or task was added, edited or deleted here
  lists: TaskList[]
  listFilter: string            // the list(s) tasks are shown from: ALL_LISTS, DEFAULT_LIST or a list id
  onListFilter: (filter: string) => void
  onListsChanged: () => void    // lists were added, renamed or deleted
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
export function SidePanel({ day, timeZone, timeFormat, holidayCountry, version, onGoTo, onChanged, lists, listFilter, onListFilter, onListsChanged }: Props) {
  const now = useNow()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day?: Date } | null>(null)
  const [dayTasks, setDayTasks] = useState<Task[]>([])
  const [backlog, setBacklog] = useState<Task[]>([])
  const [managingLists, setManagingLists] = useState(false)
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [tasksError, setTasksError] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<{ task?: Task; day?: Date } | null>(null)
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

  useEffect(() => {
    let cancelled = false
    const key = dayKey(day)
    Promise.all([getTasks(key, key, listFilter), getBacklogTasks(dayKey(nowIn(timeZone)), listFilter, toUtcIso(startOfDay(nowIn(timeZone))))])
      .then(([forDay, rest]) => {
        if (cancelled) return
        setDayTasks(forDay)
        setBacklog(rest)
        setTasksLoaded(true)
        setTasksError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setTasksError(e.message)
      })
    return () => { cancelled = true }
  }, [day, timeZone, version, reloadKey, listFilter])

  // The day's own tasks, then what is overdue, then what has no due date
  const key = dayKey(day)
  const overdue = backlog.filter((t) => t.due_date !== null && t.due_date !== key)
  const undated = backlog.filter((t) => t.due_date === null)
  const hasTasks = dayTasks.length + backlog.length > 0
  const openCount = [...dayTasks, ...backlog].filter((t) => !isDone(t)).length
  const taskRow = (t: Task) => (
    <li key={t.id}>
      <TaskChip task={t} timeFormat={timeFormat} variant="row"
        onOpen={(task) => setEditingTask({ task })} onChanged={() => { setReloadKey((k) => k + 1); onChanged() }} />
    </li>
  )

  // All-day events first, then by start time
  const sorted = [...events].sort((a, b) => Number(b.all_day) - Number(a.all_day))

  return (
    <aside className="side-panel" aria-label="Day details">
      {/* Cards: add new ones below (or above) these; the panel scrolls when they don't fit */}
      <div className="panel-card">
        <header className="panel-header">
          <div className="panel-date">
            <span className="panel-weekday">{format(day, 'EEEE')}</span>
            <h2>
              {isToday(day) && <span className="today-dot" title="Today" />}
              {format(day, 'MMMM d')}
            </h2>
          </div>
          <button className="icon-btn" aria-label="Previous day" onClick={() => onGoTo(addDays(day, -1))}><ChevronLeft size={16} aria-hidden="true" /></button>
          <button className="icon-btn" aria-label="Next day" onClick={() => onGoTo(addDays(day, 1))}><ChevronRight size={16} aria-hidden="true" /></button>
        </header>
        <section className="panel-section" aria-labelledby="panel-events-title">
          <div className="panel-section-head">
            <h3 id="panel-events-title">Schedule</h3>
            <button type="button" className="icon-btn" aria-label="Add event" onClick={() => setEditing({ day })}><Plus size={16} aria-hidden="true" /></button>
          </div>
          {holidays.map((h) => <HolidayChip key={h.name} holiday={h} />)}
          {error && <p role="alert">{error}</p>}
          {!error && loaded && sorted.length === 0 && <p className="panel-empty">Nothing planned for this day.</p>}
          <ul className="panel-events">
            {sorted.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={`panel-event${pastClass(e, now)}`}
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

      <div className="panel-card">
        <section className="panel-section" aria-labelledby="panel-tasks-title">
          <div className="panel-section-head">
            <h3 id="panel-tasks-title">Tasks</h3>
            {tasksLoaded && <span className="panel-count">{openCount} open</span>}
            <button type="button" className="icon-btn" aria-label="Add task" onClick={() => setEditingTask({ day })}><Plus size={16} aria-hidden="true" /></button>
          </div>
          <div className="panel-list-bar">
            <select aria-label="Task list" value={listFilter} onChange={(e) => onListFilter(e.target.value)}>
              <option value={ALL_LISTS}>All lists</option>
              <option value={DEFAULT_LIST}>{DEFAULT_LIST_NAME}</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="button" onClick={() => setManagingLists(true)}>Manage lists</button>
          </div>
          {tasksError && <p role="alert">{tasksError}</p>}
          {overdue.length > 0 && (
            <>
              <h4 className="panel-subhead overdue">Overdue</h4>
              <ul className="panel-tasks">{overdue.map(taskRow)}</ul>
            </>
          )}
          {!tasksError && tasksLoaded && !hasTasks && <p className="panel-empty">No tasks yet.</p>}
          {overdue.length > 0 && (dayTasks.length > 0 || tasksLoaded) && (
            <h4 className="panel-subhead">{format(day, 'EEE, MMM d')}</h4>
          )}
          {!tasksError && tasksLoaded && hasTasks && dayTasks.length === 0 && (
            <p className="panel-empty">No tasks due this day.</p>
          )}
          {dayTasks.length > 0 && <ul className="panel-tasks">{dayTasks.map(taskRow)}</ul>}
          {undated.length > 0 && (
            <>
              <h4 className="panel-subhead">No due date</h4>
              <ul className="panel-tasks">{undated.map(taskRow)}</ul>
            </>
          )}
        </section>
      </div>

      {editingTask && (
        <TaskPopup
          {...editingTask}
          lists={lists}
          defaultList={lists.some((l) => l.id === listFilter) ? listFilter : null}
          timeFormat={timeFormat}
          onChanged={() => { setReloadKey((k) => k + 1); onChanged() }}
          onDone={() => { setEditingTask(null); setReloadKey((k) => k + 1); onChanged() }}
        />
      )}
      {managingLists && (
        <ListsDialog
          lists={lists}
          onChanged={() => { onListsChanged(); onChanged() }}
          onDeleted={(id) => { if (listFilter === id) onListFilter(ALL_LISTS) }}
          onClose={() => setManagingLists(false)}
        />
      )}
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
