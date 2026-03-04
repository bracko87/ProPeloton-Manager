'use client'

/**
 * Inbox.tsx
 * Real inbox page connected to Supabase RPCs.
 * Updated to resolve the Supabase client at runtime (not at module load),
 * which is safer in preview/build environments.
 */

import React from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type RuntimeEnv = Record<string, string | undefined>

type GlobalWithEnv = typeof globalThis & {
  __ENV__?: RuntimeEnv
  ENV?: RuntimeEnv
  __APP_ENV__?: RuntimeEnv
  __SUPABASE__?: SupabaseClient
  supabase?: SupabaseClient
  process?: {
    env?: RuntimeEnv
  }
}

type Thread = {
  conversation_id: string
  conversation_type: 'direct' | 'admin_direct'
  subject: string | null
  display_name: string
  other_user_id: string | null
  last_message_preview: string | null
  last_message_at: string
  unread_count: number
  can_reply: boolean
}

type InboxMessage = {
  id: string
  conversation_id: string
  sender_user_id: string | null
  sender_kind: 'user' | 'admin' | 'system'
  sender_display_name: string
  body: string
  created_at: string
}

function getRuntimeEnv(): RuntimeEnv {
  const g = globalThis as GlobalWithEnv

  return g.__ENV__ ?? g.ENV ?? g.__APP_ENV__ ?? g.process?.env ?? {}
}

function buildSupabaseClient(): SupabaseClient | null {
  const g = globalThis as GlobalWithEnv

  if (g.__SUPABASE__) return g.__SUPABASE__
  if (g.supabase) return g.supabase

  const env = getRuntimeEnv()

  const url =
    env.VITE_SUPABASE_URL ??
    env.NEXT_PUBLIC_SUPABASE_URL ??
    (g as unknown as Record<string, string | undefined>).VITE_SUPABASE_URL ??
    (g as unknown as Record<string, string | undefined>).NEXT_PUBLIC_SUPABASE_URL ??
    null

  const anonKey =
    env.VITE_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    (g as unknown as Record<string, string | undefined>).VITE_SUPABASE_ANON_KEY ??
    (g as unknown as Record<string, string | undefined>).NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    null

  if (!url || !anonKey) {
    return null
  }

  try {
    const client = createClient(url, anonKey)
    g.__SUPABASE__ = client
    return client
  } catch {
    return null
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return ''

  const d = new Date(value)

  if (Number.isNaN(d.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export default function InboxPage(): JSX.Element {
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [clientReady, setClientReady] = React.useState(false)
  const [authChecked, setAuthChecked] = React.useState(false)

  const [threads, setThreads] = React.useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<InboxMessage[]>([])

  const [search, setSearch] = React.useState('')
  const [draft, setDraft] = React.useState('')

  const [loadingThreads, setLoadingThreads] = React.useState(true)
  const [loadingMessages, setLoadingMessages] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const getClient = React.useCallback((): SupabaseClient | null => {
    const client = buildSupabaseClient()
    setClientReady(!!client)
    return client
  }, [])

  const activeThread = React.useMemo(
    () => threads.find(t => t.conversation_id === activeThreadId) ?? null,
    [threads, activeThreadId]
  )

  const filteredThreads = React.useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return threads

    return threads.filter(thread => {
      return (
        thread.display_name.toLowerCase().includes(q) ||
        (thread.subject ?? '').toLowerCase().includes(q) ||
        (thread.last_message_preview ?? '').toLowerCase().includes(q)
      )
    })
  }, [threads, search])

  const loadThreads = React.useCallback(async () => {
    const client = getClient()

    if (!client) {
      setError(
        'Supabase client is not available in this runtime. This page should use the same shared Supabase client as your app auth.'
      )
      setLoadingThreads(false)
      return
    }

    setLoadingThreads(true)
    setError(null)

    try {
      const { data, error: rpcError } = await client.rpc('inbox_list_threads')

      if (rpcError) {
        setError(rpcError.message)
        setThreads([])
        setActiveThreadId(null)
        return
      }

      const nextThreads = (data ?? []) as Thread[]
      setThreads(nextThreads)

      setActiveThreadId(current => {
        if (current && nextThreads.some(t => t.conversation_id === current)) {
          return current
        }

        return nextThreads[0]?.conversation_id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations.')
      setThreads([])
      setActiveThreadId(null)
    } finally {
      setLoadingThreads(false)
    }
  }, [getClient])

  const loadMessages = React.useCallback(
    async (conversationId: string) => {
      const client = getClient()

      if (!client) {
        return
      }

      setLoadingMessages(true)
      setError(null)

      try {
        const { data, error: rpcError } = await client.rpc('inbox_get_messages', {
          p_conversation_id: conversationId
        })

        if (rpcError) {
          setError(rpcError.message)
          setMessages([])
          return
        }

        setMessages((data ?? []) as InboxMessage[])

        await client.rpc('inbox_mark_conversation_read', {
          p_conversation_id: conversationId
        })

        setThreads(current =>
          current.map(thread =>
            thread.conversation_id === conversationId
              ? { ...thread, unread_count: 0 }
              : thread
          )
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages.')
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    },
    [getClient]
  )

  React.useEffect(() => {
    let mounted = true

    void (async () => {
      const client = getClient()

      if (!client) {
        if (!mounted) return
        setError(
          'Supabase client not detected. Use your existing shared Supabase client in this page so auth/session is shared.'
        )
        setLoadingThreads(false)
        setAuthChecked(true)
        return
      }

      try {
        const {
          data: { user },
          error: userError
        } = await client.auth.getUser()

        if (!mounted) return

        if (userError || !user) {
          setCurrentUserId(null)
          setError('You must be signed in to view your inbox.')
          setLoadingThreads(false)
          setAuthChecked(true)
          return
        }

        setCurrentUserId(user.id)
        setAuthChecked(true)
        await loadThreads()
      } catch (err) {
        if (!mounted) return
        setCurrentUserId(null)
        setError(err instanceof Error ? err.message : 'Failed to initialize inbox.')
        setLoadingThreads(false)
        setAuthChecked(true)
      }
    })()

    return () => {
      mounted = false
    }
  }, [getClient, loadThreads])

  React.useEffect(() => {
    if (!activeThreadId) {
      setMessages([])
      return
    }

    void loadMessages(activeThreadId)
  }, [activeThreadId, loadMessages])

  function handleSelectThread(threadId: string) {
    setActiveThreadId(threadId)
  }

  async function handleRefresh() {
    await loadThreads()
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()

    const client = getClient()

    if (!client) {
      setError('Supabase client is not available.')
      return
    }

    if (!activeThread || !activeThread.can_reply || !draft.trim() || sending) {
      return
    }

    setSending(true)
    setError(null)

    try {
      const { error: rpcError } = await client.rpc('inbox_send_message', {
        p_conversation_id: activeThread.conversation_id,
        p_body: draft.trim()
      })

      if (rpcError) {
        setError(rpcError.message)
        return
      }

      setDraft('')
      await loadMessages(activeThread.conversation_id)
      await loadThreads()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inbox</h1>
          <p className="mt-1 text-sm text-slate-500">
            Private conversations and admin inbox messages.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRefresh()}
          className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Client
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {clientReady ? 'Available' : 'Not detected'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Auth user
          </div>
          <div className="mt-1 break-all text-sm font-medium text-slate-900">
            {authChecked ? currentUserId ?? 'Not signed in' : 'Checking...'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Loaded threads
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">{threads.length}</div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[calc(100vh-180px)] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
        <aside className="border-r border-slate-200 bg-slate-50/80">
          <div className="border-b border-slate-200 p-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
            {loadingThreads ? (
              <div className="p-5 text-sm text-slate-500">Loading conversations...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                {!clientReady
                  ? 'Supabase client not detected.'
                  : !currentUserId
                  ? 'No authenticated user in this page.'
                  : search.trim()
                  ? 'No conversations found.'
                  : 'No conversations for this account yet.'}
              </div>
            ) : (
              filteredThreads.map(thread => {
                const isActive = thread.conversation_id === activeThreadId

                return (
                  <button
                    key={thread.conversation_id}
                    onClick={() => handleSelectThread(thread.conversation_id)}
                    className={`w-full border-b border-slate-200 px-4 py-4 text-left transition ${
                      isActive ? 'bg-white' : 'hover:bg-white/70'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          thread.conversation_type === 'admin_direct'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {thread.conversation_type === 'admin_direct'
                          ? 'AD'
                          : getInitials(thread.display_name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {thread.display_name}
                          </div>
                          <div className="shrink-0 text-[11px] text-slate-400">
                            {formatDateTime(thread.last_message_at)}
                          </div>
                        </div>

                        {thread.subject ? (
                          <div className="mt-0.5 truncate text-xs font-medium text-slate-600">
                            {thread.subject}
                          </div>
                        ) : null}

                        <div className="mt-1 truncate text-sm text-slate-500">
                          {thread.last_message_preview ?? 'No messages yet'}
                        </div>
                      </div>

                      {thread.unread_count > 0 ? (
                        <div className="ml-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 text-[11px] font-semibold text-white">
                          {thread.unread_count}
                        </div>
                      ) : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-180px)] flex-col">
          {!activeThread ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <div>
                <div className="text-base font-medium text-slate-900">
                  No conversation selected
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {threads.length > 0
                    ? 'Choose a thread from the left sidebar.'
                    : 'Once a thread is visible on the left, open it here.'}
                </div>
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold ${
                      activeThread.conversation_type === 'admin_direct'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {activeThread.conversation_type === 'admin_direct'
                      ? 'AD'
                      : getInitials(activeThread.display_name)}
                  </div>

                  <div>
                    <div className="font-semibold text-slate-900">
                      {activeThread.display_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {activeThread.subject ||
                        (activeThread.can_reply
                          ? 'Direct conversation'
                          : 'Admin message thread')}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  {activeThread.can_reply ? 'Replies enabled' : 'Read only'}
                </div>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto bg-white px-5 py-5">
                {loadingMessages ? (
                  <div className="text-sm text-slate-500">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                    No messages yet.
                  </div>
                ) : (
                  messages.map(message => {
                    const isMine =
                      message.sender_kind === 'user' &&
                      !!currentUserId &&
                      message.sender_user_id === currentUserId

                    const isAdmin = message.sender_kind === 'admin'

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                            isMine
                              ? 'bg-slate-900 text-white'
                              : isAdmin
                              ? 'border border-amber-200 bg-amber-50 text-slate-900'
                              : 'border border-slate-200 bg-slate-50 text-slate-900'
                          }`}
                        >
                          {!isMine ? (
                            <div className="mb-1 text-xs font-semibold opacity-70">
                              {message.sender_display_name}
                            </div>
                          ) : null}

                          <div className="whitespace-pre-wrap text-sm leading-6">
                            {message.body}
                          </div>

                          <div
                            className={`mt-2 text-[11px] ${
                              isMine ? 'text-slate-300' : 'text-slate-400'
                            }`}
                          >
                            {formatDateTime(message.created_at)}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <form onSubmit={handleSendMessage} className="border-t border-slate-200 bg-white p-4">
                {activeThread.can_reply ? (
                  <div className="flex items-end gap-3">
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      placeholder="Write a message..."
                      rows={3}
                      className="min-h-[84px] flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    This is an admin message thread. Replies are currently disabled.
                  </div>
                )}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}