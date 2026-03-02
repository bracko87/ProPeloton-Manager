/**
 * Forum.tsx
 * Community landing page / forum index placeholder.
 */

import React from 'react'

/**
 * ForumPage
 * Displays forum categories and recent topics.
 */
export default function ForumPage(): JSX.Element {
  const categories = [
    { id: 'general', title: 'General Discussion', topics: 34 },
    { id: 'strategy', title: 'Tactics & Strategy', topics: 12 }
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Forum</h2>

      <div className="bg-white p-4 rounded shadow">
        <ul className="space-y-3">
          {categories.map(c => (
            <li key={c.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-gray-500">Topics: {c.topics}</div>
              </div>
              <button className="text-sm text-yellow-500">Enter</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}