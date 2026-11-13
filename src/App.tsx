//import { useSession } from './hooks/useSession'
//import { SignIn } from './components/SignIn'
import { useState } from 'react'
import { supabase } from './lib/supabase'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'

export default function App() {
  /*const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <SignIn />*/
  const [view, setView] = useState<'month' | 'week'>('month')
  return (
    <>
      <div>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        <button onClick={() => setView(view === 'month' ? 'week' : 'month')}>
          {view === 'month' ? 'Week view' : 'Month view'}
        </button>
      </div>
      {view === 'month' ? <MonthView /> : <WeekView />}
    </>
  )
}
