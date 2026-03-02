/**
 * Help.tsx
 * Help and FAQ landing page.
 */

import React from 'react'

/**
 * HelpPage
 * Presents common questions and support information.
 */
export default function HelpPage(): JSX.Element {
  const faqs = [
    { q: 'How do I create a team?', a: 'Go to Customize Team and follow the instructions.' },
    { q: 'How to invite friends?', a: 'Use Invite Friends to share a referral link.' }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Help</h2>

      <div className="bg-white p-4 rounded shadow space-y-3 max-w-2xl">
        {faqs.map((f, idx) => (
          <div key={idx}>
            <div className="font-medium">{f.q}</div>
            <div className="text-sm text-gray-600">{f.a}</div>
          </div>
        ))}
      </div>
    </div>
  )
}