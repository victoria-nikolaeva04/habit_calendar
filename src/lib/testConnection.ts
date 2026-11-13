import { supabase } from './supabase'

// Temporary check: confirms the URL and key are valid and the project is reachable.
// Doesn't need any tables. Remove once real queries exist.
export async function testSupabaseConnection() {
  const { error: authError } = await supabase.auth.getSession()
  if (authError) {
    console.error('❌ Supabase auth check failed:', authError.message)
    return false
  }

  // Hits the REST API; a bogus table returns a "table not found" error
  // (PGRST205/404), which still proves the URL and key work.
  // A 401/invalid API key error would mean the key is wrong.
  const { error } = await supabase.from('_connection_test').select('*').limit(1)
  if (error && /api key|jwt|unauthorized/i.test(error.message)) {
    console.error('❌ Supabase rejected the key:', error.message)
    return false
  }

  console.log('✅ Supabase connected', error ? `(REST reachable: ${error.code})` : '')
  return true
}
