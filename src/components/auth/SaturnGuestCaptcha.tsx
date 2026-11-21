import React from 'react'

/**
 * SAT-ABUSE: CAPTCHA for new anonymous identities. Verification happens in
 * Supabase Auth, NEVER in this component. Configure the same Turnstile secret
 * and enable CAPTCHA enforcement in Supabase BEFORE public activation.
 */
type TurnstileAPI = {
  render: (container: HTMLElement, options: {
    sitekey: string
    callback: (token: string) => void
    'expired-callback': () => void
    'error-callback': () => void
  }) => string
  remove: (widgetId: string) => void
}
type TurnstileWindow = Window & { turnstile?: TurnstileAPI }

export const SATURN_TURNSTILE_SITE_KEY =
  (import.meta.env.VITE_SATURN_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? ''

export function SaturnGuestCaptcha({
  onTokenChange,
}: { onTokenChange: (token: string | null) => void }): JSX.Element {
  const container = React.useRef<HTMLDivElement>(null)
  const onToken = React.useRef(onTokenChange)
  onToken.current = onTokenChange

  React.useEffect(() => {
    onToken.current(null)
    if (!SATURN_TURNSTILE_SITE_KEY || !container.current) return

    let active = true
    let widgetId: string | null = null
    const target = container.current
    const win = window as TurnstileWindow
    const scriptURL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    const script = (document.querySelector('script[data-saturn-turnstile]') as HTMLScriptElement | null)
      ?? document.createElement('script')
    let created = false

    const mount = () => {
      if (!active || !target || !win.turnstile || widgetId !== null) return
      widgetId = win.turnstile.render(target, {
        sitekey: SATURN_TURNSTILE_SITE_KEY,
        callback: token => { if (active) onToken.current(token) },
        'expired-callback': () => { if (active) onToken.current(null) },
        'error-callback': () => { if (active) onToken.current(null) },
      })
    }

    if (!script.hasAttribute('data-saturn-turnstile')) {
      created = true
      script.setAttribute('data-saturn-turnstile', '')
      script.src = scriptURL
      script.async = true
      script.defer = true
    }
    script.addEventListener('load', mount)
    if (win.turnstile) mount()
    else if (created) document.head.appendChild(script)
    // If another page mounted the script, its 'load' event calls mount.

    return () => {
      active = false
      script.removeEventListener('load', mount)
      if (widgetId !== null) win.turnstile?.remove(widgetId)
      onToken.current(null)
    }
  }, [])

  if (!SATURN_TURNSTILE_SITE_KEY) {
    return <p role="alert" className="text-sm text-amber-300">
      Test Player signup is unavailable until anti-bot verification is configured.
    </p>
  }

  return <div className="space-y-2">
    <span className="text-sm">Security verification</span>
    <div ref={container} aria-label="Security verification challenge" />
  </div>
}
