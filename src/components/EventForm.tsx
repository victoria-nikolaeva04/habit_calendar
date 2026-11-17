import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addHours, addMonths, endOfDay, format, setHours, startOfDay } from 'date-fns'
import { inTz, toUtcIso, wallTime } from '../lib/tz'
import {
  createEvents, deleteEvent, deleteSeries, updateEvent, updateSeries, type CalendarEvent,
} from '../lib/api'
import { MAX_OCCURRENCES, describeRule, horizonDate, occurrences, type Freq, type Recurrence } from '../lib/recurrence'

// The dropdown choices, like Google Calendar: presets named after the start date, plus Custom
type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays' | 'custom'
const UNITS: { value: Freq; one: string; many: string }[] = [
  { value: 'daily', one: 'day', many: 'days' },
  { value: 'weekly', one: 'week', many: 'weeks' },
  { value: 'monthly', one: 'month', many: 'months' },
  { value: 'yearly', one: 'year', many: 'years' },
]
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

// <input type="datetime-local"> wants "2026-11-13T09:00"; `d` must already be in the profile time zone
const toInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")

type Props = {
  event?: CalendarEvent   // set when editing
  day?: Date              // set when creating: the day to add to (starts at 9:00)
  at?: Date               // set when creating from a clicked time slot: exact start
  timeZone: string        // the profile time zone: inputs are read and shown in it
  onDone: () => void      // close and reload
}

export function EventForm({ event, day, at, timeZone, onDone }: Props) {
  const defaultStart = at ? inTz(at, timeZone) : setHours(inTz(day ?? new Date(), timeZone), 9)
  const [title, setTitle] = useState(event?.title ?? '')
  const [start, setStart] = useState(toInput(event ? inTz(event.starts_at, timeZone) : defaultStart))
  const [end, setEnd] = useState(toInput(event ? inTz(event.ends_at, timeZone) : addHours(defaultStart, 1)))
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [color, setColor] = useState<string | null>(event?.color ?? null)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [endMode, setEndMode] = useState<'until' | 'count'>('until')
  const [repeatCount, setRepeatCount] = useState('10')
  const [never, setNever] = useState(false)
  const [interval, setIntervalValue] = useState('1')
  const [unit, setUnit] = useState<Freq>('weekly')
  const [repeatDays, setRepeatDays] = useState<number[]>([defaultStart.getDay()])
  // Editing one occurrence of a series: change just this one, or the whole series
  const inSeries = !!event?.series_id
  const [scope, setScope] = useState<'one' | 'all'>('one')
  const [error, setError] = useState<string | null>(null)

  // The chosen repeat pattern, without its end
  const repeatBase = (): Recurrence | null =>
    repeat === 'none' ? null
    : repeat === 'custom' ? { freq: unit, interval: Math.floor(Number(interval)) || 1, ...(unit === 'weekly' && { days: repeatDays }) }
    : repeat === 'weekdays' ? { freq: 'weekly', days: [1, 2, 3, 4, 5] }
    : { freq: repeat }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // All-day events run from the start of the first date to the end of the last date
    setError(null)
    const startDate = allDay ? startOfDay(wallTime(start, timeZone)) : wallTime(start, timeZone)
    const endDate = allDay ? endOfDay(wallTime(end, timeZone)) : wallTime(end, timeZone)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setError('Please enter a valid start and end.')
      return
    }
    if (endDate < startDate) {
      setError('The event must end after it starts.')
      return
    }
    const fields = {
      title,
      all_day: allDay,
      notes: notes.trim() || null,
      color,
      starts_at: toUtcIso(startDate),  // profile-zone wall time -> UTC
      ends_at: toUtcIso(endDate),
    }
    try {
      if (event && inSeries && scope === 'all') {
        // Times differ per occurrence, so only the shared details change for the whole series
        await updateSeries(event.series_id!, { title, notes: fields.notes, color })
      } else if (event) {
        await updateEvent(event.id, fields)
      } else if (repeat === 'none') {
        await createEvents([fields])
      } else {
        const n = Math.floor(Number(interval))
        if (repeat === 'custom' && !(n >= 1)) {
          setError('Repeat every must be 1 or more.')
          return
        }
        if (!never && endMode === 'until' && !repeatUntil) {
          setError('Please choose when the repetition ends.')
          return
        }
        const count = Math.floor(Number(repeatCount))
        if (!never && endMode === 'count' && !(count >= 1)) {
          setError('Number of events must be 1 or more.')
          return
        }
        if (repeat === 'custom' && unit === 'weekly' && repeatDays.length === 0) {
          setError('Pick at least one day of the week.')
          return
        }
        // One row per occurrence, tied together by series_id; wall-clock time is kept across DST
        const base = repeatBase()!
        // "Never ends": a year of events now (the app adds more later); the stored rule has no end
        const stored: Recurrence = never
          ? { ...base, never: true, anchor: { start: toUtcIso(startDate), end: toUtcIso(endDate) } }
          : { ...base, ...(endMode === 'until' ? { until: repeatUntil } : { count }) }
        const rule: Recurrence = never ? { ...stored, until: horizonDate(timeZone) } : stored
        const list = occurrences(startDate, endDate, rule, timeZone)
        if (!list) {
          setError(`That would create more than ${MAX_OCCURRENCES} events. Shorten the repetition.`)
          return
        }
        if (list.length === 0) {
          setError('No events fall before the end date.')
          return
        }
        const series_id = crypto.randomUUID()
        await createEvents(list.map((o) => ({
          ...fields, series_id, recurrence: stored,
          starts_at: toUtcIso(o.start), ends_at: toUtcIso(o.end),
        })))
      }
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Labels for the presets, named after the current start date (may be invalid while the field is being edited)
  const startPreview = wallTime(start, timeZone)
  const startLabel = (f: string) => (isNaN(startPreview.getTime()) ? '…' : format(startPreview, f))

  // Plain-English summary of what will be created, e.g. "Every 2 weeks on Mon, Wed, until Dec 31, 2026 · 14 events"
  let repeatSummary: string | null = null
  const previewBase = repeatBase()
  if (previewBase) {
    const count = Math.floor(Number(repeatCount))
    const rule: Recurrence = {
      ...previewBase,
      ...(never ? { never: true } : endMode === 'until' ? (repeatUntil ? { until: repeatUntil } : {}) : count >= 1 ? { count } : {}),
    }
    repeatSummary = describeRule(rule)
    if (!never && (rule.until || rule.count) && !isNaN(startPreview.getTime())) {
      const n = occurrences(startPreview, startPreview, rule, timeZone)?.length
      repeatSummary += n === undefined ? ` · over ${MAX_OCCURRENCES} events` : ` · ${n} ${n === 1 ? 'event' : 'events'}`
    }
  }

  async function handleDelete() {
    if (!event) return
    const all = inSeries && scope === 'all'
    if (!confirm(all ? `Delete every event in the series "${event.title}"?` : `Delete "${event.title}"?`)) return
    try {
      if (all) await deleteSeries(event.series_id!)
      else await deleteEvent(event.id)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Open as a real modal: backdrop blocks the calendar behind it, Escape closes, focus stays inside
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialogRef.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    // Give focus back to whatever opened the form (the dialog is unmounted, not close()d)
    return () => opener?.focus?.()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="event-form"
      onCancel={(e) => { e.preventDefault(); onDone() }}
      onClick={(e) => {
        // Click on the backdrop (outside the dialog box) closes it
        const r = e.currentTarget.getBoundingClientRect()
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (!inside) onDone()
      }}
    >
      <form onSubmit={handleSubmit}>
        <h3>{event ? 'Edit event' : 'New event'}</h3>
        <label className="field">
          <span>Title</span>
          <input required autoFocus placeholder="Event title" value={title}
            onChange={(e) => setTitle(e.target.value)} />
        </label>
        {inSeries && (
          <div className="field" role="radiogroup" aria-label="Apply changes to">
            <span>
              {'↻'} Part of a repeating series
              {event?.recurrence ? ` (${describeRule(event.recurrence as Recurrence)})` : ''}
            </span>
            <div className="scope">
              <label className="check"><input type="radio" name="scope" checked={scope === 'one'}
                onChange={() => setScope('one')} /> This event</label>
              <label className="check"><input type="radio" name="scope" checked={scope === 'all'}
                onChange={() => setScope('all')} /> All events in the series</label>
            </div>
            {scope === 'all' && <small className="hint">Times can only be changed one event at a time.</small>}
          </div>
        )}
        <fieldset className="plain" disabled={inSeries && scope === 'all'}>
        <label className="check">
          <input type="checkbox" checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        <div className="field-row">
          <label className="field">
            <span>Starts</span>
            {allDay ? (
              <input type="date" required value={start.slice(0, 10)}
                onChange={(e) => {
                  const d = e.target.value
                  if (!d) return
                  setStart(`${d}T${start.slice(11)}`)
                  if (d > end.slice(0, 10)) setEnd(`${d}T${end.slice(11)}`) // keep end >= start
                }} />
            ) : (
              <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
            )}
          </label>
          <label className="field">
            <span>Ends</span>
            {allDay ? (
              <input type="date" required value={end.slice(0, 10)} min={start.slice(0, 10)}
                onChange={(e) => e.target.value && setEnd(`${e.target.value}T${end.slice(11)}`)} />
            ) : (
              <input type="datetime-local" required value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            )}
          </label>
        </div>
        </fieldset>
        {!event && (
          <div className="repeat-box">
            <label className="field">
              <span>Repeat</span>
              <select value={repeat} onChange={(e) => {
                const r = e.target.value as Repeat
                setRepeat(r)
                if (r !== 'none' && !repeatUntil && !isNaN(startPreview.getTime())) {
                  setRepeatUntil(format(addMonths(startPreview, 3), 'yyyy-MM-dd'))
                }
              }}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">{`Weekly on ${startLabel('EEEE')}`}</option>
                <option value="monthly">{`Monthly on day ${startLabel('d')}`}</option>
                <option value="yearly">{`Annually on ${startLabel('MMMM d')}`}</option>
                <option value="weekdays">Every weekday (Monday to Friday)</option>
                <option value="custom">Custom…</option>
              </select>
            </label>
            {repeat === 'custom' && (
              <div className="custom-repeat">
                <div className="field-row">
                  <label className="field">
                    <span>Repeat every</span>
                    <input type="number" min={1} max={999} required value={interval}
                      onChange={(e) => setIntervalValue(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Unit</span>
                    <select value={unit} onChange={(e) => setUnit(e.target.value as Freq)}>
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>{Number(interval) === 1 ? u.one : u.many}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {unit === 'weekly' && (
                  <div className="field">
                    <span>Repeat on</span>
                    <div className="weekdays" role="group" aria-label="Repeat on">
                      {WEEKDAYS.map((l, d) => (
                        <button key={d} type="button" aria-pressed={repeatDays.includes(d)} aria-label={WEEKDAY_NAMES[d]}
                          className={`weekday${repeatDays.includes(d) ? ' selected' : ''}`}
                          onClick={() => setRepeatDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {repeat !== 'none' && (
              <>
                <label className="check">
                  <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> Never ends
                </label>
                {!never && (
                  <div className="field-row">
                    <label className="field">
                      <span>Ends</span>
                      <select value={endMode} onChange={(e) => setEndMode(e.target.value as 'until' | 'count')}>
                        <option value="until">On date</option>
                        <option value="count">After a number of events</option>
                      </select>
                    </label>
                    {endMode === 'until' ? (
                      <label className="field">
                        <span>End date</span>
                        <input type="date" required value={repeatUntil} min={start.slice(0, 10)}
                          onChange={(e) => setRepeatUntil(e.target.value)} />
                      </label>
                    ) : (
                      <label className="field">
                        <span>Events</span>
                        <input type="number" min={1} max={MAX_OCCURRENCES} required value={repeatCount}
                          onChange={(e) => setRepeatCount(e.target.value)} />
                      </label>
                    )}
                  </div>
                )}
                {never && <small className="hint">Events are created a year ahead and added automatically as time passes.</small>}
              </>
            )}
            {repeatSummary && <p className="repeat-summary">{'↻'} {repeatSummary}</p>}
          </div>
        )}
        <label className="field">
          <span>Notes</span>
          <textarea rows={3} placeholder="Optional notes" value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="field">
          <span>Color</span>
          <div className="swatches" role="radiogroup" aria-label="Color">
            <button type="button" role="radio" aria-checked={color === null} aria-label="Default"
              className={`swatch none${color === null ? ' selected' : ''}`} onClick={() => setColor(null)} />
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
                className={`swatch${color === c ? ' selected' : ''}`} style={{ background: c }}
                onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="form-actions">
          {event && <button type="button" className="danger" onClick={handleDelete}>Delete</button>}
          <button type="button" onClick={onDone}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </dialog>
  )
}