/**
 * Header.tsx
 * Top header inside the in-game layout.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Bell, ChevronDown } from 'lucide-react'

interface HeaderProps {
  onToggle?: () => void
  title?: string
  route?: string
  clubName?: string
  clubCountryName?: string
  clubCountryCode?: string
  clubLogoUrl?: string | null
  userName?: string
  onNavigate?: (path: string) => void
  onLogout?: () => void
}

type MenuItem = {
  label: string
  path?: string
  action?: 'logout'
}

const profileMenuItems: MenuItem[] = [
  { label: 'Inbox', path: '/inbox' },
  { label: 'My Profile', path: '/my-profile' },
  { label: 'Customize Team', path: '/customize-team' },
  { label: 'Forum', path: '/forum' },
  { label: 'Preferences', path: '/preferences' },
  { label: 'Help', path: '/help' },
  { label: 'Contact Us', path: '/contact-us' },
  { label: 'Pro Packages', path: '/pro-packages' },
  { label: 'Invite Friends', path: '/invite-friends' },
  { label: 'Logout', action: 'logout' }
]

/**
 * Builds a small flag image URL from ISO country code.
 */
function getFlagImageUrl(countryCode?: string) {
  if (!countryCode || countryCode.length !== 2) return null
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function getFallbackLetter(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'T'
}

function TeamAvatar({
  clubLogoUrl,
  alt,
  fallbackLetter,
  sizeClass
}: {
  clubLogoUrl?: string | null
  alt: string
  fallbackLetter: string
  sizeClass: string
}) {
  return (
    <div
      className={`${sizeClass} rounded-full overflow-hidden border border-black/10 bg-black/10 flex items-center justify-center font-semibold text-black shrink-0`}
    >
      {clubLogoUrl ? (
        <img
          src={clubLogoUrl}
          alt={alt}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{fallbackLetter}</span>
      )}
    </div>
  )
}

/**
 * Header
 * Displays yellow header with club branding and quick actions.
 * Now includes a clickable profile/team menu in the top-right corner.
 */
export default function Header({
  onToggle,
  title,
  clubName,
  clubCountryName,
  clubCountryCode,
  clubLogoUrl,
  userName,
  onNavigate,
  onLogout
}: HeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  const displayName = clubName || title || 'ProPeloton Manager'
  const displayCountry = clubCountryName || 'Club country'
  const displayUserName = userName || 'Manager'
  const flagUrl = getFlagImageUrl(clubCountryCode)
  const fallbackLetter = getFallbackLetter(displayName)

  useEffect(() => {
    if (!isProfileMenuOpen) return

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setIsProfileMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isProfileMenuOpen])

  function handleNavigate(path: string) {
    setIsProfileMenuOpen(false)

    if (onNavigate) {
      onNavigate(path)
      return
    }

    if (typeof window !== 'undefined') {
      window.location.href = path
    }
  }

  function handleLogoutClick() {
    setIsProfileMenuOpen(false)

    if (onLogout) {
      onLogout()
      return
    }

    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-yellow-500 bg-yellow-400">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggle}
          className="text-black p-2 rounded-md hover:bg-black/10"
          aria-label="Toggle sidebar"
          type="button"
        >
          ☰
        </button>

        <div className="flex items-center gap-3">
          {clubLogoUrl ? (
            <TeamAvatar
              clubLogoUrl={clubLogoUrl}
              alt={displayName}
              fallbackLetter={fallbackLetter}
              sizeClass="h-12 w-12"
            />
          ) : null}

          <div>
            <div className="text-lg font-bold text-black leading-tight">
              Team Name: {displayName}
            </div>

            <div className="text-sm text-black/85 flex items-center gap-2 leading-tight">
              {flagUrl ? (
                <img
                  src={flagUrl}
                  alt={displayCountry}
                  className="h-3.5 w-5 rounded-[2px] object-cover border border-black/10"
                />
              ) : null}
              <span>{displayCountry}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="relative text-black hover:opacity-80 p-2 rounded-md hover:bg-black/10"
          aria-label="Notifications"
          type="button"
        >
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
        </button>

        <div className="relative" ref={profileMenuRef}>
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={isProfileMenuOpen}
            className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-black/10"
          >
            <TeamAvatar
              clubLogoUrl={clubLogoUrl}
              alt={displayName}
              fallbackLetter={fallbackLetter}
              sizeClass="h-9 w-9"
            />
            <ChevronDown
              size={16}
              className={`text-black transition-transform ${
                isProfileMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isProfileMenuOpen && (
            <div
              role="menu"
              aria-label="Profile menu"
              className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl z-50"
            >
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div className="text-sm font-semibold text-black">
                  {displayUserName}
                </div>
                <div className="text-xs text-black/70">
                  Team: {displayName}
                </div>
              </div>

              <div className="py-1">
                {profileMenuItems.map((item) =>
                  item.action === 'logout' ? (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={handleLogoutClick}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      {item.label}
                    </button>
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={() => handleNavigate(item.path!)}
                      className="w-full px-4 py-2.5 text-left text-sm text-black hover:bg-gray-100"
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}