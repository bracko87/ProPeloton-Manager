import React, { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'
import SaturnPage from './SaturnPage'

export default function TestAccountExpiry(): JSX.Element {
  return <SaturnPage className="p-8">
    <section className="mx-auto max-w-xl space-y-5 rounded-xl bg-slate-900 p-6">
      <h1 className="text-2xl font-semibold">Your 14-day test period has ended</h1>
      <p>Registration had to be completed before the deadline. Unregistered test teams are removed from the game; finished race history is preserved.</p>
      <p>Your expired test team cannot be restored.</p>
      <Link to="/" className="text-yellow-300 underline">Back to homepage</Link>
    </section>
  </SaturnPage>
}

/** Server enforces the deadline. This guard prevents expired teams opening dashboard
 * or linking credentials even while a protected race is finishing. Converted
 * accounts remain unaffected. Check the own lifecycle using existing SELECT RLS. */
export function RequireUnexpiredTestAccount({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useAuth()
  const userId = user?.id
  const [term, setTerm] = useState<{ id: string; expiry: number | null; error: boolean } | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (loading || !userId) return
    let active = true
    void supabase.from('saturn_test_accounts_v1').select('expires_at,converted_at')
      .eq('user_id',userId).maybeSingle().then(({ data, error }) => {
        if (active) setTerm({ id:userId, expiry:data && !data.converted_at ? Date.parse(data.expires_at) : null, error:!!error })
      }).catch(() => { if(active) setTerm({ id:userId, expiry:null, error:true }) })
    const tick=window.setInterval(()=>setNow(Date.now()),1000)
    const completed=()=>{ if(active) setTerm({id:userId,expiry:null,error:false}) }
    window.addEventListener('saturn-registration-completed',completed)
    return ()=>{active=false;window.clearInterval(tick);window.removeEventListener('saturn-registration-completed',completed)}
  },[userId,loading])
  if (loading || (userId && term?.id!==userId)) return <SaturnPage className="p-8"><p>Checking your account…</p></SaturnPage>
  if (userId && term?.id===userId && term.error && user?.is_anonymous===true) return <SaturnPage className="p-8"><p>Unable to verify the test period. Please refresh.</p></SaturnPage>
  if (userId && term?.id===userId && term.expiry!==null && now>=term.expiry) return <Navigate to="/test-account-expired" replace />
  return <>{children}</>
}
