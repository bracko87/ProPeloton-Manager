import { useEffect } from 'react'

import i18n, { changeApplicationLanguage } from '@/i18n'
import { isSupportedLanguage, type SupportedLanguage } from '@/i18n/languages'
import { supabase } from '@/lib/supabase'

/**
 * Keeps the authenticated player's language preference synchronized with
 * public.profiles.preferred_language.
 *
 * Priority:
 * 1. Authenticated profile preference
 * 2. Browser localStorage preference (handled by i18n startup)
 * 3. English fallback
 */
export default function LanguagePreferenceSync(): null {
  useEffect(() => {
    let cancelled = false
    let activeUserId: string | null = null

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

    async function initialize(): Promise<void> {
      const { data, error } = await supabase.auth.getSession()

      if (cancelled) return

      if (error) {
        console.warn('Could not restore language preference session:', error.message)
        return
      }

      activeUserId = data.session?.user.id ?? null

      if (activeUserId) {
        await loadProfileLanguage(activeUserId)
      }
    }

    const handleLanguageChanged = async (nextLanguage: string): Promise<void> => {
      if (!activeUserId || !isSupportedLanguage(nextLanguage)) return

      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: nextLanguage as SupportedLanguage })
        .eq('id', activeUserId)

      if (error) {
        console.warn('Could not save language preference:', error.message)
      }
    }

    void initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      activeUserId = session?.user.id ?? null

      if (activeUserId) {
        void loadProfileLanguage(activeUserId)
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
