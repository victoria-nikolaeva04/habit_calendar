import type { CSSProperties, MouseEvent } from 'react'
import { addMinutes, endOfDay, startOfDay } from 'date-fns'
import type { CalendarEvent } from './api'
import { eventStyle } from './eventStyle'

export const HOUR_PX = 48
const MS_PER_HOUR = 3_600_000
const MIN_HEIGHT_PX = 18

// The half-hour slot under a click inside a day column (top of the column = midnight)
export function slotAt(e: MouseEvent<HTMLElement>, day: Date) {
  const rect = e.currentTarget.getBoundingClientRect()
  const slot = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2)
  return addMinutes(startOfDay(day), Math.min(Math.max(slot, 0), 47) * 30)
}

// Events that overlap this day. An event ending exactly at midnight belongs to the day before, not the next.
export function eventsOn(day: Date, events: CalendarEvent[]) {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = endOfDay(day).getTime()
  return events.filter((e) => {
    const s = new Date(e.starts_at).getTime()
    const en = new Date(e.ends_at).getTime()
    return s <= dayEnd && (en > dayStart || s >= dayStart)
  })
}

type Item = { event: CalendarEvent; top: number; height: number; col: number; cols: number }

// Position timed events inside one day column (clamped to that day).
// Events that overlap in time are placed side by side instead of on top of each other.
export function layoutTimed(events: CalendarEvent[], day: Date): { event: CalendarEvent; style: CSSProperties }[] {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = endOfDay(day).getTime()

  const items: Item[] = events
    .map((event) => {
      const s = Math.max(new Date(event.starts_at).getTime(), dayStart)
      const e = Math.min(new Date(event.ends_at).getTime(), dayEnd)
      return {
        event,
        top: ((s - dayStart) / MS_PER_HOUR) * HOUR_PX,
        height: Math.max(((e - s) / MS_PER_HOUR) * HOUR_PX, MIN_HEIGHT_PX),
        col: 0,
        cols: 1,
      }
    })
    .sort((a, b) => a.top - b.top || b.height - a.height)

  // Split into clusters of transitively overlapping events, then give each event a column
  let cluster: Item[] = []
  let clusterBottom = -Infinity
  let colBottoms: number[] = []
  const closeCluster = () => {
    for (const it of cluster) it.cols = colBottoms.length
    cluster = []
    colBottoms = []
  }
  for (const it of items) {
    if (it.top >= clusterBottom) closeCluster()
    let col = colBottoms.findIndex((bottom) => bottom <= it.top)
    if (col === -1) col = colBottoms.length
    colBottoms[col] = it.top + it.height
    it.col = col
    cluster.push(it)
    clusterBottom = Math.max(clusterBottom, it.top + it.height)
  }
  closeCluster()

  return items.map((it) => ({
    event: it.event,
    style: {
      top: it.top,
      height: it.height,
      left: `calc(${(it.col / it.cols) * 100}% + 2px)`,
      width: `calc(${100 / it.cols}% - 4px)`,
      right: 'auto',
      ...eventStyle(it.event.color),
    },
  }))
}
