import { supabase } from './supabase'
import type { Database, Json } from './database.types'
import { toUtcIso, inTz } from './tz'
import { expand, upcomingOccurrence, type Occurrence, type Recurrence } from './recurrence'

type Tables = Database['public']['Tables']
type EventRow = Tables['events']['Row']
export type NewEvent = Tables['events']['Insert']

// What the calendar draws. A repeating event is not stored per occurrence: each occurrence is generated
// from its series' master row (`virtual`, with a made-up id) or, if that single occurrence was changed,
// comes from its exception row. Either way `series_id` is the master's id, `original_start` is the
// start the occurrence had in the schedule, and `master` is the series' row.
export type CalendarEvent = EventRow & { master?: EventRow; virtual?: boolean }

// Fields of a single event, and the ones every event of a series shares
export type EventFields = Pick<NewEvent, 'title' | 'notes' | 'color' | 'all_day'> & { starts_at: string; ends_at: string }
type Shared = Pick<EventFields, 'title' | 'notes' | 'color' | 'all_day'>

// One generated occurrence of a series, shaped like an event (no row of its own)
function occurrenceEvent(master: EventRow, o: Occurrence): CalendarEvent {
  const originalStart = toUtcIso(o.start)
  return {
    ...master,
    id: `${master.id}@${originalStart}`,
    series_id: master.id,
    original_start: originalStart,
    starts_at: originalStart,
    ends_at: toUtcIso(o.end),
    recurrence_ends_at: null,
    virtual: true,
    master,
  }
}

// Every event that overlaps the range -> so multi-day events show up too. Repeating events are expanded here.
export async function getEvents(from: Date, to: Date, timeZone: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase.rpc('events_in_range', {
    range_start: toUtcIso(from), range_end: toUtcIso(to),
  })
  if (error) throw error

  const out: CalendarEvent[] = []
  const masters = new Map<string, EventRow>()
  const exceptions = new Map<string, Map<number, EventRow>>() // by master id, then by the replaced start
  for (const row of data) {
    if (row.series_id) {
      const byStart = exceptions.get(row.series_id) ?? new Map<number, EventRow>()
      byStart.set(new Date(row.original_start!).getTime(), row)
      exceptions.set(row.series_id, byStart)
    } else if (row.recurrence) masters.set(row.id, row)
    else out.push(row)
  }
  const overlaps = (starts: string, ends: string) => new Date(starts) < to && new Date(ends) > from

  for (const [seriesId, byStart] of exceptions) {
    const master = masters.get(seriesId)
    if (!master) continue
    for (const row of byStart.values()) {
      if (!row.cancelled && overlaps(row.starts_at, row.ends_at)) {
        out.push({ ...row, recurrence: master.recurrence, master })
      }
    }
  }

  for (const master of masters.values()) {
    const replaced = exceptions.get(master.id)
    const list = expand(
      inTz(master.starts_at, timeZone), inTz(master.ends_at, timeZone),
      master.recurrence as unknown as Recurrence, timeZone, from, to,
    )
    for (const o of list) {
      if (replaced?.has(o.start.getTime())) continue
      out.push(occurrenceEvent(master, o))
    }
  }
  return out.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
}

// Events whose title or notes contain `text` (ignoring case). A repeating event is listed once, as its next
// occurrence. Upcoming events come first, then past ones, newest first.
export async function searchEvents(text: string, timeZone: string): Promise<CalendarEvent[]> {
  const q = text.trim()
  if (!q) return []
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%` // match the text literally
  const find = (column: 'title' | 'notes') =>
    supabase.from('events').select('*').eq('cancelled', false).ilike(column, pattern).limit(100)
  const [byTitle, byNotes] = await Promise.all([find('title'), find('notes')])
  if (byTitle.error) throw byTitle.error
  if (byNotes.error) throw byNotes.error

  const matched = new Map<string, EventRow>()
  for (const row of [...byTitle.data, ...byNotes.data]) matched.set(row.id, row)
  const masters = new Map<string, EventRow>()
  const wanted = new Set<string>() // series that have a matching master or exception
  for (const row of matched.values()) {
    if (row.series_id) wanted.add(row.series_id)
    else if (row.recurrence) { masters.set(row.id, row); wanted.add(row.id) }
  }

  // The masters of matching exceptions, and every exception of those series (to skip replaced occurrences)
  const ids = [...wanted]
  const [fetchedMasters, fetchedExceptions] = ids.length
    ? await Promise.all([
        supabase.from('events').select('*').in('id', ids),
        supabase.from('events').select('*').in('series_id', ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (fetchedMasters.error) throw fetchedMasters.error
  if (fetchedExceptions.error) throw fetchedExceptions.error
  const masterOf = new Map(fetchedMasters.data.map((m) => [m.id, m]))
  const replaced = new Map<string, Set<number>>()
  for (const ex of fetchedExceptions.data) {
    const set = replaced.get(ex.series_id!) ?? new Set<number>()
    set.add(new Date(ex.original_start!).getTime())
    replaced.set(ex.series_id!, set)
  }

  const out: CalendarEvent[] = []
  const now = new Date()
  for (const row of matched.values()) {
    if (row.series_id) {
      const master = masterOf.get(row.series_id)
      if (!master) continue
      // An exception that only changed the time still matches because it copies the title: list the series once
      if (masters.has(master.id) && row.title === master.title && row.notes === master.notes) continue
      out.push({ ...row, recurrence: master.recurrence, master })
    } else if (row.recurrence) {
      const skip = replaced.get(row.id)
      const o = upcomingOccurrence(
        inTz(row.starts_at, timeZone), inTz(row.ends_at, timeZone),
        row.recurrence as unknown as Recurrence, timeZone, now, (s) => !!skip?.has(s.getTime()),
      )
      if (o) out.push(occurrenceEvent(row, o))
    } else out.push(row)
  }

  const t = (e: CalendarEvent) => new Date(e.starts_at).getTime()
  const upcoming = out.filter((e) => new Date(e.ends_at) >= now).sort((a, b) => t(a) - t(b))
  const past = out.filter((e) => new Date(e.ends_at) < now).sort((a, b) => t(b) - t(a))
  return [...upcoming, ...past]
}

export async function createEvent(event: NewEvent) {
  const { data, error } = await supabase.from('events').insert(event).select().single()
  if (error) throw error
  return data
}

export async function createEvents(events: NewEvent[]) {
  const { error } = await supabase.from('events').insert(events)
  if (error) throw error
}

// A repeating event is one row holding the first start/end and the rule. `endsAt` is when its last
// occurrence ends (null if it never ends).
export async function createSeries(fields: EventFields, rule: Recurrence, endsAt: string | null) {
  await createEvent({ ...fields, recurrence: rule as unknown as Json, recurrence_ends_at: endsAt })
}

export async function updateEvent(id: string, changes: Partial<NewEvent>) {
  const { error } = await supabase.from('events').update(changes).eq('id', id)
  if (error) throw error
}

// Change just one occurrence of a series: its first change adds an exception row; after that the row is updated
export async function saveOccurrence(event: CalendarEvent, fields: EventFields) {
  if (!event.virtual) return updateEvent(event.id, fields)
  await createEvent({ ...fields, series_id: event.series_id, original_start: event.original_start })
}

// Delete just one occurrence of a series: an exception marked cancelled keeps the schedule from generating it again
export async function cancelOccurrence(event: CalendarEvent) {
  if (!event.virtual) return updateEvent(event.id, { cancelled: true })
  await createEvent({
    title: event.title, notes: event.notes, color: event.color, all_day: event.all_day,
    starts_at: event.starts_at, ends_at: event.ends_at,
    series_id: event.series_id, original_start: event.original_start, cancelled: true,
  })
}

// Change every event of a series. `schedule` is the master's new first start/end and where the series ends.
// When the schedule changed, single-event changes no longer line up with it and are dropped.
export async function updateSeries(
  seriesId: string,
  fields: EventFields & { recurrence_ends_at: string | null },
  resetExceptions: boolean,
) {
  if (resetExceptions) {
    const { error } = await supabase.from('events').delete().eq('series_id', seriesId)
    if (error) throw error
  }
  const { error } = await supabase.from('events').update(fields).eq('id', seriesId)
  if (error) throw error
  if (!resetExceptions) {
    const shared: Shared = { title: fields.title, notes: fields.notes, color: fields.color, all_day: fields.all_day }
    const { error: exError } = await supabase.from('events').update(shared).eq('series_id', seriesId)
    if (exError) throw exError
  }
}

// "This and following events": the series ends before `splitAt`, and `next` (if any) is a new series from
// there. `before` is null when nothing is left of the old series.
export async function splitSeries(p: {
  seriesId: string
  splitAt: string
  before: { rule: Recurrence; endsAt: string } | null
  next: (EventFields & { recurrence: Recurrence; recurrence_ends_at: string | null }) | null
  dropExceptions: boolean
}) {
  const { error } = await supabase.rpc('split_series', {
    p_series: p.seriesId,
    p_split_at: p.splitAt,
    p_old_rule: (p.before?.rule ?? null) as unknown as Json | null,
    p_old_ends_at: p.before?.endsAt ?? null,
    p_new: (p.next ?? null) as unknown as Json | null,
    p_drop_exceptions: p.dropExceptions,
  })
  if (error) throw error
}

// The whole series: deleting its master removes the exceptions too
export async function deleteSeries(seriesId: string) {
  const { error } = await supabase.from('events').delete().eq('id', seriesId)
  if (error) throw error
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

export type Profile = Tables['profiles']['Row']
export type ProfileChanges = Tables['profiles']['Update']

export async function getProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  // Users created before the signup trigger existed have no row yet -> create it
  if (data) return data
  const { data: created, error: insertError } = await supabase
    .from('profiles').insert({ id: userId }).select().single()
  if (insertError) throw insertError
  return created
}

export async function updateProfile(userId: string, changes: ProfileChanges) {
  const { data, error } = await supabase
    .from('profiles').update(changes).eq('id', userId).select().single()
  if (error) throw error
  return data
}

export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_own_account')
  if (error) throw error
  await supabase.auth.signOut()
}
