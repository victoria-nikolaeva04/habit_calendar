import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createTaskList, deleteTaskList, renameTaskList, type TaskList } from '../lib/taskApi'

type Props = {
  lists: TaskList[]
  onChanged: () => void         // lists were added, renamed or deleted (reload them)
  onDeleted: (id: string) => void  // a list and its tasks were deleted
  onClose: () => void
}

// Create, rename and delete task lists. "My Tasks" is built in and always there.
export function ListsDialog({ lists, onChanged, onDeleted, onClose }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialogRef.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    return () => opener?.focus?.()
  }, [])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    run(async () => { await createTaskList(name); setName('') })
  }

  return (
    <dialog
      ref={dialogRef}
      className="event-form event-details lists-dialog"
      aria-label="Task lists"
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (!inside) onClose()
      }}
    >
      <div className="details-head">
        <h3>Task lists</h3>
        <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>{'✕'}</button>
      </div>
      <ul className="lists-edit">
        <li><span className="list-builtin">My Tasks</span><small>built in</small></li>
        {lists.map((l) => (
          <li key={l.id}>
            <input
              aria-label={`Rename list ${l.name}`}
              defaultValue={l.name}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (!next) e.target.value = l.name // a list needs a name
                else if (next !== l.name) run(() => renameTaskList(l.id, next))
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
            <button type="button" className="danger" onClick={() => {
              if (!confirm(`Delete the list "${l.name}" and all of its tasks?`)) return
              run(async () => { await deleteTaskList(l.id); onDeleted(l.id) })
            }}>Delete</button>
          </li>
        ))}
      </ul>
      <form className="lists-add" onSubmit={add}>
        <input aria-label="New list name" placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="primary" disabled={!name.trim()}>Add list</button>
      </form>
      {error && <p role="alert" className="form-error">{error}</p>}
    </dialog>
  )
}
