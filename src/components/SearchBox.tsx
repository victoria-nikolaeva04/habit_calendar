import { useEffect, useRef, useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { searchEvents, type CalendarEvent } from '../lib/api'
import { formatTime, type TimeFormat } from '../lib/timeFormat'
import { inTz, nowIn, wallTime } from '../lib/tz'
import { searchTasks, type Task, type TaskList } from '../lib/taskApi'
import { dayKey, isDone, parseDay, taskTimeLabel } from '../lib/tasks'
import { RepeatMark } from './RepeatMark'
import { TaskPopup } from './TaskPopup'

const MAX_SHOWN = 30

type Props = {
  timeZone: string
  timeFormat: TimeFormat
  onPick: (day: Date) => void  // a result was clicked: show this day (start of day in the profile time zone)
  lists: TaskList[]
  onChanged: () => void        // a task was edited or deleted from here: reload the calendar
}

// Search box for the app bar: type to list matching events and tasks, click one to jump to its date
export function SearchBox({ timeZone, timeFormat, onPick, lists, onChanged }: Props) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<CalendarEvent[]>([])
  const [taskResults, setTaskResults] = useState<Task[]>([])
  const [openTask, setOpenTask] = useState<Task | null>(null) // an undated task: has no day to jump to
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const query = text.trim()

  // Search shortly after typing stops; an older answer arriving late is ignored
  useEffect(() => {
    if (!query) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      Promise.all([searchEvents(query, timeZone), searchTasks(query, dayKey(nowIn(timeZone))).catch((e) => {
        // Tasks are optional: a failure there shouldn't hide the events
        console.error('Could not search tasks:', e)
        return [] as Task[]
      })])
        .then(([events, tasks]) => { if (!cancelled) { setResults(events); setTaskResults(tasks); setError(null) } })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, timeZone, reloadKey])

  // Click outside closes the list
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const when = (e: CalendarEvent) => {
    const start = inTz(e.starts_at, timeZone)
    const day = format(start, 'EEE, MMM d, yyyy')
    return e.all_day ? day : `${day} · ${formatTime(start, timeFormat)}`
  }

  const taskWhen = (t: Task) => {
    if (!t.due_date) return 'Task · No due date'
    const time = taskTimeLabel(t, timeFormat)
    return `Task · ${format(parseDay(t.due_date), 'EEE, MMM d, yyyy')}${time ? ` · ${time}` : ''}`
  }
  const total = results.length + taskResults.length
  const showList = open && !!query
  return (
    <div className="search" ref={boxRef}>
      <input
        type="search"
        aria-label="Search events"
        placeholder="Search events"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur() } }}
      />
      {showList && (
        <div className="search-results" role="region" aria-label="Search results">
          {error ? (
            <p role="alert" className="search-note">{error}</p>
          ) : loading && total === 0 ? (
            <p className="search-note">Searching…</p>
          ) : total === 0 ? (
            <p className="search-note">No events found</p>
          ) : (
            <ul>
              {results.slice(0, MAX_SHOWN).map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => { onPick(startOfDay(inTz(e.starts_at, timeZone))); setOpen(false) }}>
                    <span className="search-dot" style={{ background: e.color ?? 'var(--accent)' }} aria-hidden="true" />
                    <span className="search-text">
                      <strong>{e.title}{e.series_id && <RepeatMark />}</strong>
                      <small>{when(e)}</small>
                    </span>
                  </button>
                </li>
              ))}
              {taskResults.slice(0, MAX_SHOWN).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => {
                    setOpen(false)
                    // A dated task jumps to its day; an undated one opens right here
                    if (t.due_date) onPick(wallTime(`${t.due_date}T00:00`, timeZone))
                    else setOpenTask(t)
                  }}>
                    <span className="search-dot task-dot" aria-hidden="true">{isDone(t) ? '✓' : ''}</span>
                    <span className="search-text">
                      <strong className={isDone(t) ? 'done' : undefined}>{t.title}{t.series_id && <RepeatMark />}</strong>
                      <small>{taskWhen(t)}</small>
                    </span>
                  </button>
                </li>
              ))}
              {Math.max(results.length, taskResults.length) > MAX_SHOWN && (
                <li className="search-note">Showing the first {MAX_SHOWN} of each</li>
              )}
            </ul>
          )}
        </div>
      )}
      {openTask && (
        <TaskPopup
          task={openTask}
          lists={lists}
          timeFormat={timeFormat}
          onChanged={onChanged}
          onDone={() => { setOpenTask(null); setReloadKey((k) => k + 1); onChanged() }}
        />
      )}
    </div>
  )
}
