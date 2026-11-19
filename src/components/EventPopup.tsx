import { useState } from 'react'
import type { CalendarEvent } from '../lib/api'
import type { TimeFormat } from '../lib/timeFormat'
import { EventDetails } from './EventDetails'
import { EventForm } from './EventForm'

type Props = {
  event?: CalendarEvent   // clicked event: shows its details first
  day?: Date              // set when creating: the day to add to
  at?: Date               // set when creating from a clicked time slot
  timeZone: string
  timeFormat: TimeFormat
  onDone: () => void      // close and reload
}

// Clicking an existing event shows its details; the pencil opens the edit form. Creating goes straight to the form.
export function EventPopup({ event, timeFormat, onDone, ...rest }: Props) {
  const [editing, setEditing] = useState(!event)
  if (event && !editing) {
    return (
      <EventDetails event={event} timeZone={rest.timeZone} timeFormat={timeFormat}
        onEdit={() => setEditing(true)} onClose={onDone} />
    )
  }
  return <EventForm event={event} {...rest} onDone={onDone} />
}
