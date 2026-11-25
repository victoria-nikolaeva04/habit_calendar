import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { supabase } from '../lib/supabase'

// The hero shows the current month with a few sample events (day of month -> events)
const SAMPLE: Record<number, [string, string][]> = {
  3: [['Standup', '#34d399']],
  5: [['Dentist', '#ffa95c']],
  10: [['Plan the week', '#4d8bff']],
  12: [['Book club', '#38bdf8']],
  17: [['Standup', '#34d399'], ['Review', '#4d8bff']],
  19: [['Team lunch', '#ffa95c']],
  24: [['Send invoices', '#a78bfa']],
  26: [['Gym', '#34d399']],
}

export function SignIn() {
  const month = startOfMonth(new Date())
  const days = eachDayOfInterval({ start: startOfWeek(month), end: endOfWeek(endOfMonth(month)) })
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    if (error) {
      setError(error.message)
      setStatus('idle')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="landing">

      <main>
        <section className="lp-hero">
          <div className="lp-copy">
            <h1>A calendar a day keeps <span className="lp-strike">procrastination</span> away.</h1>
            <p className="lp-lede">Put it on the calendar and it gets done.</p>

            <div id="get-started" className="lp-form">
              {status === 'sent' ? (
                <div role="status" className="lp-sent">
                  <p>Check <strong>{email}</strong> for your sign-in link.</p>
                  <button type="button" onClick={() => setStatus('idle')}>Use a different email</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <label className="sr-only" htmlFor="lp-email">Email</label>
                  <input id="lp-email" type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  <button type="submit" className="primary" disabled={status === 'sending'}>
                    {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
                  </button>
                </form>
              )}
              {error && <p role="alert" className="lp-error">{error}</p>}
              <p className="lp-note">No password. The link expires after a while; check spam if it doesn't arrive.</p>
            </div>
          </div>

          <div className="lp-stage" aria-hidden="true">
            <div className="lp-badge"><Check size={14} /> 3 done today</div>
            <div className="lp-preview">
              <div className="lp-preview-head">{format(month, 'MMMM')} <span>{format(month, 'yyyy')}</span></div>
              <div className="lp-preview-grid">
                {days.slice(0, 7).map((d) => <div key={d.getDay()} className="lp-preview-wd">{format(d, 'EEE')}</div>)}
                {days.map((d) => {
                  const inMonth = d.getMonth() === month.getMonth()
                  return (
                    <div key={d.toISOString()} className={`lp-preview-day${inMonth ? '' : ' out'}${isToday(d) ? ' today' : ''}`}>
                      <span>{d.getDate()}</span>
                      {inMonth && (SAMPLE[d.getDate()] ?? []).map(([title, color]) => (
                        <div key={title} className="lp-preview-event" style={{ '--ev': color } as React.CSSProperties}>{title}</div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </main>

    </div>
  )
}
