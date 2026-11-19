import { useCallback, useEffect, useState } from 'react'
import { getTaskLists, type TaskList } from '../lib/taskApi'

// The signed-in user's task lists. A failure is not fatal: there are just no lists to choose from.
export function useTaskLists(userId: string | undefined) {
  const [lists, setLists] = useState<TaskList[]>([])
  const [loadedFor, setLoadedFor] = useState<string | undefined>()
  const [key, setKey] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getTaskLists()
      .then((data) => { if (!cancelled) { setLists(data); setLoadedFor(userId) } })
      .catch((e) => { if (!cancelled) console.error('Could not load task lists:', e) })
    return () => { cancelled = true }
  }, [userId, key])

  const reload = useCallback(() => setKey((k) => k + 1), [])
  return { lists: loadedFor === userId ? lists : [], reload }
}
