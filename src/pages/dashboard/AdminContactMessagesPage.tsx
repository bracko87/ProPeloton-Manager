import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Clock3,
  ExternalLink,
  Mail,
  MailCheck,
  MailWarning,
  RefreshCw,
  Reply,
  Search,
  User,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type ContactMessageStatus = 'open' | 'archived'
type EmailStatus = 'pending' | 'sent' | 'failed'
type ContactView = 'new' | 'open' | 'archived' | 'all'

type ContactMessage = {
  id: string
  user_id: string | null
  sender_name: string
  sender_email: string
  message: string
  source: string
  email_status: EmailStatus
  resend_email_id: string | null
  delivery_error: string | null
  email_sent_at: string | null
  admin_status: ContactMessageStatus
  archived_at: string | null
  archived_by: string | null
  created_at: string
  updated_at: string
  is_unread: boolean
}

type ContactCounts = {
  total: number
  open: number
  archived: number
  unread: number
  failed_email: number
}

type ContactDashboard = {
  counts: ContactCounts
  messages: ContactMessage[]
}

const EMPTY_COUNTS: ContactCounts = {
  total: 0,
  open: 0,
  archived: 0,
  unread: 0,
  failed_email: 0,
}

const VIEWS: Array<{ key: ContactView; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'open', label: 'Open' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function compactText(value: string, maxLength = 115): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function viewCount(view: ContactView, counts: ContactCounts): number {
  switch (view) {
    case 'new':
      return counts.unread
    case 'open':
      return counts.open
    case 'archived':
      return counts.archived
    default:
      return counts.total
  }
}

function emailStatusClass(status: EmailStatus): string {
  switch (status) {
    case 'sent':
      return 'bg-green-100 text-green-800'
    case 'failed':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-amber-100 text-amber-800'
  }
}

function EmailStatusIcon({ status }: { status: EmailStatus }): JSX.Element {
  if (status === 'sent') {
    return <MailCheck size={15} />
  }

  if (status === 'failed') {
    return <MailWarning size={15} />
  }

  return <Clock3 size={15} />
}

function getRpcView(view: ContactView): 'open' | 'archived' | 'all' {
  if (view === 'archived') return 'archived'
  if (view === 'all') return 'all'
  return 'open'
}

export default function AdminContactMessagesPage(): JSX.Element {
  const [dashboard, setDashboard] = useState<ContactDashboard | null>(null)
  const [view, setView] = useState<ContactView>('new')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMessages = useCallback(
    async (
      nextView: ContactView = view,
      showSpinner = true,
    ): Promise<void> => {
      if (showSpinner) setLoading(true)
      setError(null)

      try {
        const { data, error: rpcError } = await supabase.rpc(
          'get_admin_contact_messages_v1',
          {
            p_view: getRpcView(nextView),
            p_limit: 500,
          },
        )

        if (rpcError) throw rpcError

        const next = (data ?? {
          counts: EMPTY_COUNTS,
          messages: [],
        }) as ContactDashboard

        const nextMessages = Array.isArray(next.messages)
          ? next.messages
          : []

        setDashboard({
          counts: {
            ...EMPTY_COUNTS,
            ...(next.counts ?? {}),
          },
          messages: nextMessages,
        })

        setSelectedId(currentId => {
          if (
            currentId &&
            nextMessages.some(message => message.id === currentId)
          ) {
            return currentId
          }

          const visible = nextView === 'new'
            ? nextMessages.filter(message => message.is_unread)
            : nextMessages

          return visible[0]?.id ?? null
        })
      } catch (loadError: any) {
        console.error('Failed to load contact messages:', loadError)
        setDashboard(null)
        setSelectedId(null)
        setError(
          loadError?.message ??
            'The contact message inbox could not be loaded.',
        )
      } finally {
        if (showSpinner) setLoading(false)
      }
    },
    [view],
  )

  useEffect(() => {
    void loadMessages(view)

    const channel = supabase
      .channel('admin-contact-message-page')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_messages',
        },
        () => {
          void loadMessages(view, false)
        },
      )
      .subscribe()

    const intervalId = window.setInterval(() => {
      void loadMessages(view, false)
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
      void supabase.removeChannel(channel)
    }
  }, [loadMessages, view])

  const counts = dashboard?.counts ?? EMPTY_COUNTS
  const messages = dashboard?.messages ?? []

  const filteredMessages = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return messages.filter(message => {
      if (view === 'new' && !message.is_unread) {
        return false
      }

      if (!needle) return true

      return [
        message.sender_name,
        message.sender_email,
        message.message,
        message.source,
        message.user_id,
        message.resend_email_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [messages, search, view])

  const selectedMessage = useMemo(
    () => messages.find(message => message.id === selectedId) ?? null,
    [messages, selectedId],
  )

  const openMessage = useCallback(
    async (message: ContactMessage): Promise<void> => {
      setSelectedId(message.id)

      if (!message.is_unread) return

      const { error: readError } = await supabase.rpc(
        'mark_admin_contact_message_read_v1',
        {
          p_message_id: message.id,
        },
      )

      if (readError) {
        console.warn('Could not mark contact message as read:', readError)
        return
      }

      setDashboard(current => {
        if (!current) return current

        return {
          ...current,
          counts: {
            ...current.counts,
            unread: Math.max(0, current.counts.unread - 1),
          },
          messages: current.messages.map(item =>
            item.id === message.id
              ? { ...item, is_unread: false }
              : item,
          ),
        }
      })

      window.dispatchEvent(
        new CustomEvent('admin-contact-message-count-refresh'),
      )
    },
    [],
  )

  const setArchived = useCallback(
    async (
      message: ContactMessage,
      archived: boolean,
    ): Promise<void> => {
      setActing(true)
      setError(null)

      try {
        const { error: rpcError } = await supabase.rpc(
          'admin_archive_contact_message_v1',
          {
            p_message_id: message.id,
            p_archived: archived,
          },
        )

        if (rpcError) throw rpcError

        await loadMessages(view, false)

        window.dispatchEvent(
          new CustomEvent('admin-contact-message-count-refresh'),
        )
      } catch (actionError: any) {
        console.error('Failed to update contact message:', actionError)
        setError(
          actionError?.message ??
            'The contact message could not be updated.',
        )
      } finally {
        setActing(false)
      }
    },
    [loadMessages, view],
  )

  const changeView = useCallback((nextView: ContactView) => {
    setView(nextView)
    setSelectedId(null)
  }, [])

  const replyHref = selectedMessage
    ? `mailto:${encodeURIComponent(selectedMessage.sender_email)}?subject=${encodeURIComponent(
        'Re: ProPeloton Manager support request',
      )}`
    : '#'

  return (
    <div className="mx-auto w-full max-w-[1650px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-700">
            Administration
          </div>

          <h1 className="mt-1 flex items-center gap-3 text-3xl font-extrabold text-gray-950">
            <Mail size={30} className="text-yellow-600" />
            Contact Messages
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Private copy of Contact Us submissions. The normal support email is
            still sent through Resend; this inbox makes sure new requests are
            also visible inside the game administration.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadMessages(view)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {VIEWS.map(item => {
          const active = item.key === view

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => changeView(item.key)}
              className={[
                'rounded-2xl border p-4 text-left shadow-sm transition-colors',
                active
                  ? 'border-yellow-400 bg-yellow-50'
                  : 'border-black/10 bg-white hover:bg-gray-50',
              ].join(' ')}
            >
              <div className="text-xs font-bold uppercase tracking-[0.1em] text-gray-500">
                {item.label}
              </div>
              <div className="mt-1 text-2xl font-extrabold text-gray-950">
                {viewCount(item.key, counts)}
              </div>
            </button>
          )
        })}
      </div>

      {counts.failed_email > 0 ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {counts.failed_email} contact message
          {counts.failed_email === 1 ? '' : 's'} could not be delivered by
          email. The message content is still saved here for administrators.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[660px] grid-cols-1 gap-5 xl:grid-cols-[minmax(420px,0.9fr)_minmax(580px,1.4fr)]">
        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/5 p-4">
            <div className="relative">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search sender, email or message…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-yellow-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="max-h-[760px] overflow-y-auto">
            {loading && !dashboard ? (
              <div className="p-10 text-center text-sm text-gray-500">
                Loading contact messages…
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-10 text-center">
                <Mail size={30} className="text-gray-300" />
                <div>
                  <div className="font-semibold text-gray-800">
                    No contact messages in this view
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    New Contact Us submissions will appear here.
                  </div>
                </div>
              </div>
            ) : (
              filteredMessages.map(message => {
                const active = selectedId === message.id

                return (
                  <button
                    type="button"
                    key={message.id}
                    onClick={() => void openMessage(message)}
                    className={[
                      'w-full border-b border-black/5 px-4 py-4 text-left transition-colors last:border-b-0',
                      active ? 'bg-yellow-50' : 'hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5">
                        <span
                          className={[
                            'block h-2.5 w-2.5 rounded-full',
                            message.is_unread ? 'bg-red-500' : 'bg-gray-200',
                          ].join(' ')}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate font-bold text-gray-950">
                            {message.sender_name}
                          </div>

                          {message.is_unread ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-700">
                              New
                            </span>
                          ) : null}

                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${emailStatusClass(
                              message.email_status,
                            )}`}
                          >
                            <EmailStatusIcon status={message.email_status} />
                            Email {message.email_status}
                          </span>
                        </div>

                        <div className="mt-1 truncate text-xs text-gray-500">
                          {message.sender_email}
                        </div>

                        <p className="mt-2 text-sm leading-5 text-gray-700">
                          {compactText(message.message)}
                        </p>

                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-400">
                          <span className="truncate">
                            {message.source}
                          </span>
                          <span className="shrink-0">
                            {formatDate(message.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          {!selectedMessage ? (
            <div className="flex min-h-[660px] flex-col items-center justify-center gap-3 p-10 text-center">
              <Mail size={38} className="text-gray-300" />
              <div>
                <div className="font-bold text-gray-900">
                  Select a contact message
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  Open a message to see the sender, full question and email
                  delivery details.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="border-b border-black/5 px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedMessage.admin_status === 'archived' ? (
                        <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-700">
                          Archived
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-800">
                          Open
                        </span>
                      )}

                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${emailStatusClass(
                          selectedMessage.email_status,
                        )}`}
                      >
                        <EmailStatusIcon status={selectedMessage.email_status} />
                        Email {selectedMessage.email_status}
                      </span>
                    </div>

                    <h2 className="mt-3 text-2xl font-extrabold text-gray-950">
                      {selectedMessage.sender_name}
                    </h2>

                    <div className="mt-1 text-sm text-gray-500">
                      {selectedMessage.sender_email}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={replyHref}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-black"
                    >
                      <Reply size={16} />
                      Reply by email
                    </a>

                    <button
                      type="button"
                      onClick={() =>
                        void setArchived(
                          selectedMessage,
                          selectedMessage.admin_status !== 'archived',
                        )
                      }
                      disabled={acting}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selectedMessage.admin_status === 'archived' ? (
                        <>
                          <ArchiveRestore size={16} />
                          Restore
                        </>
                      ) : (
                        <>
                          <Archive size={16} />
                          Archive
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-5">
                <div className="grid gap-4 rounded-2xl border border-black/5 bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Sender
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <User size={15} className="text-gray-400" />
                      {selectedMessage.sender_name}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Email
                    </div>
                    <div className="mt-1 break-all text-sm text-gray-900">
                      {selectedMessage.sender_email}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Submitted
                    </div>
                    <div className="mt-1 text-sm text-gray-900">
                      {formatDate(selectedMessage.created_at)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Source
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-gray-700">
                      {selectedMessage.source}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      User ID
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-gray-700">
                      {selectedMessage.user_id ?? 'Public / not signed in'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Email sent
                    </div>
                    <div className="mt-1 text-sm text-gray-900">
                      {formatDate(selectedMessage.email_sent_at)}
                    </div>
                  </div>
                </div>

                <section>
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">
                    Contact message
                  </div>

                  <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-base leading-8 text-gray-900">
                    {selectedMessage.message}
                  </div>
                </section>

                <section>
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">
                    Email delivery
                  </div>

                  <div className="mt-2 grid gap-4 rounded-2xl border border-black/5 bg-gray-50 p-4 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                        Status
                      </div>
                      <div
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${emailStatusClass(
                          selectedMessage.email_status,
                        )}`}
                      >
                        <EmailStatusIcon status={selectedMessage.email_status} />
                        {selectedMessage.email_status}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                        Resend email ID
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-gray-700">
                        {selectedMessage.resend_email_id ?? '—'}
                      </div>
                    </div>
                  </div>

                  {selectedMessage.delivery_error ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                      <div className="font-bold">Email delivery error</div>
                      <div className="mt-1 break-words font-mono text-xs">
                        {selectedMessage.delivery_error}
                      </div>
                    </div>
                  ) : null}
                </section>

                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-900">
                  This is an administrator-only copy of the Contact Us
                  submission. The normal support email flow remains active.
                  Archiving only cleans up this admin inbox; it does not delete
                  the message or affect the email that was already sent.
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
