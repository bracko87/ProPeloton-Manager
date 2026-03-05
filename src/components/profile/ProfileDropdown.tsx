/**
 * ProfileDropdown.tsx
 * Accessible dropdown menu anchored to a profile / club logo button.
 *
 * Behavior:
 * - Shows club logo or generated placeholder.
 * - Opens on click, closes on outside click or Escape.
 * - Keyboard accessible and closes on item selection (where appropriate).
 */

import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'
import PlaceholderLogo from './PlaceholderLogo'
import { ChevronDown } from 'lucide-react'

/**
 * ProfileDropdownProps
 * Optional external club logo and name (Header may forward).
 */
interface ProfileDropdownProps {
  clubLogoUrl?: string | null
  clubName?: string | undefined
}

/**
 * MenuItem definition used to render items.
 */
interface MenuItem {
  key: string
  label: string
  to?: string
  action?: () => Promise<void> | void
  /** render as disabled / display-only */
  displayOnly?: boolean
}

/**
 * ProfileDropdown
 * Renders the profile button and dropdown menu.
 */
export default function ProfileDropdown({ clubLogoUrl, clubName }: ProfileDropdownProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  /**
   * signOutUser
   * Signs out via supabase and navigates to home.
   */
  async function signOutUser() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const username = user?.user_metadata?.full_name || user?.email || 'Guest'

  const items: MenuItem[] = [
    { key: 'username', label: username, displayOnly: true },
    { key: 'inbox', label: 'Inbox', to: '/inbox' },
    { key: 'profile', label: 'My Profile', to: '/profile' },
    { key: 'customize', label: 'Customize Team', to: '/dashboard/customize-team' },
    { key: 'forum', label: 'Forum', to: '/forum' },
    { key: 'prefs', label: 'Preferences', to: '/preferences' },
    { key: 'help', label: 'Help', to: '/help' },
    { key: 'contact', label: 'Contact Us', to: '/contact' },
    { key: 'pro', label: 'Pro Packages', to: '/pro' },
    { key: 'invite', label: 'Invite Friends', to: '/invite' },
    { key: 'logout', label: 'Logout', action: signOutUser },
  ]

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (ref.current.contains(e.target as Node)) return
      setOpen(false)
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  /**
   * handleSelect
   * Navigates or runs action and closes the menu.
   */
  const handleSelect = async (item: MenuItem) => {
    setOpen(false)
    if (item.to) {
      navigate(item.to)
    } else if (item.action) {
      await item.action()
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-full p-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
        title={clubName || username}
      >
        <div className="h-9 w-9 rounded-full overflow-hidden border border-black/10 bg-transparent flex items-center justify-center">
          {clubLogoUrl ? (
            <img src={clubLogoUrl} alt={clubName || 'Club'} className="h-full w-full object-contain" />
          ) : (
            <PlaceholderLogo name={clubName || username || 'club'} size={36} />
          )}
        </div>
        <ChevronDown size={16} className="text-black/70" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile menu"
          className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black/10 z-50"
        >
          <div className="p-2">
            {items.map(item => {
              if (item.displayOnly) {
                return (
                  <div key={item.key} className="px-3 py-2 text-sm text-gray-700">
                    <div className="text-xs text-gray-400">Signed in as</div>
                    <div className="font-medium truncate">{item.label}</div>
                  </div>
                )
              }

              return (
                <button
                  key={item.key}
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-md text-gray-700"
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}