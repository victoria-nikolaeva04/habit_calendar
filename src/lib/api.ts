import { supabase } from './supabase'
import type { Database } from './database.types'
import { inTz, toUtcIso } from './tz'
import { horizonDate, occurrences, type Recurrence } from './recurrence'

type Tables = Database['public']['Tables']
export type CalendarEvent = Tables['events']['Row']
export type NewEvent = Tables['events']['Insert']

// Any event that overlaps the range -> so multi-day events show up too.
export async function getEvents(from: Date, to: Date) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .lt('starts_at', toUtcIso(to))
    .gt('ends_at', toUtcIso(from))
    .order('starts_at')
  if (error) throw error
  return data
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

export async function updateEvent(id: string, changes: Partial<NewEvent>) {
  const { error } = await supabase.from('events').update(changes).eq('id', id)
  if (error) throw error
}

// "Never ends" series are stored a year ahead: add what's missing between their last event and
// a year from now. Returns how many events were added.
export async function extendOpenSeries(timeZone: string) {
  const { data, error } = await supabase.rpc('open_series_tails')
  if (error) throw error
  const horizon = horizonDate(timeZone)
  const rows: NewEvent[] = []
  for (const last of data) {
    const rule = last.recurrence as Recurrence | null
    if (!rule?.anchor || !last.series_id) continue
    const list = occurrences(
      inTz(rule.anchor.start, timeZone), inTz(rule.anchor.end, timeZone),
      { ...rule, until: horizon }, timeZone, new Date(last.starts_at),
    )
    for (const o of list ?? []) {
      rows.push({
        title: last.title, notes: last.notes, color: last.color, all_day: last.all_day,
        series_id: last.series_id, recurrence: last.recurrence,
        starts_at: toUtcIso(o.start), ends_at: toUtcIso(o.end),
      })
    }
  }
  if (rows.length) await createEvents(rows)
  return rows.length
}

// Every event of a series (series_id is shared by all its occurrences)
export async function updateSeries(seriesId: string, changes: Partial<NewEvent>) {
  const { error } = await supabase.from('events').update(changes).eq('series_id', seriesId)
  if (error) throw error
}

export async function deleteSeries(seriesId: string) {
  const { error } = await supabase.from('events').delete().eq('series_id', seriesId)
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
