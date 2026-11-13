import { useSession } from './hooks/useSession'
import { SignIn } from './components/SignIn'
import { supabase } from './lib/supabase'

export default function App() {
  const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <SignIn />
  return (
    <>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      <h2>YOU ARE IN THE APP</h2>
    </>
  )
}