import { useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { deleteAccount, updateProfile, type Profile as ProfileRow } from '../lib/api'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Props = {
  session: Session
  profile: ProfileRow
  onSaved: (p: ProfileRow) => void
  onBack: () => void
}

export function Profile({ session, profile, onSaved, onBack }: Props) {
  const userId = session.user.id
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [timezone, setTimezone] = useState(profile.timezone)
  const [weekStart, setWeekStart] = useState(profile.week_start_on)
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(profile.time_format === '24h' ? '24h' : '12h')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const timezones = Intl.supportedValuesOf('timeZone')
  if (!timezones.includes('UTC')) timezones.unshift('UTC')
  if (!timezones.includes(timezone)) timezones.unshift(timezone)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile(userId, {
        display_name: displayName.trim() || null,
        timezone,
        week_start_on: weekStart,
        time_format: timeFormat,
      })
      onSaved(updated)
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete your account? This permanently removes your profile and all your events.')) return
    try {
      await deleteAccount()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="profile">
      <button type="button" onClick={onBack}>← Back to calendar</button>
      <h2>Profile</h2>
      {(
        <form onSubmit={handleSave}>
          <label className="field">
            <span>Email</span>
            <input value={session.user.email ?? ''} disabled />
          </label>
          <label className="field">
            <span>Display name</span>
            <input value={displayName} placeholder="Your name"
              onChange={(e) => { setDisplayName(e.target.value); setSaved(false) }} />
          </label>
          <label className="field">
            <span>Time zone</span>
            <select value={timezone} onChange={(e) => { setTimezone(e.target.value); setSaved(false) }}>
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Week starts on</span>
            <select value={weekStart} onChange={(e) => { setWeekStart(Number(e.target.value)); setSaved(false) }}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Time format</span>
            <select value={timeFormat} onChange={(e) => { setTimeFormat(e.target.value as '12h' | '24h'); setSaved(false) }}>
              <option value="12h">12-hour (9:30 AM)</option>
              <option value="24h">24-hour / military (09:30)</option>
            </select>
          </label>
          {error && <p role="alert" className="form-error">{error}</p>}
          {saved && <p role="status" className="form-success">Saved</p>}
          <div className="form-actions">
            <button type="submit" className="primary">Save changes</button>
          </div>
        </form>
      )}
      <section className="account-actions">
        <h3>Account</h3>
        <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        <button type="button" className="danger" onClick={handleDelete}>Delete account</button>
      </section>
    </div>
  )
}
