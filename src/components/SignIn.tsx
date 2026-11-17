import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function SignIn() {
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
    <div className="signin">
      <h1>Habit Calendar</h1>
      {status === 'sent' ? (
        <div role="status">
          <p>Check <strong>{email}</strong> for your sign-in link.</p>
          <button type="button" onClick={() => setStatus('idle')}>Use a different email</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <p>Enter your email and we'll send you a link to sign in. No password needed.</p>
          <label className="field">
            <span>Email</span>
            <input type="email" required autoFocus autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" className="primary" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send link'}
          </button>
        </form>
      )}
    </div>
  )
}
