(() => {
  const PRODUCTION_HOSTS = new Set([
    'propelotonmanager.com',
    'www.propelotonmanager.com',
  ])
  const VISITOR_KEY = 'ppm-analytics-visitor-id'
  const SESSION_KEY = 'ppm-analytics-session-id'
  const COUNTRY_KEY = 'ppm-analytics-country-code'
  const RECORD_URL =
    'https://okuravitxocyevkexfgi.supabase.co/functions/v1/record-public-site-analytics'

  const hostname = window.location.hostname.toLowerCase()
  if (!PRODUCTION_HOSTS.has(hostname)) return

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID()
    }

    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = Array.from(bytes, value =>
      value.toString(16).padStart(2, '0'),
    ).join('')

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-')
  }

  function readOrCreate(storage, key) {
    const existing = storage.getItem(key)
    if (existing) return existing

    const value = randomId()
    storage.setItem(key, value)
    return value
  }

  function deviceType() {
    if (window.innerWidth <= 767) return 'mobile'
    if (window.innerWidth <= 1024) return 'tablet'
    return 'desktop'
  }

  function referrerHost() {
    if (!document.referrer) return null

    try {
      const host = new URL(document.referrer).hostname.toLowerCase()
      return PRODUCTION_HOSTS.has(host) ? null : host
    } catch {
      return null
    }
  }

  async function countryCode() {
    const cached = sessionStorage.getItem(COUNTRY_KEY)
    if (cached && /^[A-Z]{2}$/.test(cached)) return cached

    try {
      const response = await fetch('/api/analytics-geo', {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) return 'XX'

      const payload = await response.json()
      const code = String(payload?.countryCode ?? 'XX').toUpperCase()

      if (/^[A-Z]{2}$/.test(code)) {
        sessionStorage.setItem(COUNTRY_KEY, code)
        return code
      }
    } catch {
      // Analytics must never interfere with the public site.
    }

    return 'XX'
  }

  async function record() {
    try {
      const code = await countryCode()

      await fetch(RECORD_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          visitor_id: readOrCreate(localStorage, VISITOR_KEY),
          session_id: readOrCreate(sessionStorage, SESSION_KEY),
          path: window.location.pathname || '/',
          country_code: code,
          device_type: deviceType(),
          referrer_host: referrerHost(),
          hostname,
        }),
      })
    } catch {
      // Analytics is deliberately non-blocking.
    }
  }

  void record()
})()
