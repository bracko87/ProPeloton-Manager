/**
 * ContactUs.tsx
 * Contact / support form UI (UI-only; no backend submission wired).
 */

import React, { useState } from 'react'

/**
 * ContactUsPage
 * Simple contact form that shows a thank you message on submit.
 */
export default function ContactUsPage(): JSX.Element {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // In production, submit to backend
    setSent(true)
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Contact Us</h2>

      {!sent ? (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow max-w-2xl space-y-3">
          <label className="block">
            <div className="text-sm font-medium">Name</div>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border px-3 py-2 rounded mt-1" />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Email</div>
            <input value={email} onChange={e => setEmail(e.target.value)} className="w-full border px-3 py-2 rounded mt-1" />
          </label>
          <label className="block">
            <div className="text-sm font-medium">Message</div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} className="w-full border px-3 py-2 rounded mt-1" />
          </label>

          <div>
            <button type="submit" className="px-4 py-2 bg-yellow-400 text-black rounded font-semibold">Send</button>
          </div>
        </form>
      ) : (
        <div className="bg-white p-4 rounded shadow max-w-2xl">
          <div className="font-medium">Thanks — your message was received.</div>
          <div className="text-sm text-gray-600 mt-2">We will get back to you soon.</div>
        </div>
      )}
    </div>
  )
}