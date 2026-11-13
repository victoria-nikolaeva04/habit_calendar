import { useSession } from './hooks/useSession'
import { SignIn } from './components/SignIn'
import { useEffect, useState } from 'react'
import { getProfile, type Profile as ProfileRow } from './lib/api'
import type { TimeFormat } from './lib/timeFormat'
import { Profile } from './components/Profile'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { DayView } from './components/DayView'

type View = 'month' | 'week' | 'day'
const VIEWS: View[] = ['month', 'week', 'day']

export default function App() {
  const { session, loading } = useSession()
  const [view, setView] = useState<View>('month')
  const [showProfile, setShowProfile] = useState(false)
  const [loaded, setProfile] = useState<ProfileRow | null>(null)
  const userId = session?.user.id
  const profile = loaded?.id === userId ? loaded : null // ignore a previous user's profile
  const weekStartsOn = (profile?.week_start_on ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  const timeFormat: TimeFormat = profile?.time_format === '24h' ? '24h' : '12h'

  // Load once at sign-in; the profile page then opens instantly from this copy
  useEffect(() => {
    if (!userId) return
    getProfile(userId).then(setProfile).catch(() => {})
  }, [userId])
  if (loading) return null
  if (!session) return <SignIn />
  if (showProfile && profile) {
    return <Profile session={session} profile={profile} onSaved={setProfile} onBack={() => setShowProfile(false)} />
  }
  return (
    <>
      <div className="app-bar">
        <select aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)}>
          {VIEWS.map((v) => (
            <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>
          ))}
        </select>
        <button className="profile-btn" disabled={!profile} onClick={() => setShowProfile(true)}>Profile</button>
      </div>
      {view === 'month' && <MonthView key={weekStartsOn} weekStartsOn={weekStartsOn} timeFormat={timeFormat} />}
      {view === 'week' && <WeekView key={weekStartsOn} weekStartsOn={weekStartsOn} timeFormat={timeFormat} />}
      {view === 'day' && <DayView timeFormat={timeFormat} />}
    </>
  )
}
