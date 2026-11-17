import { useSession } from './hooks/useSession'
import { SignIn } from './components/SignIn'
import { useCallback, useEffect, useState } from 'react'
import { extendOpenSeries, getProfile, type Profile as ProfileRow } from './lib/api'
import type { TimeFormat } from './lib/timeFormat'
import { resolveTimeZone } from './lib/tz'
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
  const [profileError, setProfileError] = useState<string | null>(null)
  const userId = session?.user.id
  const profile = loaded?.id === userId ? loaded : null // ignore a previous user's profile
  const weekStartsOn = (profile?.week_start_on ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  const timeFormat: TimeFormat = profile?.time_format === '24h' ? '24h' : '12h'
  const timeZone = resolveTimeZone(profile?.timezone)

  const loadProfile = useCallback((id: string) => {
    getProfile(id)
      .then((p) => { setProfile(p); setProfileError(null) })
      .catch((e: Error) => setProfileError(e.message))
  }, [])

  // Load once at sign-in; the profile page then opens instantly from this copy
  useEffect(() => {
    if (userId) loadProfile(userId)
  }, [userId, loadProfile])

  // Keep "never ends" repeating events filled a year ahead
  const profileReady = !!profile
  useEffect(() => {
    if (userId && profileReady) extendOpenSeries(timeZone).catch((e) => console.error('Could not extend repeating events:', e))
  }, [userId, profileReady, timeZone])

  if (loading) return <p className="loading">Loading…</p>
  if (!session) return <SignIn />
  return (
    <>
      {showProfile && profile && (
        <Profile session={session} profile={profile} onSaved={setProfile} onBack={() => setShowProfile(false)} />
      )}
      {/* Kept mounted (just hidden) while the profile is open, so the date you were looking at isn't lost */}
      <div className="calendar-pane" hidden={showProfile && !!profile}>
        <div className="app-bar">
          <select aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)}>
            {VIEWS.map((v) => (
              <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
          <button className="profile-btn" disabled={!profile}
            title={profile ? undefined : 'Loading your profile…'}
            onClick={() => setShowProfile(true)}>Profile</button>
        </div>
        {profileError && !profile && (
          <p role="alert" className="profile-error">
            Couldn't load your profile settings ({profileError}).{' '}
            <button type="button" onClick={() => { setProfileError(null); loadProfile(session.user.id) }}>Retry</button>
          </p>
        )}
        {/* key: switching time zone restarts the view at "today" in the new zone */}
        {view === 'month' && <MonthView key={timeZone} weekStartsOn={weekStartsOn} timeFormat={timeFormat} timeZone={timeZone} />}
        {view === 'week' && <WeekView key={timeZone} weekStartsOn={weekStartsOn} timeFormat={timeFormat} timeZone={timeZone} />}
        {view === 'day' && <DayView key={timeZone} timeFormat={timeFormat} timeZone={timeZone} />}
      </div>
    </>
  )
}
