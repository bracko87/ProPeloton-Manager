import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'
import { SATURN_TEST_ACCOUNTS_ENABLED } from '../../lib/testAccountClient'

// Canonical lifecycle lookup: linking email or Google alone is not conversion.
// Fail closed while unresolved; do not mount restricted pages or payments.
export function usePermanentRegistration(): boolean {
  const { user, loading } = useAuth()
  const id = user?.id as string | undefined
  const anonymous = user?.is_anonymous === true
  const [verified, setVerified] = React.useState<{ id: string; allowed: boolean } | null>(null)
  React.useEffect(() => {
    let active = true
    setVerified(null)
    if (!SATURN_TEST_ACCOUNTS_ENABLED || !id || anonymous) return
    const verify = async () => {
      if (active) setVerified(null)
      const { data, error } = await supabase.from('saturn_test_accounts_v1')
        .select('converted_at').eq('user_id', id).maybeSingle()
      if (active) setVerified({ id, allowed: !error && (!data || Boolean(data.converted_at)) })
    }
    void verify()
    window.addEventListener('saturn-registration-completed', verify)
    return () => { active = false; window.removeEventListener('saturn-registration-completed', verify) }
  }, [id, anonymous])
  if (loading || !id || anonymous) return false
  if (!SATURN_TEST_ACCOUNTS_ENABLED) return true
  return verified?.id === id && verified.allowed
}
export default function PermanentRegistrationGate({ children }: { children: React.ReactNode }) {
  const allowed = usePermanentRegistration()
  return allowed ? <>{children}</> : (
    <section className="p-6 rounded-lg border border-gray-200 bg-white">
      <h2 className="text-lg font-semibold">Registration required</h2>
      <p className="mt-2">Register your existing test account to unlock access to optional services. Paid features must still be activated separately.</p>
      <Link className="inline-block mt-4 bg-yellow-400 text-black px-4 py-2 font-semibold" to="/test-account-register">Register / Keep my team</Link>
    </section>
  )
}
