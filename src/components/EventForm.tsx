import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addDays, addHours, differenceInCalendarDays, endOfDay, format, set, setHours, startOfDay } from 'date-fns'
import { inTz, toUtcIso, wallTime } from '../lib/tz'
import {
  cancelOccurrence, createEvents, createSeries, deleteEvent, deleteSeries, saveOccurrence, splitSeries,
  updateEvent, updateSeries, type CalendarEvent,
} from '../lib/api'
import { describeRule, lastOccurrence, splitRule, type Recurrence } from '../lib/recurrence'
import { initialRepeat, repeatError, repeatRule } from '../lib/repeat'
import { RepeatPicker } from './RepeatPicker'

const COLORS = ['#5b6cff', '#ffa95c', '#38bdf8', '#34d399', '#f87171', '#f472b6', '#a78bfa', '#64748b']

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
  const [rep, setRep] = useState(() => initialRepeat(defaultStart.getDay()))
  // Editing one occurrence of a series: change just this one, this and the ones after it, or the whole series
  const inSeries = !!event?.series_id
  const [scope, setScope] = useState<'one' | 'following' | 'all'>('one')
  const initialDay = event ? format(inTz(event.starts_at, timeZone), 'yyyy-MM-dd') : ''
  const [error, setError] = useState<string | null>(null)

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
      if (event && inSeries && scope !== 'one') {
        // The time and length become part of the schedule; each event keeps its own date
        if (format(startDate, 'yyyy-MM-dd') !== initialDay) {
          setError('To move one event to another date, choose "This event".')
          return
        }
        const master = event.master!
        const rule = master.recurrence as unknown as Recurrence
        const masterStart = inTz(master.starts_at, timeZone)
        const masterEnd = inTz(master.ends_at, timeZone)
        // A new first start/end: `from`'s date with the form's times, and the form's number of days between them
        const schedule = (from: Date) => {
          const s = set(from, {
            hours: startDate.getHours(), minutes: startDate.getMinutes(),
            seconds: startDate.getSeconds(), milliseconds: startDate.getMilliseconds(),
          })
          const e = set(addDays(s, differenceInCalendarDays(endDate, startDate)), {
            hours: endDate.getHours(), minutes: endDate.getMinutes(),
            seconds: endDate.getSeconds(), milliseconds: endDate.getMilliseconds(),
          })
          return { s, e }
        }
        const shapeOf = (a: Date, b: Date) =>
          [format(a, 'HH:mm:ss.SSS'), differenceInCalendarDays(b, a), format(b, 'HH:mm:ss.SSS')].join('|')
        // When the schedule changes, events that were edited or deleted one by one no longer line up with it
        const scheduleChanged = allDay !== master.all_day || shapeOf(masterStart, masterEnd) !== shapeOf(startDate, endDate)

        if (scope === 'all') {
          const { s, e } = schedule(masterStart)
          const last = lastOccurrence(s, e, rule, timeZone)
          await updateSeries(master.id, {
            title, notes: fields.notes, color, all_day: allDay,
            starts_at: toUtcIso(s), ends_at: toUtcIso(e),
            recurrence_ends_at: last ? toUtcIso(last.end) : null,
          }, scheduleChanged)
        } else {
          const at = inTz(event.original_start!, timeZone)
          const { s, e } = schedule(at)
          const { before, after } = splitRule(masterStart, masterEnd, rule, timeZone, at)
          const last = lastOccurrence(s, e, after, timeZone)
          await splitSeries({
            seriesId: master.id,
            splitAt: toUtcIso(at),
            before: before && { rule: before.rule, endsAt: toUtcIso(before.endsAt) },
            next: {
              title, notes: fields.notes, color, all_day: allDay,
              starts_at: toUtcIso(s), ends_at: toUtcIso(e),
              recurrence: after, recurrence_ends_at: last ? toUtcIso(last.end) : null,
            },
            dropExceptions: scheduleChanged,
          })
        }
      } else if (event && inSeries) {
        await saveOccurrence(event, fields)
      } else if (event) {
        await updateEvent(event.id, fields)
      } else if (!repeatRule(rep)) {
        await createEvents([fields])
      } else {
        const repeatProblem = repeatError(rep, 'events')
        if (repeatProblem) {
          setError(repeatProblem)
          return
        }
        // One row holds the whole series: the first event plus the rule. The calendar generates the
        // rest (wall-clock time is kept across DST).
        const rule = repeatRule(rep)!
        let endsAt: string | null = null
        if (!rule.never) {
          const last = lastOccurrence(startDate, endDate, rule, timeZone)
          if (!last) {
            setError('No events fall before the end date.')
            return
          }
          endsAt = toUtcIso(last.end)
        }
        await createSeries(fields, rule, endsAt)
      }
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const startPreview = wallTime(start, timeZone) // may be invalid while the field is being edited

  async function handleDelete() {
    if (!event) return
    const which = inSeries ? scope : 'one'
    const question = which === 'all' ? `Delete every event in the series "${event.title}"?`
      : which === 'following' ? `Delete "${event.title}" and all the events after it?`
      : `Delete "${event.title}"?`
    if (!confirm(question)) return
    try {
      if (!inSeries) await deleteEvent(event.id)
      else if (scope === 'one') await cancelOccurrence(event)
      else if (scope === 'all') await deleteSeries(event.series_id!)
      else {
        const master = event.master!
        const at = inTz(event.original_start!, timeZone)
        const { before } = splitRule(
          inTz(master.starts_at, timeZone), inTz(master.ends_at, timeZone),
          master.recurrence as unknown as Recurrence, timeZone, at,
        )
        await splitSeries({
          seriesId: master.id, splitAt: toUtcIso(at),
          before: before && { rule: before.rule, endsAt: toUtcIso(before.endsAt) },
          next: null, dropExceptions: true,
        })
      }
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
              <label className="check"><input type="radio" name="scope" checked={scope === 'following'}
                onChange={() => setScope('following')} /> This and following events</label>
              <label className="check"><input type="radio" name="scope" checked={scope === 'all'}
                onChange={() => setScope('all')} /> All events in the series</label>
            </div>
          </div>
        )}
        <fieldset className="plain">
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
        {!event && <RepeatPicker state={rep} onChange={setRep} start={startPreview} zone={timeZone} noun="events" />}
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