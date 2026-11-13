import { useState, type FormEvent } from 'react'
import { endOfDay, format, setHours, startOfDay } from 'date-fns'
import { createEvent, deleteEvent, updateEvent, type CalendarEvent } from '../lib/api'

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

// <input type="datetime-local"> wants "2026-11-13T09:00" in local time
const toInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")

type Props = {
  event?: CalendarEvent   // set when editing
  day?: Date              // set when creating
  onDone: () => void      // close and reload
}

export function EventForm({ event, day, onDone }: Props) {
  const defaultStart = setHours(day ?? new Date(), 9)
  const [title, setTitle] = useState(event?.title ?? '')
  const [start, setStart] = useState(toInput(event ? new Date(event.starts_at) : defaultStart))
  const [end, setEnd] = useState(toInput(event ? new Date(event.ends_at) : setHours(defaultStart, 10)))
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [color, setColor] = useState<string | null>(event?.color ?? null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // All-day events span the whole start day; the end input is ignored
    const startDate = allDay ? startOfDay(new Date(start)) : new Date(start)
    const endDate = allDay ? endOfDay(startDate) : new Date(end)
    const fields = {
      title,
      all_day: allDay,
      notes: notes.trim() || null,
      color,
      starts_at: startDate.toISOString(),  // local time -> UTC
      ends_at: endDate.toISOString(),
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
    await deleteEvent(event.id)
    onDone()
  }

  return (
    <dialog open className="event-form">
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
            <span>{allDay ? 'Date' : 'Starts'}</span>
            {allDay ? (
              <input type="date" required value={start.slice(0, 10)}
                onChange={(e) => e.target.value && setStart(`${e.target.value}T${start.slice(11)}`)} />
            ) : (
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            )}
          </label>
          {!allDay && (
            <label className="field">
              <span>Ends</span>
              <input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </label>
          )}
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