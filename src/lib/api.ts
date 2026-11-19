import { supabase } from './supabase'
import type { Database, Json } from './database.types'
import { toUtcIso, inTz } from './tz'
import { expand, type Recurrence } from './recurrence'

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
      const originalStart = toUtcIso(o.start)
      out.push({
        ...master,
        id: `${master.id}@${originalStart}`,
        series_id: master.id,
        original_start: originalStart,
        starts_at: originalStart,
        ends_at: toUtcIso(o.end),
        recurrence_ends_at: null,
        virtual: true,
        master,
      })
    }
  }
  return out.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
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
