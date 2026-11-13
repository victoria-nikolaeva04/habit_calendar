import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    setMessage(error ? error.message : 'Check your email for the sign-in link.')
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" required value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <button type="submit">Send link</button>
      {message && <p>{message}</p>}
    </form>
  )
}