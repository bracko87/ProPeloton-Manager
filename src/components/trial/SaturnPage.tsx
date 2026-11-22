import React from 'react'

const SATURN_BACKGROUND = 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_26_26%20PM.png'

/** Shared backdrop for dedicated test-account pages, independent of form opacity. */
export default function SaturnPage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <main className={`relative isolate min-h-screen bg-slate-950 text-slate-100 ${className}`}>
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url("${SATURN_BACKGROUND}")`, opacity: 0.2 }} />
    {children}
  </main>
}
