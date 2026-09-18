import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'

const VISITOR_KEY = 'ppm-analytics-visitor-id'
const SESSION_KEY = 'ppm-analytics-session-id'
const COUNTRY_KEY = 'ppm-analytics-country-code'
const PRODUCTION_HOSTS = new Set([
  'propelotonmanager.com',
  'www.propelotonmanager.com',
])

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readOrCreate(storage: Storage, key: string): string {
  const existing = storage.getItem(key)
  if (existing) return existing

  const value = randomId()
  storage.setItem(key, value)
  return value
}

function deviceType(): 'desktop' | 'tablet' | 'mobile' {
  const width = window.innerWidth
  if (width <= 767) return 'mobile'
  if (width <= 1024) return 'tablet'
  return 'desktop'
}

function externalReferrerHost(): string | null {
  if (!document.referrer) return null

  try {
    const host = new URL(document.referrer).hostname.toLowerCase()
    return PRODUCTION_HOSTS.has(host) ? null : host
  } catch {
    return null
  }
}

async function getCountryCode(): Promise<string> {
  const cached = window.sessionStorage.getItem(COUNTRY_KEY)
  if (cached && /^[A-Z]{2}$/.test(cached)) return cached

  try {
    const response = await fetch('/api/analytics-geo', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    })

    if (!response.ok) return 'XX'

    const payload = await response.json()
    const code = String(payload?.countryCode ?? 'XX').toUpperCase()

    if (/^[A-Z]{2}$/.test(code)) {
      window.sessionStorage.setItem(COUNTRY_KEY, code)
      return code
    }
  } catch (error) {
    console.warn('Analytics country lookup failed:', error)
  }

  return 'XX'
}

export default function SiteAnalyticsTracker(): null {
  const location = useLocation()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading || typeof window === 'undefined') return

    const hostname = window.location.hostname.toLowerCase()
    if (!PRODUCTION_HOSTS.has(hostname)) return

    const path = location.pathname || '/'
    if (
      path === '/dashboard/admin/analytics' ||
      path.startsWith('/dashboard/admin/analytics/')
    ) {
      return
    }

    let cancelled = false

    async function recordNavigation() {
      try {
        const visitorId = readOrCreate(window.localStorage, VISITOR_KEY)
        const sessionId = readOrCreate(window.sessionStorage, SESSION_KEY)
        const countryCode = await getCountryCode()

        if (cancelled) return

        const { error } = await supabase.rpc('record_site_analytics_event_v1', {
          p_visitor_id: visitorId,
          p_session_id: sessionId,
          p_path: path,
          p_country_code: countryCode,
          p_device_type: deviceType(),
          p_referrer_host: externalReferrerHost(),
          p_hostname: hostname,
        })

        if (error) {
          console.warn('Analytics event was not recorded:', error.message)
        }
      } catch (error) {
        console.warn('Analytics tracking failed:', error)
      }
    }

    void recordNavigation()

    return () => {
      cancelled = true
    }
  }, [loading, location.pathname, user?.id])

  return null
}
