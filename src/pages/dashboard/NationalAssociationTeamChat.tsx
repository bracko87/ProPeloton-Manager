import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import NationalAssociationHeader from '../../components/nations/NationalAssociationHeader'

type AssociationData = {
  eligible: boolean
  country_code?: string
  association_exists?: boolean
  association_name?: string
  association_status?: string
  is_member?: boolean
  coach?: {
    club_name?: string | null
    user_id?: string | null
  } | null
}

type ChatMessage = {
  message_id: string
  club_id?: string | null
  club_name: string
  game_date: string
  message: string
  created_at: string
  is_mine: boolean
}

type ChatData = {
  is_member: boolean
  association_id?: string | null
  association_name?: string | null
  messages: ChatMessage[]
}

type PresenceParticipant = {
  user_id: string
  club_id?: string | null
  club_name: string
  joined_at: string
  last_active_at: string
  is_me: boolean
}

type PresenceData = {
  is_member: boolean
  joined: boolean
  joined_at?: string | null
  last_active_at?: string | null
  expires_at?: string | null
  timeout_minutes?: number
  participants: PresenceParticipant[]
}

const EMPTY_CHAT: ChatData = {
  is_member: false,
  messages: [],
}

const EMPTY_PRESENCE: PresenceData = {
  is_member: false,
  joined: false,
  participants: [],
  timeout_minutes: 10,
}

function formatTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

export default function NationalAssociationTeamChatPage(): JSX.Element {
  const { t } = useTranslation('nations')
  const [association, setAssociation] = useState<AssociationData | null>(null)
  const [chat, setChat] = useState<ChatData>(EMPTY_CHAT)
  const [presence, setPresence] = useState<PresenceData>(EMPTY_PRESENCE)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [isCoach, setIsCoach] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastInteractionRef = useRef(Date.now())

  const markActivity = useCallback(() => {
    lastInteractionRef.current = Date.now()
  }, [])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [associationResponse, chatResponse, presenceResponse, coachResponse] = await Promise.all([
        supabase.rpc('get_my_national_association_v1'),
        supabase.rpc('get_my_national_association_chat_v1', { p_limit: 150 }),
        supabase.rpc('get_my_national_association_chat_presence_v1'),
        supabase.rpc('get_national_coach_dashboard_v1'),
      ])

      if (associationResponse.error) throw associationResponse.error
      if (chatResponse.error) throw chatResponse.error
      if (presenceResponse.error) throw presenceResponse.error

      const nextAssociation = (associationResponse.data ?? null) as AssociationData | null
      setAssociation(nextAssociation)
      setIsCoach(!coachResponse.error && Boolean((coachResponse.data as any)?.allowed))
      setChat((chatResponse.data ?? EMPTY_CHAT) as ChatData)
      setPresence((presenceResponse.data ?? EMPTY_PRESENCE) as PresenceData)
    } catch (caught: any) {
      setError(caught?.message ?? t('association.errors.load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const refreshPresence = useCallback(async (): Promise<void> => {
    const { data, error: rpcError } = await supabase.rpc(
      'get_my_national_association_chat_presence_v1',
    )
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setPresence((data ?? EMPTY_PRESENCE) as PresenceData)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!association?.is_member) return

    const poll = window.setInterval(() => {
      void refreshPresence()
    }, 30_000)

    return () => window.clearInterval(poll)
  }, [association?.is_member, refreshPresence])

  useEffect(() => {
    if (!association?.is_member || !presence.joined) return

    const heartbeat = window.setInterval(async () => {
      if (Date.now() - lastInteractionRef.current >= 90_000) {
        await refreshPresence()
        return
      }

      const { data, error: rpcError } = await supabase.rpc(
        'touch_my_national_association_chat_v1',
      )
      if (rpcError) {
        setError(rpcError.message)
        return
      }

      if (!(data as any)?.joined) {
        await refreshPresence()
        return
      }

      await refreshPresence()
    }, 60_000)

    return () => window.clearInterval(heartbeat)
  }, [association?.is_member, presence.joined, refreshPresence])

  const joinChat = async (): Promise<void> => {
    if (!association?.is_member || working) return
    setWorking(true)
    setError(null)
    markActivity()

    const { error: rpcError } = await supabase.rpc('join_my_national_association_chat_v1')
    if (rpcError) setError(rpcError.message)
    else await refreshPresence()

    setWorking(false)
  }

  const sendMessage = async (): Promise<void> => {
    const value = draft.trim()
    if (!value || working || !association?.is_member || !presence.joined) return

    setWorking(true)
    setError(null)
    markActivity()

    const { error: rpcError } = await supabase.rpc(
      'send_national_association_chat_message_v1',
      { p_message: value },
    )

    if (rpcError) {
      setError(rpcError.message)
      await refreshPresence()
    } else {
      setDraft('')
      await load()
    }

    setWorking(false)
  }

  const messages = chat.messages ?? []
  const participants = presence.participants ?? []

  if (loading && !association) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('association.loading')}
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-full space-y-6"
      onPointerDown={markActivity}
      onKeyDown={markActivity}
    >
      <NationalAssociationHeader
        association={association}
        isCoach={isCoach}
        loading={loading}
        onRefresh={() => void load()}
      />

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded bg-white shadow">
          <div className="border-b border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('association.chat.privateEyebrow')}
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              {t('association.chat.title')}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {t('association.chat.description')}
            </p>
          </div>

          {!association?.is_member ? (
            <div className="p-6 text-sm text-slate-600">
              {t('association.chat.memberRequired')}
            </div>
          ) : (
            <>
              <div className="max-h-[520px] min-h-[320px] space-y-3 overflow-y-auto bg-slate-50 p-4">
                {messages.length === 0 ? (
                  <div className="rounded border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                    {t('association.chat.noMessages')}
                  </div>
                ) : (
                  messages.map(row => (
                    <article
                      key={row.message_id}
                      className={[
                        'max-w-[82%] rounded-lg border px-4 py-3',
                        row.is_mine
                          ? 'ml-auto border-yellow-200 bg-yellow-50'
                          : 'border-slate-200 bg-white',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-slate-900">
                          {row.club_name}
                        </strong>
                        <span className="text-xs text-slate-400">
                          {formatDate(row.game_date)} · {formatTime(row.created_at)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {row.message}
                      </p>
                    </article>
                  ))
                )}
              </div>

              <div className="border-t border-slate-200 p-4">
                <textarea
                  value={draft}
                  maxLength={1000}
                  disabled={!presence.joined}
                  onChange={event => {
                    markActivity()
                    setDraft(event.target.value)
                  }}
                  placeholder={
                    presence.joined
                      ? t('association.chat.messagePlaceholder')
                      : t('association.chat.joinToWrite')
                  }
                  rows={4}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-yellow-500 disabled:bg-slate-100"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    {draft.length} / 1000
                  </span>
                  <button
                    type="button"
                    disabled={working || !presence.joined || !draft.trim()}
                    onClick={() => void sendMessage()}
                    className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                  >
                    {working ? t('association.chat.sending') : t('association.chat.send')}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded bg-white shadow">
            <div className="border-b border-slate-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('association.chat.liveRoom')}
              </div>
              <h3 className="mt-1 font-semibold text-slate-900">
                {presence.joined
                  ? t('association.chat.inRoom')
                  : t('association.chat.joinConversation')}
              </h3>
            </div>

            <div className="p-4">
              {!association?.is_member ? (
                <p className="text-sm text-slate-600">
                  {t('association.chat.memberRequiredShort')}
                </p>
              ) : !presence.joined ? (
                <>
                  <p className="text-sm leading-6 text-slate-600">
                    {participants.length > 0
                      ? t('association.chat.activeCount', { count: participants.length })
                      : t('association.chat.nobodyActive')}
                  </p>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void joinChat()}
                    className="mt-3 w-full rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:opacity-50"
                  >
                    {working
                      ? t('association.chat.joining')
                      : participants.length > 0
                        ? t('association.chat.joinChat')
                        : t('association.chat.startChat')}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {t('association.chat.timeoutHelp')}
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {t('association.chat.sessionActive')}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-emerald-900">
                      {t('association.chat.joinedAt', {
                        time: formatTime(presence.joined_at),
                      })}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {t('association.chat.timeoutHelp')}
                  </p>
                </>
              )}
            </div>
          </section>

          {presence.joined ? (
            <section className="rounded bg-white shadow">
              <div className="border-b border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('association.chat.activeParticipants')}
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {participants.length}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {participants.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">
                    {t('association.chat.noActiveParticipants')}
                  </p>
                ) : (
                  participants.map(participant => (
                    <div key={participant.user_id} className="p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        {participant.club_name}
                        {participant.is_me ? ` · ${t('common.you')}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {t('association.chat.activeAt', {
                          time: formatTime(participant.last_active_at),
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
