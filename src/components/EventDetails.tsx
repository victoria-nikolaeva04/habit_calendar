import { useEffect, useRef } from 'react'
import { format, isSameDay } from 'date-fns'
import type { CalendarEvent } from '../lib/api'
import { describeRule, type Recurrence } from '../lib/recurrence'
import { formatTime, type TimeFormat } from '../lib/timeFormat'
import { inTz } from '../lib/tz'

type Props = {
  event: CalendarEvent
  timeZone: string
  timeFormat: TimeFormat
  onEdit: () => void
  onClose: () => void
}

// "Mon, Nov 23 · 9:00 AM – 10:00 AM", "Mon, Nov 23" (all day), or both dates for events spanning days
function describeWhen(e: CalendarEvent, timeZone: string, tf: TimeFormat) {
  const start = inTz(e.starts_at, timeZone)
  const end = inTz(e.ends_at, timeZone)
  const day = (d: Date) => format(d, 'EEE, MMM d, yyyy')
  if (e.all_day) return isSameDay(start, end) ? day(start) : `${day(start)} – ${day(end)}`
  if (isSameDay(start, end)) return `${day(start)} · ${formatTime(start, tf)} – ${formatTime(end, tf)}`
  return `${day(start)}, ${formatTime(start, tf)} – ${day(end)}, ${formatTime(end, tf)}`
}

// Read-only look at an event; the pencil switches to the edit form (which has Delete)
export function EventDetails({ event, timeZone, timeFormat, onEdit, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialogRef.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    return () => opener?.focus?.()
  }, [])

  const color = event.color ?? 'var(--accent)'

  return (
    <dialog
      ref={dialogRef}
      className="event-form event-details"
      aria-label={event.title}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => {
        // Click on the backdrop (outside the dialog box) closes it
        const r = e.currentTarget.getBoundingClientRect()
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (!inside) onClose()
      }}
    >
      <div className="details-head">
        <span className="details-dot" style={{ background: color }} aria-hidden="true" />
        <h3>{event.title}</h3>
        <button type="button" className="icon-btn" aria-label="Edit event" title="Edit" onClick={onEdit}>{'✎'}</button>
        <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>{'✕'}</button>
      </div>
      <p className="details-when">{describeWhen(event, timeZone, timeFormat)}</p>
      {event.series_id && event.recurrence && (
        <p className="details-repeat">{'↻'} {describeRule(event.recurrence as unknown as Recurrence)}</p>
      )}
      {event.notes && <p className="details-notes">{event.notes}</p>}
    </dialog>
  )
}
