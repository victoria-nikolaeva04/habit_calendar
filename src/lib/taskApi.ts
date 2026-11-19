import { addDays, format } from 'date-fns'
import { supabase } from './supabase'
import type { Database, Json } from './database.types'
import { expand, lastOccurrence, upcomingOccurrence, type Recurrence } from './recurrence'
import { TASK_ZONE, dayEnd, dayStart, inList } from './tasks'

type Tables = Database['public']['Tables']
export type TaskRow = Tables['tasks']['Row']
export type TaskList = Tables['task_lists']['Row']

// What the calendar shows. A repeating task is not stored per occurrence: each occurrence is generated from its
// series' master row (`virtual`, with a made-up id) or, if that single occurrence was changed or ticked off,
// comes from its exception row. Either way `series_id` is the master's id, `original_date` is the date it had
// in the schedule, and `master` is the series' row. `subtasks` are loaded for ordinary tasks.
export type Task = TaskRow & { master?: TaskRow; virtual?: boolean; subtasks?: TaskRow[] }

// What can be edited on a task (a subtask only uses the title)
export type TaskFields = {
  title: string
  notes: string | null
  due_date: string | null
  due_time: string | null
  list_id: string | null
}

const keyOf = (d: Date) => format(d, 'yyyy-MM-dd')

// ---------- Lists ----------

export async function getTaskLists() {
  const { data, error } = await supabase.from('task_lists').select('*').order('created_at')
  if (error) throw error
  return data
}

export async function createTaskList(name: string) {
  const { data, error } = await supabase.from('task_lists').insert({ name: name.trim() }).select().single()
  if (error) throw error
  return data
}

export async function renameTaskList(id: string, name: string) {
  const { error } = await supabase.from('task_lists').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

// Also deletes the list's tasks
export async function deleteTaskList(id: string) {
  const { error } = await supabase.from('task_lists').delete().eq('id', id)
  if (error) throw error
}

// ---------- Reading ----------

// Untimed first, then by time, then oldest first
const byDue = (a: TaskRow, b: TaskRow) =>
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
  (a.due_time ?? '').localeCompare(b.due_time ?? '') ||
  a.created_at.localeCompare(b.created_at)

function occurrenceTask(master: TaskRow, date: string): Task {
  return {
    ...master,
    id: `${master.id}@${date}`,
    series_id: master.id,
    original_date: date,
    due_date: date,
    recurrence_ends_on: null,
    completed_at: null,
    virtual: true,
    master,
  }
}

// Plain tasks, exceptions and generated occurrences for [from, to] ("yyyy-MM-dd", inclusive)
export function expandTasks(rows: TaskRow[], from: string, to: string): Task[] {
  const out: Task[] = []
  const masters = new Map<string, TaskRow>()
  const exceptions = new Map<string, Map<string, TaskRow>>() // by master id, then by the replaced date
  for (const row of rows) {
    if (row.series_id) {
      const byDate = exceptions.get(row.series_id) ?? new Map<string, TaskRow>()
      byDate.set(row.original_date!, row)
      exceptions.set(row.series_id, byDate)
    } else if (row.recurrence) masters.set(row.id, row)
    else out.push(row)
  }

  for (const [seriesId, byDate] of exceptions) {
    const master = masters.get(seriesId)
    if (!master) continue
    for (const row of byDate.values()) {
      if (!row.cancelled && row.due_date && row.due_date >= from && row.due_date <= to) {
        out.push({ ...row, recurrence: master.recurrence, master })
      }
    }
  }

  const rangeStart = dayStart(from)
  const rangeEnd = addDays(dayStart(to), 1)
  for (const master of masters.values()) {
    const replaced = exceptions.get(master.id)
    const list = expand(
      dayStart(master.due_date!), dayEnd(master.due_date!),
      master.recurrence as unknown as Recurrence, TASK_ZONE, rangeStart, rangeEnd,
    )
    for (const o of list) {
      const date = keyOf(o.start)
      if (!replaced?.has(date)) out.push(occurrenceTask(master, date))
    }
  }
  return out.sort(byDue)
}

// Attach each ordinary task's subtasks
async function withSubtasks(tasks: Task[]): Promise<Task[]> {
  const ids = tasks.filter((t) => !t.virtual && !t.series_id).map((t) => t.id)
  if (ids.length === 0) return tasks
  const { data, error } = await supabase.from('tasks').select('*').in('parent_id', ids).order('created_at')
  if (error) throw error
  const subs = new Map<string, TaskRow[]>()
  for (const s of data) subs.set(s.parent_id!, [...(subs.get(s.parent_id!) ?? []), s])
  return tasks.map((t) => (ids.includes(t.id) ? { ...t, subtasks: subs.get(t.id) ?? [] } : t))
}

// Tasks due from `from` to `to` (both "yyyy-MM-dd", inclusive), repeating ones expanded, in the chosen list(s)
export async function getTasks(from: string, to: string, listFilter: string) {
  const { data, error } = await supabase.rpc('tasks_in_range', { range_start: from, range_end: to })
  if (error) throw error
  return withSubtasks(expandTasks(data, from, to).filter((t) => inList(t, listFilter)))
}

// Tasks that are overdue (due before `today`) or have no due date, and are still to do or were finished at or after
// `doneSince` (so what you just ticked off stays, crossed out, until tomorrow). Repeating tasks are left out.
export async function getBacklogTasks(today: string, listFilter: string, doneSince: string) {
  const { data, error } = await supabase
    .from('tasks').select('*')
    .is('parent_id', null).is('recurrence', null).is('series_id', null)
    .or(`due_date.is.null,due_date.lt.${today}`)
    .or(`completed_at.is.null,completed_at.gte.${doneSince}`)
  if (error) throw error
  return withSubtasks(data.filter((t) => inList(t, listFilter)).sort(byDue))
}

// Tasks (and subtasks) whose title or notes contain `text`, ignoring case. A repeating task is listed once, as its
// next occurrence after `today`. Upcoming and undated first, then past ones, newest first.
export async function searchTasks(text: string, today: string): Promise<Task[]> {
  const q = text.trim()
  if (!q) return []
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%` // match the text literally
  const find = (column: 'title' | 'notes') =>
    supabase.from('tasks').select('*').eq('cancelled', false).ilike(column, pattern).limit(100)
  const [byTitle, byNotes] = await Promise.all([find('title'), find('notes')])
  if (byTitle.error) throw byTitle.error
  if (byNotes.error) throw byNotes.error

  const matched = new Map<string, TaskRow>()
  for (const row of [...byTitle.data, ...byNotes.data]) matched.set(row.id, row)
  // A matching subtask stands for its parent task
  const wanted = new Set<string>() // series with a matching master or exception
  const parents = new Set<string>()
  for (const row of matched.values()) {
    if (row.parent_id) parents.add(row.parent_id)
    else if (row.series_id) wanted.add(row.series_id)
    else if (row.recurrence) wanted.add(row.id)
  }
  const [parentRows, masterRows, exceptionRows] = await Promise.all(
    [
      parents.size ? supabase.from('tasks').select('*').in('id', [...parents]) : null,
      wanted.size ? supabase.from('tasks').select('*').in('id', [...wanted]) : null,
      wanted.size ? supabase.from('tasks').select('*').in('series_id', [...wanted]) : null,
    ].map(async (q) => {
      const res = q ? await q : { data: [] as TaskRow[], error: null }
      if (res.error) throw res.error
      return res.data
    }),
  )
  const masterOf = new Map(masterRows.map((m) => [m.id, m]))
  const replaced = new Map<string, Set<string>>()
  for (const ex of exceptionRows) {
    const dates = replaced.get(ex.series_id!) ?? new Set<string>()
    dates.add(ex.original_date!)
    replaced.set(ex.series_id!, dates)
  }

  const out = new Map<string, Task>()
  for (const row of matched.values()) {
    if (row.parent_id) continue
    if (row.series_id) {
      const master = masterOf.get(row.series_id)
      // An exception that only changed the date or completion still matches because it copies the title
      if (!master || (matched.has(master.id) && row.title === master.title && row.notes === master.notes)) continue
      out.set(row.id, { ...row, recurrence: master.recurrence, master })
    } else if (row.recurrence) {
      const skip = replaced.get(row.id)
      const o = upcomingOccurrence(
        dayStart(row.due_date!), dayEnd(row.due_date!), row.recurrence as unknown as Recurrence,
        TASK_ZONE, dayStart(today), (s) => !!skip?.has(keyOf(s)),
      )
      if (o) out.set(row.id, occurrenceTask(row, keyOf(o.start)))
    } else out.set(row.id, row)
  }
  for (const p of parentRows) if (!p.cancelled) out.set(p.id, p)

  const all = [...out.values()]
  const upcoming = all.filter((t) => !t.due_date || t.due_date >= today).sort(byDue)
  const past = all.filter((t) => t.due_date && t.due_date < today).sort((a, b) => byDue(b, a))
  return [...upcoming, ...past]
}

// ---------- Writing: plain tasks and subtasks ----------

export async function createTask(fields: TaskFields) {
  const { data, error } = await supabase.from('tasks').insert(fields).select('id').single()
  if (error) throw error
  return data.id
}

export async function updateTask(id: string, changes: Partial<TaskFields>) {
  const { error } = await supabase.from('tasks').update(changes).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// A task with subtasks is done exactly when all of its subtasks are: ticking the last one completes the task,
// unticking any of them reopens it.
async function syncParentDone(parentId: string) {
  const { data, error } = await supabase.from('tasks').select('completed_at').eq('parent_id', parentId)
  if (error) throw error
  if (data.length === 0) return
  const query = supabase.from('tasks')
  const result = data.every((s) => s.completed_at !== null)
    ? await query.update({ completed_at: new Date().toISOString() }).eq('id', parentId).is('completed_at', null)
    : await query.update({ completed_at: null }).eq('id', parentId)
  if (result.error) throw result.error
}

// Make the stored subtasks match `next` (new ones have no id; ones left out are deleted)
export async function syncSubtasks(parentId: string, current: TaskRow[], next: { id?: string; title: string }[]) {
  const keep = new Set(next.flatMap((s) => (s.id ? [s.id] : [])))
  const removed = current.filter((s) => !keep.has(s.id)).map((s) => s.id)
  if (removed.length) {
    const { error } = await supabase.from('tasks').delete().in('id', removed)
    if (error) throw error
  }
  const created = next.filter((s) => !s.id).map((s) => ({ title: s.title, parent_id: parentId }))
  if (created.length) {
    const { error } = await supabase.from('tasks').insert(created)
    if (error) throw error
  }
  for (const s of next) {
    const old = current.find((c) => c.id === s.id)
    if (old && old.title !== s.title) await updateTask(old.id, { title: s.title })
  }
  // Adding a subtask to a finished task reopens it; removing the unfinished ones finishes it
  if (removed.length || created.length) await syncParentDone(parentId)
}

// ---------- Writing: completion, and the repeating-task edits ----------

const exceptionOf = (t: Task, fields: TaskFields) => ({
  ...fields, series_id: t.series_id, original_date: t.original_date,
})

// Tick a task or subtask on or off. Doing it to a generated occurrence adds its exception row.
export async function setTaskDone(task: Task | TaskRow, done: boolean) {
  const completed_at = done ? new Date().toISOString() : null
  const t = task as Task
  if (!t.virtual) {
    const { error } = await supabase.from('tasks').update({ completed_at }).eq('id', t.id)
    if (error) throw error
    if (t.parent_id) await syncParentDone(t.parent_id)
    return
  }
  const { error } = await supabase.from('tasks').insert({
    ...exceptionOf(t, { title: t.title, notes: t.notes, due_date: t.due_date, due_time: t.due_time, list_id: t.list_id }),
    completed_at,
  })
  if (error) throw error
}

// A new repeating task: one row with the first due date and the rule
export async function createTaskSeries(fields: TaskFields, rule: Recurrence) {
  const last = rule.never ? undefined : lastOccurrence(dayStart(fields.due_date!), dayEnd(fields.due_date!), rule, TASK_ZONE)
  if (!rule.never && !last) throw new Error('No tasks fall before the end date.')
  const { error } = await supabase.from('tasks').insert({
    ...fields, recurrence: rule as unknown as Json, recurrence_ends_on: last ? keyOf(last.start) : null,
  })
  if (error) throw error
}

// Change just one occurrence (and whether it is done): its first change adds an exception row; after that the row
// is updated
export async function saveOccurrence(task: Task, fields: TaskFields, done = task.completed_at !== null) {
  const completed_at = done ? (task.completed_at ?? new Date().toISOString()) : null
  if (task.virtual) {
    const { error } = await supabase.from('tasks').insert({ ...exceptionOf(task, fields), completed_at })
    if (error) throw error
  } else {
    const { error } = await supabase.from('tasks').update({ ...fields, completed_at }).eq('id', task.id)
    if (error) throw error
  }
}

// Delete just one occurrence: an exception marked cancelled keeps the schedule from generating it again
export async function cancelOccurrence(task: Task) {
  if (!task.virtual) {
    const { error } = await supabase.from('tasks').update({ cancelled: true }).eq('id', task.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('tasks').insert({
    ...exceptionOf(task, { title: task.title, notes: task.notes, due_date: task.due_date, due_time: task.due_time, list_id: task.list_id }),
    cancelled: true,
  })
  if (error) throw error
}

// Change what every occurrence shares (title, notes, list, time)
export async function updateTaskSeries(
  seriesId: string,
  shared: Pick<TaskFields, 'title' | 'notes' | 'due_time' | 'list_id'>,
) {
  const { error } = await supabase.rpc('update_task_series', { p_series: seriesId, p_fields: shared as unknown as Json })
  if (error) throw error
}

// "This and following tasks": the series ends before `splitOn`, and `next` (if any) is a new series from there.
// `before` is null when nothing is left of the old series.
export async function splitTaskSeries(p: {
  seriesId: string
  splitOn: string
  before: { rule: Recurrence; endsOn: string } | null
  next: (TaskFields & { recurrence: Recurrence; recurrence_ends_on: string | null }) | null
}) {
  const { error } = await supabase.rpc('split_task_series', {
    p_series: p.seriesId,
    p_split_on: p.splitOn,
    p_old_rule: (p.before?.rule ?? null) as unknown as Json | null,
    p_old_ends_on: p.before?.endsOn ?? null,
    p_new: (p.next ?? null) as unknown as Json | null,
  })
  if (error) throw error
}

// The whole series: deleting its master removes the exceptions too
export async function deleteTaskSeries(seriesId: string) {
  await deleteTask(seriesId)
}
