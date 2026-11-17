import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addHours, endOfDay, format, setHours, startOfDay } from 'date-fns'
import { inTz, toUtcIso, wallTime } from '../lib/tz'
import { createEvent, deleteEvent, updateEvent, type CalendarEvent } from '../lib/api'

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
      if (event) await updateEvent(event.id, fields)
      else await createEvent(fields)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDelete() {
    if (!event || !confirm(`Delete "${event.title}"?`)) return
    try {
      await deleteEvent(event.id)
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