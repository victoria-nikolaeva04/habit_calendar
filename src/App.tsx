import { useSession } from './hooks/useSession'
import { SignIn } from './components/SignIn'
import { useState } from 'react'
import { supabase } from './lib/supabase'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { DayView } from './components/DayView'

type View = 'month' | 'week' | 'day'
const VIEWS: View[] = ['month', 'week', 'day']

export default function App() {
  const { session, loading } = useSession()
  const [view, setView] = useState<View>('month')
  if (loading) return null
  if (!session) return <SignIn />
  return (
    <>
      <div className="app-bar">
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        <select aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)}>
          {VIEWS.map((v) => (
            <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>
          ))}
        </select>
      </div>
      {view === 'month' && <MonthView />}
      {view === 'week' && <WeekView />}
      {view === 'day' && <DayView />}
    </>
  )
}
