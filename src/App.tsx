//import { useSession } from './hooks/useSession'
//import { SignIn } from './components/SignIn'
import { useState } from 'react'
import { supabase } from './lib/supabase'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { DayView } from './components/DayView'

type View = 'month' | 'week' | 'day'
const VIEWS: View[] = ['month', 'week', 'day']

export default function App() {
  /*const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <SignIn />*/
  const [view, setView] = useState<View>('month')
  return (
    <>
      <div>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        {VIEWS.map((v) => (
          <button key={v} disabled={view === v} onClick={() => setView(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      {view === 'month' && <MonthView />}
      {view === 'week' && <WeekView />}
      {view === 'day' && <DayView />}
    </>
  )
}
