import { useState } from 'react'
import { setTaskDone, type Task } from '../lib/taskApi'
import { activate } from '../lib/a11y'
import { isDone, taskTimeLabel } from '../lib/tasks'
import type { TimeFormat } from '../lib/timeFormat'
import { RepeatMark } from './RepeatMark'

type Props = {
  task: Task
  timeFormat: TimeFormat
  onOpen: (task: Task) => void   // the chip was clicked: show it
  onChanged: () => void          // it (or one of its subtasks) was ticked or unticked
  variant?: 'chip' | 'row'       // 'chip' sits in a calendar day, 'row' in the side panel
}

// A task with its checkbox. Ticking it marks it done; clicking anywhere else opens it.
// In the side panel ('row') its subtasks are listed underneath with their own checkboxes.
export function TaskChip({ task, timeFormat, onOpen, onChanged, variant = 'chip' }: Props) {
  // Ticks show at once; the saved version replaces these when the list reloads
  const [mine, setMine] = useState({ task, done: isDone(task), subs: task.subtasks ?? [] })
  if (mine.task !== task) setMine({ task, done: isDone(task), subs: task.subtasks ?? [] })
  const subs = mine.subs
  // A task with subtasks is done when they all are
  const done = subs.length > 0 ? subs.every(isDone) : mine.done
  const time = taskTimeLabel(task, timeFormat)
  const subsDone = subs.filter(isDone).length
  const save = (t: Parameters<typeof setTaskDone>[0], value: boolean) =>
    setTaskDone(t, value).then(onChanged).catch((e) => console.error('Could not update the task:', e))
  const toggleTask = () => {
    setMine((m) => ({ ...m, done: !done }))
    save(task, !done)
  }
  const toggleSub = (s: (typeof subs)[number]) => {
    const value = !isDone(s)
    setMine((m) => ({ ...m, subs: m.subs.map((x) => (x.id === s.id ? { ...x, completed_at: value ? new Date().toISOString() : null } : x)) }))
    save(s, value)
  }

  return (
    <>
      <div
        className={`task task-${variant}${done ? ' done' : ''}`}
        role="button"
        tabIndex={0}
        title={[task.title, time, subs.length ? `${subsDone}/${subs.length} subtasks done` : null, task.notes].filter(Boolean).join('\n')}
        onClick={(e) => { e.stopPropagation(); onOpen(task) }}
        onKeyDown={activate(() => onOpen(task))}
      >
        <input
          type="checkbox"
          checked={done}
          aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={toggleTask}
        />
        <span className="task-text">
          {time && <small>{time} </small>}{task.title}
          {task.series_id && <RepeatMark />}
          {subs.length > 0 && <small className="task-progress"> {subsDone}/{subs.length}</small>}
        </span>
      </div>
      {variant === 'row' && subs.length > 0 && (
        <ul className="task-subtasks">
          {subs.map((s) => (
            <li key={s.id} className={isDone(s) ? 'done' : undefined}>
              <label>
                <input type="checkbox" checked={isDone(s)} onChange={() => toggleSub(s)} />
                <span>{s.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
