import { supabase } from './supabase'
import type { Database } from './database.types'

type Tables = Database['public']['Tables']
export type CalendarEvent = Tables['events']['Row']
export type NewEvent = Tables['events']['Insert']

// Any event that overlaps the range -> so multi-day events show up too.
export async function getEvents(from: Date, to: Date) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at')
  if (error) throw error
  return data
}

export async function createEvent(event: NewEvent) {
  const { data, error } = await supabase.from('events').insert(event).select().single()
  if (error) throw error
  return data
}

export async function updateEvent(id: string, changes: Partial<NewEvent>) {
  const { error } = await supabase.from('events').update(changes).eq('id', id)
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
