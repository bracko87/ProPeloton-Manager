import { useEffect } from 'react'

import i18n, { changeApplicationLanguage } from '@/i18n'
import {
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  type SupportedLanguage,
} from '@/i18n/languages'
import { supabase } from '@/lib/supabase'

function getExplicitLocalLanguage(): SupportedLanguage | null {
  if (typeof window === 'undefined') return null

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isSupportedLanguage(storedLanguage) ? storedLanguage : null
}

/**
 * Keeps the authenticated player's language preference synchronized with
 * public.profiles.preferred_language.
 *
 * Priority:
 * 1. Explicit browser localStorage preference
 * 2. Authenticated profile preference
 * 3. English fallback (handled by i18n startup)
 */
export default function LanguagePreferenceSync(): null {
  useEffect(() => {
    let cancelled = false
    let activeUserId: string | null = null
    let applyingLocalPreference = false

    async function saveProfileLanguage(
      userId: string,
      language: SupportedLanguage,
    ): Promise<void> {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: language })
        .eq('id', userId)

      if (cancelled) return

      if (error) {
        console.warn('Could not save language preference:', error.message)
      }
    }

    async function loadProfileLanguage(userId: string): Promise<void> {
      const { data, error } = await supabase
        .from('profiles')
        .select('preferred_language')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.warn('Could not load language preference:', error.message)
        return
      }

      const preferredLanguage = data?.preferred_language

      if (isSupportedLanguage(preferredLanguage)) {
        await changeApplicationLanguage(preferredLanguage)
      }
    }

    async function synchronizeAuthenticatedLanguage(userId: string): Promise<void> {
      const localLanguage = getExplicitLocalLanguage()

      if (localLanguage) {
        applyingLocalPreference = true

        try {
          if (i18n.language !== localLanguage) {
            await changeApplicationLanguage(localLanguage)
          }
        } finally {
          applyingLocalPreference = false
        }

        if (cancelled) return

        await saveProfileLanguage(userId, localLanguage)
        return
      }

      await loadProfileLanguage(userId)
    }

    async function initialize(): Promise<void> {
      const { data, error } = await supabase.auth.getSession()

      if (cancelled) return

      if (error) {
        console.warn('Could not restore language preference session:', error.message)
        return
      }

      activeUserId = data.session?.user.id ?? null

      if (activeUserId) {
        await synchronizeAuthenticatedLanguage(activeUserId)
      }
    }

    const handleLanguageChanged = async (nextLanguage: string): Promise<void> => {
      if (
        applyingLocalPreference ||
        !activeUserId ||
        !isSupportedLanguage(nextLanguage)
      ) {
        return
      }

      await saveProfileLanguage(activeUserId, nextLanguage)
    }

    void initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      activeUserId = session?.user.id ?? null

      if (activeUserId) {
        void synchronizeAuthenticatedLanguage(activeUserId)
      }
    })

    i18n.on('languageChanged', handleLanguageChanged)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [])

  return null
}
