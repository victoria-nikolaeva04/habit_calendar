import { useCallback, useEffect, useState } from 'react'

export type UndoEntry = { label: string; undo: () => Promise<void> }
export type History = { push: (entry: UndoEntry) => void }

const MAX_ENTRIES = 50
const NOTICE_MS = 6000

// The changes made by dragging events, newest last. `undo` reverts the newest one and then calls `onChanged`
// so the calendar reloads.
export function useUndoStack(onChanged: () => void) {
  const [stack, setStack] = useState<UndoEntry[]>([])
  const [notice, setNotice] = useState<UndoEntry | null>(null) // the change announced in the toast
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const push = useCallback((entry: UndoEntry) => {
    setStack((s) => [...s.slice(-(MAX_ENTRIES - 1)), entry])
    setNotice(entry)
    setError(null)
  }, [])

  const undo = useCallback(async () => {
    const entry = stack[stack.length - 1]
    if (!entry || busy) return
    setBusy(true)
    try {
      await entry.undo()
      setStack((s) => s.filter((e) => e !== entry))
      setNotice(null)
      setError(null)
      onChanged()
    } catch (e) {
      setError(`Couldn't undo: ${e instanceof Error ? e.message : 'something went wrong'}`)
    } finally {
      setBusy(false)
    }
  }, [stack, busy, onChanged])

  const clear = useCallback(() => { setStack([]); setNotice(null); setError(null) }, [])

  // The toast goes away on its own
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // Ctrl/Cmd+Z, unless the user is typing (where it means "undo typing")
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || e.shiftKey || e.altKey || !(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (document.querySelector('dialog[open]')) return // a form is open
      e.preventDefault()
      void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  const last = stack[stack.length - 1]
  return { push, undo, clear, canUndo: !!last && !busy, lastLabel: last?.label, notice, busy, error, dismiss: () => { setNotice(null); setError(null) } }
}
