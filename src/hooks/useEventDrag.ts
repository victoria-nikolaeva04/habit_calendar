import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { addDays, addMinutes, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import { duplicateEvent, moveEvent, type CalendarEvent } from '../lib/api'
import { HOUR_PX } from '../lib/dayLayout'
import { inTz, toUtcIso } from '../lib/tz'
import type { History } from './useUndoStack'

// Which kind of day column an event can be dropped on. Both mark their elements with data-day="yyyy-MM-dd":
//   timed  the hour grid of the week/day view (the drop time follows the pointer)
//   day    a month cell or an all-day row (only the day changes)
export type DragGrid = 'timed' | 'day'
export type DragMode = 'move' | 'resize'

const DRAG_THRESHOLD_PX = 4
const SNAP_MINUTES = 15

type Preview = { event: CalendarEvent; start: Date; end: Date; copy: boolean; saving: boolean }

const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES

function columnAt(grid: DragGrid, x: number, y: number) {
  for (const el of document.elementsFromPoint(x, y)) {
    const col = el.closest<HTMLElement>(`[data-grid="${grid}"][data-day]`)
    if (col) return col
  }
  return null
}

// Drag an event to move it, drag the bottom edge of a timed one to resize it, and hold Alt/Ctrl while
// dropping to leave the original in place and add a copy. While dragging, `preview` swaps in the new
// position; every drop is recorded in `history` so it can be undone.
export function useEventDrag({ timeZone, history, onChanged, onError }: {
  timeZone: string
  history: History
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [drag, setDrag] = useState<Preview | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  // Handlers keep seeing the latest callbacks without re-registering window listeners
  const latest = useRef({ history, onChanged, onError })
  useEffect(() => { latest.current = { history, onChanged, onError } })
  useEffect(() => () => cleanup.current?.(), []) // unmounting mid-drag

  const begin = useCallback((e: ReactPointerEvent, event: CalendarEvent, mode: DragMode, grid: DragGrid) => {
    if (e.button !== 0 || cleanup.current) return
    const firstCol = columnAt(grid, e.clientX, e.clientY)
    if (!firstCol) return
    const origin = { start: inTz(event.starts_at, timeZone), end: inTz(event.ends_at, timeZone) }
    const minuteIn = (col: HTMLElement, y: number) => ((y - col.getBoundingClientRect().top) / HOUR_PX) * 60
    const down = { x: e.clientX, y: e.clientY, day: parseISO(firstCol.dataset.day!), minute: minuteIn(firstCol, e.clientY) }
    let col = firstCol
    let dragging = false
    let current: Preview = { event, ...origin, copy: false, saving: false }

    const compute = (x: number, y: number, copy: boolean): Preview => {
      col = columnAt(grid, x, y) ?? col // outside every column: stay on the last one
      const minutes = grid === 'timed' ? snap(minuteIn(col, y) - down.minute) : 0
      if (mode === 'resize') {
        const dayEnd = addDays(startOfDay(new Date(origin.end.getTime() - 1)), 1) // stay on the last day
        const end = new Date(Math.min(
          Math.max(addMinutes(origin.end, minutes).getTime(), addMinutes(origin.start, SNAP_MINUTES).getTime()),
          Math.max(dayEnd.getTime(), addMinutes(origin.start, SNAP_MINUTES).getTime()),
        ))
        return { event, start: origin.start, end: inTz(end, timeZone), copy: false, saving: false }
      }
      const days = differenceInCalendarDays(parseISO(col.dataset.day!), down.day)
      return {
        event, copy, saving: false,
        start: addMinutes(addDays(origin.start, days), minutes),
        end: addMinutes(addDays(origin.end, days), minutes),
      }
    }

    let last = { x: e.clientX, y: e.clientY, copy: false }
    const update = () => { current = compute(last.x, last.y, last.copy); setDrag(current) }
    const copyKey = (ev: { altKey: boolean; ctrlKey: boolean }) => ev.altKey || ev.ctrlKey

    const onMove = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY, copy: copyKey(ev) }
      if (!dragging) {
        if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < DRAG_THRESHOLD_PX) return
        dragging = true
        document.body.classList.add('dragging-event')
      }
      update()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { finish(false); return }
      if (!dragging || mode !== 'move') return
      last = { ...last, copy: copyKey(ev) }
      update()
    }
    const onUp = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY, copy: copyKey(ev) }
      finish(dragging)
    }

    function finish(drop: boolean) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      document.body.classList.remove('dragging-event')
      cleanup.current = null
      if (!dragging) return
      // The click that ends a drag must not open the event (or the "add event" popup under the pointer)
      const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, true), 0)

      if (drop) current = compute(last.x, last.y, last.copy)
      const unchanged = current.start.getTime() === origin.start.getTime() && current.end.getTime() === origin.end.getTime()
      if (!drop || (unchanged && !current.copy)) { setDrag(null); return }

      const done = current
      setDrag({ ...done, saving: true }) // stays on screen until the reloaded events replace it (see clear)
      const startIso = toUtcIso(done.start)
      const endIso = toUtcIso(done.end)
      const verb = done.copy ? 'Duplicated' : mode === 'resize' ? 'Resized' : 'Moved'
      ;(done.copy ? duplicateEvent(event, startIso, endIso) : moveEvent(event, startIso, endIso))
        .then((undo) => {
          latest.current.history.push({ label: `${verb} “${event.title}”`, undo })
          latest.current.onChanged()
        })
        .catch((err: Error) => {
          setDrag(null)
          latest.current.onError(`Couldn't ${verb.toLowerCase().replace(/d$/, '')} the event: ${err.message}`)
        })
    }
    const onCancel = () => finish(false)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    cleanup.current = () => finish(false)
  }, [timeZone])

  // `events` with the dragged one at its new place (or, when copying, the original plus a copy)
  const preview = useCallback((events: CalendarEvent[]): CalendarEvent[] => {
    if (!drag) return events
    const moved = { ...drag.event, starts_at: toUtcIso(drag.start), ends_at: toUtcIso(drag.end) }
    if (drag.copy) return [...events, { ...moved, id: `${drag.event.id}#copy`, series_id: null, recurrence: null, virtual: false }]
    return events.map((e) => (e.id === drag.event.id ? moved : e))
  }, [drag])

  // The reloaded events now include the change: drop the preview (a drag still in progress is kept)
  const clear = useCallback(() => setDrag((d) => (d?.saving ? null : d)), [])

  // Extra CSS classes for an event while it is being dragged
  const classFor = (e: CalendarEvent) =>
    !drag ? '' : e.id === `${drag.event.id}#copy` ? ' drag-ghost' : e.id === drag.event.id ? (drag.copy ? ' drag-origin' : ' dragging') : ''

  return { begin, preview, clear, classFor }
}
