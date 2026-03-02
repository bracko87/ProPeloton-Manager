/**
 * ReviewCard.tsx
 * Small card showing a user's review and rating.
 */

import React from 'react'

interface ReviewCardProps {
  avatar?: string
  name: string
  title?: string
  rating: number
  text: string
}

export default function ReviewCard({
  avatar,
  name,
  title,
  rating,
  text
}: ReviewCardProps) {
  const stars = Array.from({ length: 5 }).map((_, i) => (i < rating ? '★' : '☆'))

  return (
    <div className="bg-white rounded-xl p-5 shadow border border-black/5">
      <div className="flex items-start gap-4">
        <img
          src={
            avatar ||
            'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/577bb0d7-2704-4919-9dd9-17d6f4973360.jpg'
          }
          alt={name}
          className="w-12 h-12 rounded-full object-cover"
        />

        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-900">{name}</div>
              {title && <div className="text-xs text-gray-500">{title}</div>}
            </div>

            <div className="text-yellow-500 text-lg whitespace-nowrap">
              {stars.join(' ')}
            </div>
          </div>

          <p className="mt-3 text-sm text-gray-700">{text}</p>
        </div>
      </div>
    </div>
  )
}