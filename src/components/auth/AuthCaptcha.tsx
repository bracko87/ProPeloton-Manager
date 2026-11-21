import React from 'react'
import { SaturnGuestCaptcha, SATURN_TURNSTILE_SITE_KEY } from './SaturnGuestCaptcha'

// Independent of guest-mode flags: existing accounts must be able to log in
// while public and restricted guest signup are both disabled.
export function useAuthCaptcha() {
  const required = Boolean(SATURN_TURNSTILE_SITE_KEY)
  const [token, setToken] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const tokenRef = React.useRef<string | null>(null)
  const onTokenChange = React.useCallback((value: string | null) => {
    tokenRef.current = value
    setToken(value)
  }, [])
  function consume(): string | undefined {
    if (!required) return undefined
    const value = tokenRef.current
    if (!value) throw new Error('Complete the security verification and try again.')
    onTokenChange(null)
    return value
  }
  function reset() {
    onTokenChange(null)
    setAttempt(value => value + 1)
  }
  return { required, ready: !required || Boolean(token), consume, reset, attempt, onTokenChange }
}

export function AuthCaptcha({ captcha }: { captcha: ReturnType<typeof useAuthCaptcha> }) {
  if (!captcha.required) return null
  return <SaturnGuestCaptcha key={captcha.attempt} onTokenChange={captcha.onTokenChange} />
}
