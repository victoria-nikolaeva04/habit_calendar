import { useSession } from './hooks/useSession'
import { SignIn } from './components/SignIn'
import { useCallback, useEffect, useState } from 'react'
import { getProfile, type Profile as ProfileRow } from './lib/api'
import type { TimeFormat } from './lib/timeFormat'
import { format, startOfDay } from 'date-fns'
import { nowIn, resolveTimeZone, wallTime } from './lib/tz'
import { Profile } from './components/Profile'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { DayView } from './components/DayView'
import { SearchBox } from './components/SearchBox'
import { SidePanel } from './components/SidePanel'
import { useTaskLists } from './hooks/useTaskLists'
import { ALL_LISTS } from './lib/tasks'
import { useUndoStack } from './hooks/useUndoStack'

type View = 'month' | 'week' | 'day'
const VIEWS: View[] = ['month', 'week', 'day']

export default function App() {
  const { session, loading } = useSession()
  const [view, setView] = useState<View>('month')
  const [showProfile, setShowProfile] = useState(false)
  const [jump, setJump] = useState<{ date: Date } | null>(null) // asks the views to show a date
  const [selectedKey, setSelectedKey] = useState<string | null>(null) // "yyyy-MM-dd" shown in the side panel; null = today
  const [listFilter, setListFilter] = useState(ALL_LISTS) // which task list(s) to show
  const [version, setVersion] = useState(0) // bumped when events change, so every list reloads
  const [loaded, setProfile] = useState<ProfileRow | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const userId = session?.user.id
  const profile = loaded?.id === userId ? loaded : null // ignore a previous user's profile
  const weekStartsOn = (profile?.week_start_on ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  const timeFormat: TimeFormat = profile?.time_format === '24h' ? '24h' : '12h'
  const timeZone = resolveTimeZone(profile?.timezone)
  const holidayCountry = profile?.holiday_country ?? null

  const loadProfile = useCallback((id: string) => {
    getProfile(id)
      .then((p) => { setProfile(p); setProfileError(null) })
      .catch((e: Error) => setProfileError(e.message))
  }, [])

  // Load once at sign-in; the profile page then opens instantly from this copy
  useEffect(() => {
    if (userId) loadProfile(userId)
  }, [userId, loadProfile])

  const selected = selectedKey ? wallTime(selectedKey, timeZone) : startOfDay(nowIn(timeZone))
  const select = useCallback((day: Date) => setSelectedKey(format(day, 'yyyy-MM-dd')), [])
  // Select a day and make the calendar show it
  const goTo = (day: Date) => { select(day); setJump({ date: day }) }
  const { lists, reload: reloadLists } = useTaskLists(userId)
  // A filter naming a list that is gone (or belongs to another user) falls back to all lists
  const filter = listFilter === ALL_LISTS || listFilter === 'default' || lists.some((l) => l.id === listFilter) ? listFilter : ALL_LISTS
  const changed = useCallback(() => setVersion((n) => n + 1), [])
  const history = useUndoStack(changed)
  // Undo history belongs to one user: forget it on sign-out or when another user signs in
  const [historyUser, setHistoryUser] = useState(userId)
  if (userId !== historyUser) { setHistoryUser(userId); history.clear() }

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
          <SearchBox timeZone={timeZone} timeFormat={timeFormat} onPick={goTo} lists={lists} onChanged={changed} />
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
        <div className="calendar-layout">
          <div className="calendar-main">
            {/* key: switching time zone restarts the view at "today" in the new zone */}
            {view === 'month' && <MonthView key={timeZone} weekStartsOn={weekStartsOn} timeFormat={timeFormat} timeZone={timeZone} holidayCountry={holidayCountry} jump={jump} selected={selected} version={version} onSelectDay={select} onChanged={changed} lists={lists} listFilter={filter} history={history} />}
            {view === 'week' && <WeekView key={timeZone} weekStartsOn={weekStartsOn} timeFormat={timeFormat} timeZone={timeZone} holidayCountry={holidayCountry} jump={jump} selected={selected} version={version} onSelectDay={select} onChanged={changed} lists={lists} listFilter={filter} history={history} />}
            {view === 'day' && <DayView key={timeZone} timeFormat={timeFormat} timeZone={timeZone} holidayCountry={holidayCountry} jump={jump} selected={selected} version={version} onSelectDay={select} onChanged={changed} lists={lists} listFilter={filter} history={history} />}
          </div>
          <SidePanel day={selected} timeZone={timeZone} timeFormat={timeFormat} holidayCountry={holidayCountry}
            version={version} onGoTo={goTo} onChanged={changed}
            lists={lists} listFilter={filter} onListFilter={setListFilter} onListsChanged={reloadLists} />
        </div>
      </div>
      {(history.notice || history.error) && (
        <div className="undo-toast" role="status">
          <span>{history.error ?? history.notice?.label}</span>
          {!history.error && <button type="button" disabled={!history.canUndo} onClick={() => void history.undo()}>Undo</button>}
          <button type="button" className="undo-dismiss" aria-label="Dismiss" onClick={history.dismiss}>×</button>
        </div>
      )}
    </>
  )
}
