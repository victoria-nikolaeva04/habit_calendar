import { useState } from 'react'
import type { Task, TaskList } from '../lib/taskApi'
import type { TimeFormat } from '../lib/timeFormat'
import { TaskDetails } from './TaskDetails'
import { TaskForm } from './TaskForm'

type Props = {
  task?: Task         // clicked task: shows its details first
  day?: Date          // set when creating: the due date to start with
  lists: TaskList[]
  defaultList?: string | null  // set when creating: the list to start in
  timeFormat: TimeFormat
  onDone: () => void  // close and reload
  onChanged?: () => void  // something was changed without closing (a subtask was ticked)
}

// Clicking an existing task shows its details; the pencil opens the edit form. Creating goes straight to the form.
export function TaskPopup({ task, timeFormat, onDone, onChanged, ...rest }: Props) {
  const [editing, setEditing] = useState(!task)
  if (task && !editing) {
    return (
      <TaskDetails task={task} lists={rest.lists} timeFormat={timeFormat}
        onEdit={() => setEditing(true)} onClose={onDone} onChanged={() => onChanged?.()} />
    )
  }
  return <TaskForm task={task} {...rest} onDone={onDone} />
}
