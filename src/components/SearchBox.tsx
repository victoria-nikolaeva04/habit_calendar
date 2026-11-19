import { useEffect, useRef, useState } from 'react'
import { format, startOfDay } from 'date-fns'
import { searchEvents, type CalendarEvent } from '../lib/api'
import { formatTime, type TimeFormat } from '../lib/timeFormat'
import { inTz } from '../lib/tz'
import { RepeatMark } from './RepeatMark'

const MAX_SHOWN = 30

type Props = {
  timeZone: string
  timeFormat: TimeFormat
  onPick: (day: Date) => void  // a result was clicked: show this day (start of day in the profile time zone)
}

// Search box for the app bar: type to list matching events, click one to jump to its date
export function SearchBox({ timeZone, timeFormat, onPick }: Props) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const query = text.trim()

  // Search shortly after typing stops; an older answer arriving late is ignored
  useEffect(() => {
    if (!query) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      searchEvents(query, timeZone)
        .then((list) => { if (!cancelled) { setResults(list); setError(null) } })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, timeZone])

  // Click outside closes the list
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const when = (e: CalendarEvent) => {
    const start = inTz(e.starts_at, timeZone)
    const day = format(start, 'EEE, MMM d, yyyy')
    return e.all_day ? day : `${day} · ${formatTime(start, timeFormat)}`
  }

  const showList = open && !!query
  return (
    <div className="search" ref={boxRef}>
      <input
        type="search"
        aria-label="Search events"
        placeholder="Search events"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur() } }}
      />
      {showList && (
        <div className="search-results" role="region" aria-label="Search results">
          {error ? (
            <p role="alert" className="search-note">{error}</p>
          ) : loading && results.length === 0 ? (
            <p className="search-note">Searching…</p>
          ) : results.length === 0 ? (
            <p className="search-note">No events found</p>
          ) : (
            <ul>
              {results.slice(0, MAX_SHOWN).map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => { onPick(startOfDay(inTz(e.starts_at, timeZone))); setOpen(false) }}>
                    <span className="search-dot" style={{ background: e.color ?? 'var(--accent)' }} aria-hidden="true" />
                    <span className="search-text">
                      <strong>{e.title}{e.series_id && <RepeatMark />}</strong>
                      <small>{when(e)}</small>
                    </span>
                  </button>
                </li>
              ))}
              {results.length > MAX_SHOWN && <li className="search-note">Showing the first {MAX_SHOWN} results</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
