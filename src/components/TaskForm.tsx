import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  cancelOccurrence, createTask, createTaskSeries, deleteTask, deleteTaskSeries, saveOccurrence, setTaskDone,
  splitTaskSeries, syncSubtasks, updateTask, updateTaskSeries, type Task, type TaskList,
} from '../lib/taskApi'
import { describeRule, lastOccurrence, splitRule, type Recurrence } from '../lib/recurrence'
import { initialRepeat, repeatError, repeatRule } from '../lib/repeat'
import { DEFAULT_LIST_NAME, TASK_ZONE, dayEnd, dayKey, dayStart, isDone } from '../lib/tasks'
import { RepeatPicker } from './RepeatPicker'
import { Plus, Repeat, X } from 'lucide-react'

type Props = {
  task?: Task               // set when editing
  day?: Date                // set when creating: the due date to start with
  lists: TaskList[]
  defaultList?: string | null  // set when creating: the list to start in (null = My Tasks)
  onDone: () => void        // close and reload
}

type SubtaskDraft = { id?: string; title: string }

// Add / edit / delete a task, as a modal like the event form
export function TaskForm({ task, day, lists, defaultList = null, onDone }: Props) {
  const inSeries = !!task?.series_id
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [listId, setListId] = useState<string | null>(task ? task.list_id : defaultList)
  const [dueDate, setDueDate] = useState(task ? (task.due_date ?? '') : day ? dayKey(day) : '')
  const [noDate, setNoDate] = useState(task ? task.due_date === null : !day) // "No due date" ticked
  const [dueTime, setDueTime] = useState(task?.due_time?.slice(0, 5) ?? '')
  const [done, setDone] = useState(task ? isDone(task) : false)
  const [rep, setRep] = useState(() => initialRepeat((day ?? new Date()).getDay()))
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>(() => (task?.subtasks ?? []).map((s) => ({ id: s.id, title: s.title })))
  // Editing one occurrence of a series: change just this one, this and the ones after it, or the whole series
  const [scope, setScope] = useState<'one' | 'following' | 'all'>('one')
  const [error, setError] = useState<string | null>(null)

  const repeating = !task && !noDate && rep.repeat !== 'none'
  const canHaveSubtasks = !inSeries && !repeating

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const fields = {
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: noDate ? null : dueDate || null,
      due_time: !noDate && dueDate && dueTime ? dueTime : null, // a time only makes sense with a date
      list_id: listId,
    }
    if (!fields.title) {
      setError('Please enter a title.')
      return
    }
    try {
      if (task && inSeries) {
        const master = task.master!
        if (scope === 'one') {
          if (!fields.due_date) {
            setError('A repeating task needs a due date.')
            return
          }
          await saveOccurrence(task, fields, done)
        } else {
          // The time and list apply to the group; each task keeps its own date
          if (fields.due_date !== task.due_date) {
            setError('To move one task to another date, choose "This task".')
            return
          }
          const shared = { title: fields.title, notes: fields.notes, due_time: fields.due_time, list_id: fields.list_id }
          if (scope === 'all') {
            await updateTaskSeries(master.id, shared)
          } else {
            const at = task.original_date!
            const { before, after } = splitRule(
              dayStart(master.due_date!), dayEnd(master.due_date!),
              master.recurrence as unknown as Recurrence, TASK_ZONE, dayStart(at),
            )
            const last = after.never ? undefined : lastOccurrence(dayStart(at), dayEnd(at), after, TASK_ZONE)
            await splitTaskSeries({
              seriesId: master.id,
              splitOn: at,
              before: before && { rule: before.rule, endsOn: dayKey(before.endsAt) },
              next: { ...fields, due_date: at, recurrence: after, recurrence_ends_on: last ? dayKey(last.start) : null },
            })
          }
        }
      } else if (task) {
        await updateTask(task.id, fields)
        if (done !== isDone(task)) await setTaskDone(task, done)
        await syncSubtasks(task.id, task.subtasks ?? [], subtasks.filter((s) => s.title.trim()).map((s) => ({ ...s, title: s.title.trim() })))
      } else if (repeating) {
        const problem = repeatError(rep, 'tasks')
        if (problem) {
          setError(problem)
          return
        }
        await createTaskSeries(fields, repeatRule(rep)!)
      } else {
        const id = await createTask(fields)
        const titles = subtasks.map((s) => s.title.trim()).filter(Boolean)
        if (titles.length) await syncSubtasks(id, [], titles.map((t) => ({ title: t })))
      }
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDelete() {
    if (!task) return
    const which = inSeries ? scope : 'one'
    const question = which === 'all' ? `Delete every task in the series "${task.title}"?`
      : which === 'following' ? `Delete "${task.title}" and all the tasks after it?`
      : `Delete "${task.title}"?`
    if (!confirm(question)) return
    try {
      if (!inSeries) await deleteTask(task.id)
      else if (scope === 'one') await cancelOccurrence(task)
      else if (scope === 'all') await deleteTaskSeries(task.series_id!)
      else {
        const master = task.master!
        const { before } = splitRule(
          dayStart(master.due_date!), dayEnd(master.due_date!),
          master.recurrence as unknown as Recurrence, TASK_ZONE, dayStart(task.original_date!),
        )
        await splitTaskSeries({
          seriesId: master.id,
          splitOn: task.original_date!,
          before: before && { rule: before.rule, endsOn: dayKey(before.endsAt) },
          next: null,
        })
      }
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Open as a real modal: backdrop blocks the calendar behind it, Escape closes, focus stays inside
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialogRef.current
    const opener = document.activeElement as HTMLElement | null
    if (d && !d.open) d.showModal()
    return () => opener?.focus?.()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="event-form task-form"
      onCancel={(e) => { e.preventDefault(); onDone() }}
      onClick={(e) => {
        // Click on the backdrop (outside the dialog box) closes it
        const r = e.currentTarget.getBoundingClientRect()
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        if (!inside) onDone()
      }}
    >
      <form onSubmit={handleSubmit}>
        <h3>{task ? 'Edit task' : 'New task'}</h3>
        <label className="field">
          <span>Title</span>
          <input required autoFocus placeholder="Task title" value={title}
            onChange={(e) => setTitle(e.target.value)} />
        </label>
        {inSeries && (
          <div className="field" role="radiogroup" aria-label="Apply changes to">
            <span>
              <Repeat size={16} aria-hidden="true" /> Part of a repeating series
              {task?.recurrence ? ` (${describeRule(task.recurrence as unknown as Recurrence)})` : ''}
            </span>
            <div className="scope">
              <label className="check"><input type="radio" name="task-scope" checked={scope === 'one'}
                onChange={() => setScope('one')} /> This task</label>
              <label className="check"><input type="radio" name="task-scope" checked={scope === 'following'}
                onChange={() => setScope('following')} /> This and following tasks</label>
              <label className="check"><input type="radio" name="task-scope" checked={scope === 'all'}
                onChange={() => setScope('all')} /> All tasks in the series</label>
            </div>
          </div>
        )}
        {lists.length > 0 && (
          <label className="field">
            <span>List</span>
            <select value={listId ?? ''} onChange={(e) => setListId(e.target.value || null)}>
              <option value="">{DEFAULT_LIST_NAME}</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <div className="field-row">
          <label className="field">
            <span>Due date</span>
            <input type="date" required={!noDate} value={noDate ? '' : dueDate} disabled={noDate || (inSeries && scope !== 'one')}
              onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Due time</span>
            <input type="time" value={noDate ? '' : dueTime} disabled={noDate || !dueDate}
              onChange={(e) => setDueTime(e.target.value)} />
          </label>
        </div>
        {!inSeries && (
          <label className="check">
            <input type="checkbox" checked={noDate} onChange={(e) => {
              setNoDate(e.target.checked)
              // Unticking starts from the day you added it on, or today
              if (!e.target.checked && !dueDate) setDueDate(dayKey(day ?? new Date()))
            }} /> No due date
          </label>
        )}
        {!task && !noDate && (
          <RepeatPicker state={rep} onChange={setRep} start={dayStart(dueDate)} zone={TASK_ZONE} noun="tasks" />
        )}
        <label className="field">
          <span>Details</span>
          <textarea rows={3} placeholder="Optional details" value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </label>
        {canHaveSubtasks && (
          <div className="field">
            <span>Subtasks</span>
            <ul className="subtask-edit">
              {subtasks.map((s, i) => (
                <li key={s.id ?? `new-${i}`}>
                  <input
                    aria-label={`Subtask ${i + 1}`}
                    placeholder="Subtask"
                    value={s.title}
                    autoFocus={!s.id && s.title === ''}
                    onChange={(e) => setSubtasks((cur) => cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      // Enter adds the next subtask instead of saving the whole form
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (s.title.trim()) setSubtasks((cur) => [...cur.slice(0, i + 1), { title: '' }, ...cur.slice(i + 1)])
                      }
                    }}
                  />
                  <button type="button" className="icon-btn" aria-label={`Remove subtask ${i + 1}`} title="Remove"
                    onClick={() => setSubtasks((cur) => cur.filter((_, j) => j !== i))}><X size={16} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="add-subtask" onClick={() => setSubtasks((cur) => [...cur, { title: '' }])}>
              <Plus size={16} aria-hidden="true" /> Add subtask
            </button>
          </div>
        )}
        {task && (!inSeries || scope === 'one') && (
          <label className="check">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> Completed
          </label>
        )}
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="form-actions">
          {task && <button type="button" className="danger" onClick={handleDelete}>Delete</button>}
          <button type="button" onClick={onDone}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </dialog>
  )
}
