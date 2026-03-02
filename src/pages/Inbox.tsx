/**
 * Inbox.tsx
 * Simple messages/notifications area. Uses fallbacks when backend data is not present.
 */

import React from 'react'

/**
 * InboxPage
 * Display user's messages and notifications.
 */
export default function InboxPage(): JSX.Element {
  const messages = [
    {
      id: '1',
      title: 'Welcome to ProPeloton!',
      body: 'Thanks for signing up — check out the team setup page to get started.',
      time: '2 days ago'
    }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Inbox</h2>

      <div className="bg-white p-4 rounded shadow">
        <h4 className="font-semibold">Messages</h4>
        <ul className="mt-3 text-sm text-gray-600 space-y-3">
          {messages.map(m => (
            <li key={m.id} className="border-b last:border-b-0 pb-3">
              <div className="font-medium">{m.title}</div>
              <div className="text-xs text-gray-500">{m.body}</div>
              <div className="text-xs text-gray-400 mt-1">{m.time}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}