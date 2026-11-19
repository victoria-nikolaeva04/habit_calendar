import { format } from 'date-fns'
import { formatTime, type TimeFormat } from './timeFormat'
import { wallTime } from './tz'

// Which list(s) the calendar shows: every list, the built-in "My Tasks" list, or one list's id
export const ALL_LISTS = 'all'
export const DEFAULT_LIST = 'default'
export const DEFAULT_LIST_NAME = 'My Tasks'

export const inList = (t: { list_id: string | null }, filter: string) =>
  filter === ALL_LISTS || (filter === DEFAULT_LIST ? t.list_id === null : t.list_id === filter)

// "yyyy-MM-dd" for a (zoned) day: how tasks are keyed by due date
export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

// Task dates have no time zone, so a repeating task's days are worked out in UTC where there is no daylight saving.
// These turn a "yyyy-MM-dd" date into the start / end of that day for the repeat rule code, and back.
export const TASK_ZONE = 'UTC'
export const dayStart = (key: string) => wallTime(`${key}T00:00`, TASK_ZONE)
export const dayEnd = (key: string) => wallTime(`${key}T23:59`, TASK_ZONE)

// Parses a "yyyy-MM-dd" date as a local calendar date, for showing it
export function parseDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// The due time as "9:00 AM" / "09:00", or null if the task has none
export function taskTimeLabel(t: { due_time: string | null }, tf: TimeFormat) {
  if (!t.due_time) return null
  const [h, m] = t.due_time.split(':').map(Number)
  return formatTime(new Date(2000, 0, 1, h, m), tf)
}

export const isDone = (t: { completed_at: string | null }) => t.completed_at !== null
