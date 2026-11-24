import { useEffect, useState, type FormEvent } from 'react'
import { getCountries, type Country } from '../lib/holidays'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { browserTimeZone } from '../lib/tz'
import { deleteAccount, updateProfile, type Profile as ProfileRow } from '../lib/api'
import { PALETTES, getPalette, setPalette } from '../lib/palettes'

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
  const [palette, setPaletteState] = useState(getPalette)
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(profile.time_format === '24h' ? '24h' : '12h')
  const [holidayCountry, setHolidayCountry] = useState(profile.holiday_country ?? '')
  const [countries, setCountries] = useState<Country[]>([])
  const [countriesFailed, setCountriesFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    getCountries().then(setCountries).catch(() => setCountriesFailed(true))
  }, [])

  // Keep the saved country selectable even before (or without) the list loading
  const countryOptions = countries.some((c) => c.countryCode === holidayCountry) || !holidayCountry
    ? countries
    : [{ countryCode: holidayCountry, name: holidayCountry }, ...countries]

  const dirty =
    holidayCountry !== (profile.holiday_country ?? '') ||
    displayName.trim() !== (profile.display_name ?? '') ||
    timezone !== profile.timezone ||
    weekStart !== profile.week_start_on ||
    timeFormat !== (profile.time_format === '24h' ? '24h' : '12h')

  function handleBack() {
    if (dirty && !confirm('You have unsaved changes. Discard them?')) return
    onBack()
  }

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
        holiday_country: holidayCountry || null,
      })
      onSaved(updated)
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete your account? This permanently removes your profile and all your events.')) return
    setDeleteError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setDeleteError((err as Error).message)
    }
  }

  const name = displayName.trim() || session.user.email || ''
  const initials = (name.match(/\b\w/g) ?? ['?']).slice(0, 2).join('').toUpperCase()
  const touch = () => setSaved(false)

  return (
    <div className="profile">
      <button type="button" className="back-link" onClick={handleBack}>← Back to calendar</button>
      <h2>Settings</h2>
      <p className="subtitle">Manage your profile and how your calendar looks.</p>
      <form onSubmit={handleSave}>
        <section className="card">
          <div className="identity">
            <span className="avatar" aria-hidden="true">{initials}</span>
            <div>
              <div className="identity-name">{name}</div>
              <div className="identity-email">{session.user.email}</div>
            </div>
          </div>
          <label className="row">
            <div className="row-text"><span className="row-label">Display name</span>
              <span className="row-hint">Shown on shared habits and invites.</span></div>
            <input value={displayName} placeholder="Your name"
              onChange={(e) => { setDisplayName(e.target.value); touch() }} />
          </label>
          <label className="row">
            <div className="row-text"><span className="row-label">Email</span>
              <span className="row-hint">Sign-in links are sent here.</span></div>
            <input value={session.user.email ?? ''} disabled />
          </label>
        </section>

        <section className="card">
          <h3>Preferences</h3>
          <label className="row">
            <div className="row-text"><span className="row-label">Time zone</span>
              <span className="row-hint">Used for event times and reminders.</span>
              {timezone !== browserTimeZone() && (
                <button type="button" className="link-btn"
                  onClick={(e) => { e.preventDefault(); setTimezone(browserTimeZone()); touch() }}>
                  Use this device's ({browserTimeZone()})
                </button>
              )}
            </div>
            <select value={timezone} onChange={(e) => { setTimezone(e.target.value); touch() }}>
              {timezones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <label className="row">
            <div className="row-text"><span className="row-label">Week starts on</span>
              <span className="row-hint">First column in week and month views.</span></div>
            <select value={weekStart} onChange={(e) => { setWeekStart(Number(e.target.value)); touch() }}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <div className="row">
            <div className="row-text"><span className="row-label">Time format</span>
              <span className="row-hint">How times appear across the app.</span></div>
            <div className="segmented" role="radiogroup" aria-label="Time format">
              {([['12h', '12-hour · 9:30 AM'], ['24h', '24-hour · 09:30']] as const).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={timeFormat === v}
                  className={timeFormat === v ? 'selected' : ''}
                  onClick={() => { setTimeFormat(v); touch() }}>{label}</button>
              ))}
            </div>
          </div>
          <label className="row">
            <div className="row-text"><span className="row-label">Event colors</span>
              <span className="row-hint">The swatches offered when you add or edit an event. Saved on this device.</span>
              <div className="palette-preview" aria-hidden="true">
                {palette.colors.map((c) => <span key={c} style={{ background: c }} />)}
              </div>
            </div>
            <select value={palette.id} onChange={(e) => { setPalette(e.target.value); setPaletteState(getPalette()) }}>
              {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="row">
            <div className="row-text"><span className="row-label">Public holidays</span>
              <span className="row-hint">Shown as all-day items on your calendar.</span>
              {countriesFailed && <small className="hint">Couldn't load the country list. Try again later.</small>}
            </div>
            <select value={holidayCountry} onChange={(e) => { setHolidayCountry(e.target.value); touch() }}>
              <option value="">Don't show holidays</option>
              {countryOptions.map((c) => <option key={c.countryCode} value={c.countryCode}>{c.name}</option>)}
            </select>
          </label>
          {error && <p role="alert" className="form-error">{error}</p>}
          <div className="form-actions">
            {saved && <span role="status" className="form-success">Saved</span>}
            <button type="submit" className="primary" disabled={!dirty}>Save changes</button>
          </div>
        </section>
      </form>

      <section className="card account-actions">
        <h3>Account</h3>
        <div className="row">
          <div className="row-text"><span className="row-label">Sign out</span>
            <span className="row-hint">End your session on this device.</span></div>
          <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
        <div className="row">
          <div className="row-text"><span className="row-label danger-label">Delete account</span>
            <span className="row-hint">Permanently removes your events, tasks and settings.</span></div>
          <button type="button" className="danger" onClick={handleDelete}>Delete</button>
        </div>
        {deleteError && <p role="alert" className="form-error">{deleteError}</p>}
      </section>
    </div>
  )
}
