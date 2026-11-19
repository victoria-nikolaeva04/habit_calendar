import { useEffect, useState } from 'react'
import { getTasks, type Task } from '../lib/taskApi'
import { dayKey } from '../lib/tasks'

const NONE = new Map<string, Task[]>()

// Tasks due from `from` to `to` in the chosen list(s), grouped by "yyyy-MM-dd". Reloads when `version` changes.
// A failure is not fatal: the calendar just shows no tasks.
export function useTasks(from: Date, to: Date, version: number, listFilter: string) {
  const [byDay, setByDay] = useState<Map<string, Task[]>>(NONE)
  const fromKey = dayKey(from)
  const toKey = dayKey(to)

  useEffect(() => {
    let cancelled = false
    getTasks(fromKey, toKey, listFilter)
      .then((tasks) => {
        if (cancelled) return
        const map = new Map<string, Task[]>()
        for (const t of tasks) map.set(t.due_date!, [...(map.get(t.due_date!) ?? []), t])
        setByDay(map)
      })
      .catch((e) => {
        if (cancelled) return
        console.error('Could not load tasks:', e)
        setByDay(NONE)
      })
    return () => { cancelled = true }
  }, [fromKey, toKey, version, listFilter])

  return byDay
}
