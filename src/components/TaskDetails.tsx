import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { setTaskDone, type Task, type TaskList, type TaskRow } from '../lib/taskApi'
import { describeRule, type Recurrence } from '../lib/recurrence'
import { DEFAULT_LIST_NAME, isDone, parseDay, taskTimeLabel } from '../lib/tasks'
import type { TimeFormat } from '../lib/timeFormat'

type Props = {
  task: Task
  lists: TaskList[]
  timeFormat: TimeFormat
  onEdit: () => void
  onClose: () => void
  onChanged: () => void   // a subtask was ticked: reload the calendar behind
}

// "Fri, Nov 20, 2026 · 5:00 PM", or "No due date"
function describeDue(t: Task, tf: TimeFormat) {
  if (!t.due_date) return 'No due date'
  const day = format(parseDay(t.due_date), 'EEE, MMM d, yyyy')
  const time = taskTimeLabel(t, tf)
  return time ? `${day} · ${time}` : day
}

// Read-only look at a task; the pencil switches to the edit form (which has Delete)
export function TaskDetails({ task, lists, timeFormat, onEdit, onClose, onChanged }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [subtasks, setSubtasks] = useState<TaskRow[]>(task.subtasks ?? [])
  useEffect(() => {
    const d = dialogRef.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    return () => opener?.focus?.()
  }, [])

  // With subtasks, the task is done when they all are (the database does the same when one is ticked)
  const done = subtasks.length > 0 ? subtasks.every(isDone) : isDone(task)
  const listName = task.list_id ? lists.find((l) => l.id === task.list_id)?.name : DEFAULT_LIST_NAME

  function toggleSubtask(s: TaskRow) {
    const value = !isDone(s)
    setSubtasks((cur) => cur.map((x) => (x.id === s.id ? { ...x, completed_at: value ? new Date().toISOString() : null } : x)))
    setTaskDone(s, value).then(onChanged).catch((e) => console.error('Could not update the subtask:', e))
  }

  return (
    <dialog
      ref={dialogRef}
      className="event-form event-details"
      aria-label={task.title}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => {
        // Click on the backdrop (outside the dialog box) closes it
        const r = e.currentTarget.getBoundingClientRect()
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (!inside) onClose()
      }}
    >
      <div className="details-head">
        <span className="details-check" aria-hidden="true">{done ? '☑' : '☐'}</span>
        <h3 className={done ? 'details-done' : undefined}>{task.title}</h3>
        <button type="button" className="icon-btn" aria-label="Edit task" title="Edit" onClick={onEdit}>{'✎'}</button>
        <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>{'✕'}</button>
      </div>
      <p className="details-when">{describeDue(task, timeFormat)}</p>
      {task.series_id && task.recurrence && (
        <p className="details-repeat">{'↻'} {describeRule(task.recurrence as unknown as Recurrence)}</p>
      )}
      <p className="details-repeat">{done ? 'Completed' : 'Not completed'}{listName ? ` · ${listName}` : ''}</p>
      {task.notes && <p className="details-notes">{task.notes}</p>}
      {subtasks.length > 0 && (
        <ul className="details-subtasks" aria-label="Subtasks">
          {subtasks.map((s) => (
            <li key={s.id} className={isDone(s) ? 'done' : undefined}>
              <label>
                <input type="checkbox" checked={isDone(s)} onChange={() => toggleSubtask(s)} />
                <span>{s.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </dialog>
  )
}
