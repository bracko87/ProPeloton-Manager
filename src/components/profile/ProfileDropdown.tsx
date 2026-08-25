/**
 * ProfileDropdown.tsx
 * Accessible dropdown menu anchored to a profile / club logo button.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthProvider'
import { supabase } from '../../lib/supabase'
import PlaceholderLogo from './PlaceholderLogo'
import { ChevronDown } from 'lucide-react'

interface ProfileDropdownProps {
  clubLogoUrl?: string | null
  clubName?: string | undefined
}

interface MenuItem {
  key: string
  label: string
  to?: string
  action?: () => Promise<void> | void
  displayOnly?: boolean
}

export default function ProfileDropdown({
  clubLogoUrl,
  clubName,
}: ProfileDropdownProps): JSX.Element {
  const { t } = useTranslation(['navigation', 'profile'])
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  async function signOutUser(): Promise<void> {
    await supabase.auth.signOut()
    navigate('/')
  }

  const username =
    user?.user_metadata?.full_name ||
    user?.email ||
    t('profile:dropdown.guest')

  const items: MenuItem[] = [
    { key: 'username', label: username, displayOnly: true },
    { key: 'inbox', label: t('navigation:inbox'), to: '/dashboard/inbox' },
    { key: 'profile', label: t('navigation:myProfile'), to: '/dashboard/my-profile' },
    { key: 'customize', label: t('navigation:customizeTeam'), to: '/dashboard/customize-team' },
    { key: 'forum', label: t('navigation:forum'), to: '/dashboard/forum' },
    { key: 'prefs', label: t('navigation:preferences'), to: '/dashboard/preferences' },
    { key: 'help', label: t('navigation:help'), to: '/dashboard/help' },
    { key: 'contact', label: t('navigation:contactUs'), to: '/dashboard/contact-us' },
    { key: 'pro', label: t('navigation:proPackages'), to: '/dashboard/pro' },
    { key: 'invite', label: t('navigation:inviteFriends'), to: '/dashboard/invite-friends' },
    { key: 'logout', label: t('navigation:logout'), action: signOutUser },
  ]

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (!ref.current) return
      if (ref.current.contains(e.target as Node)) return
      setOpen(false)
    }

    function onKey(e: KeyboardEvent): void {
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

  const handleSelect = async (item: MenuItem): Promise<void> => {
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
            <img
              src={clubLogoUrl}
              alt={clubName || t('profile:dropdown.club')}
              className="h-full w-full object-contain"
            />
          ) : (
            <PlaceholderLogo
              name={clubName || username || t('profile:dropdown.club')}
              size={36}
            />
          )}
        </div>
        <ChevronDown size={16} className="text-black/70" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('profile:dropdown.menu')}
          className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black/10 z-50"
        >
          <div className="p-2">
            {items.map(item => {
              if (item.displayOnly) {
                return (
                  <div key={item.key} className="px-3 py-2 text-sm text-gray-700">
                    <div className="text-xs text-gray-400">
                      {t('profile:dropdown.signedInAs')}
                    </div>
                    <div className="font-medium truncate">{item.label}</div>
                  </div>
                )
              }

              return (
                <button
                  key={item.key}
                  onClick={() => {
                    void handleSelect(item)
                  }}
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
