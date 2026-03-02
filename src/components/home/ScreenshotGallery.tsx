/**
 * ScreenshotGallery.tsx
 * Full-width screenshot section with white separator lines and a faint fading background image.
 */

import React from 'react'

const images = [
  {
    src: 'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/cc81fe1f-a68d-4d50-b315-836932046ff9.jpg',
    alt: 'Race overview'
  },
  {
    src: 'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/17a4de7f-7061-41a8-8ad4-005cf23440a4.jpg',
    alt: 'Team management'
  },
  {
    src: 'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/55ed0d5b-e4d6-43be-9116-91cab5f86ac0.jpg',
    alt: 'Peloton in action'
  },
  {
    src: 'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/052a3019-5b5a-42bb-a1bb-adecf53053a6.jpg',
    alt: 'Tactics screen'
  },
  {
    src: 'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/1f17a846-b18e-43e7-a0db-8f0eb40a41f7.jpg',
    alt: 'Tournament view'
  },
  {
    src: 'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/ba3b5481-ff02-4148-b389-b35f552ab890.jpg',
    alt: 'Night stage'
  }
]

export default function ScreenshotGallery() {
  return (
    <section className="relative w-full overflow-hidden border-y border-white/15 bg-[#0a1730] py-16">
      {/* faint background image */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/ea527ef7-6896-413d-9d69-df332b440fd0.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{
            opacity: 0.08,
            WebkitMaskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1730]/20 via-[#0a1730]/55 to-[#0a1730]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <h3 className="text-2xl font-semibold text-white">In-game Screenshots</h3>
        <p className="mt-2 text-sm text-white/70 max-w-2xl">
          A peek into race-day, team management and tactical screens from ProPeloton Manager.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map((img, idx) => (
            <div
              key={idx}
              className="rounded-xl overflow-hidden bg-white/5 border border-white/5 shadow"
            >
              <img
                src={img.src}
                alt={img.alt}
                className="object-cover w-full h-56 transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}