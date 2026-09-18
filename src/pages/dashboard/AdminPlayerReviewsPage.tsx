import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clock3,
  RefreshCw,
  Search,
  Star,
  Trash2,
  User,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type PendingReview = {
  id: string
  user_id: string | null
  reviewer_name: string
  reviewer_email: string
  rating: number
  review_text: string
  status: 'pending'
  moderation_note: string | null
  created_at: string
  updated_at: string
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Stars({ rating }: { rating: number }): JSX.Element {
  const normalized = Math.max(1, Math.min(5, Math.round(Number(rating) || 0)))

  return (
    <div
      className="flex items-center gap-0.5 text-yellow-500"
      aria-label={`${normalized} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={17}
          className={
            index < normalized
              ? 'fill-yellow-400 text-yellow-500'
              : 'text-gray-300'
          }
        />
      ))}
    </div>
  )
}

export default function AdminPlayerReviewsPage(): JSX.Element {
  const [reviews, setReviews] = useState<PendingReview[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadReviews = useCallback(async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true)
    }

    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'admin_get_homepage_review_queue_v1',
      )

      if (rpcError) {
        throw rpcError
      }

      const nextReviews = Array.isArray(data)
        ? (data as PendingReview[])
        : []

      setReviews(nextReviews)

      setSelectedId(currentId => {
        if (
          currentId &&
          nextReviews.some(review => review.id === currentId)
        ) {
          return currentId
        }

        return nextReviews[0]?.id ?? null
      })
    } catch (loadError: any) {
      console.error('Failed to load player review queue:', loadError)
      setReviews([])
      setSelectedId(null)
      setError(
        loadError?.message ??
          'The player review moderation queue could not be loaded.',
      )
    } finally {
      if (showSpinner) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadReviews()

    const channel = supabase
      .channel('admin-player-review-page')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'homepage_player_reviews',
        },
        () => {
          void loadReviews(false)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadReviews])

  const filteredReviews = useMemo(() => {
    const needle = search.trim().toLowerCase()

    if (!needle) {
      return reviews
    }

    return reviews.filter(review =>
      [
        review.reviewer_name,
        review.reviewer_email,
        review.review_text,
        review.user_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [reviews, search])

  const selectedReview = useMemo(
    () => reviews.find(review => review.id === selectedId) ?? null,
    [reviews, selectedId],
  )

  const moderateReview = useCallback(
    async (review: PendingReview, status: 'approved' | 'rejected') => {
      if (status === 'rejected') {
        const confirmed = window.confirm(
          'Decline this review? It will be permanently deleted and cannot be restored.',
        )

        if (!confirmed) {
          return
        }
      }

      setActing(true)
      setError(null)

      try {
        const { error: rpcError } = await supabase.rpc(
          'admin_moderate_homepage_player_review_v1',
          {
            p_review_id: review.id,
            p_status: status,
            p_moderation_note: null,
          },
        )

        if (rpcError) {
          throw rpcError
        }

        await loadReviews(false)

        window.dispatchEvent(
          new CustomEvent('admin-player-review-count-refresh'),
        )
      } catch (moderationError: any) {
        console.error('Failed to moderate player review:', moderationError)
        setError(
          moderationError?.message ??
            'The review could not be moderated.',
        )
      } finally {
        setActing(false)
      }
    },
    [loadReviews],
  )

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-700">
            Administration
          </div>

          <h1 className="mt-1 flex items-center gap-3 text-3xl font-extrabold text-gray-950">
            <Star size={29} className="fill-yellow-400 text-yellow-500" />
            Player Reviews
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Review player submissions before they appear on the public homepage.
            Approving publishes a review immediately. Declining permanently
            deletes it.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadReviews()}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
            Pending reviews
          </div>
          <div className="mt-2 text-3xl font-extrabold text-gray-950">
            {reviews.length}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
            Moderation rule
          </div>
          <div className="mt-2 text-sm font-semibold leading-6 text-gray-800">
            Approve = publish on homepage · Decline = delete
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[640px] grid-cols-1 gap-5 xl:grid-cols-[minmax(400px,0.85fr)_minmax(560px,1.35fr)]">
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
                placeholder="Search name, email or review…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-yellow-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto">
            {loading ? (
              <div className="p-10 text-center text-sm text-gray-500">
                Loading player reviews…
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-10 text-center">
                <Star size={30} className="text-gray-300" />
                <div>
                  <div className="font-semibold text-gray-800">
                    No pending reviews
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    New submissions will appear here for approval.
                  </div>
                </div>
              </div>
            ) : (
              filteredReviews.map(review => {
                const active = review.id === selectedId

                return (
                  <button
                    type="button"
                    key={review.id}
                    onClick={() => setSelectedId(review.id)}
                    className={[
                      'w-full border-b border-black/5 px-4 py-4 text-left transition-colors last:border-b-0',
                      active ? 'bg-yellow-50' : 'hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                          <div className="truncate font-bold text-gray-950">
                            {review.reviewer_name}
                          </div>
                        </div>

                        <div className="mt-2">
                          <Stars rating={review.rating} />
                        </div>

                        <p className="mt-2 line-clamp-3 text-sm leading-5 text-gray-600">
                          {review.review_text}
                        </p>

                        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                          <Clock3 size={13} />
                          {formatDate(review.created_at)}
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
          {!selectedReview ? (
            <div className="flex min-h-[640px] flex-col items-center justify-center gap-3 p-10 text-center">
              <Star size={38} className="text-gray-300" />
              <div>
                <div className="font-bold text-gray-900">
                  Select a review
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  Open a pending review to approve it for the homepage or
                  decline and delete it.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="border-b border-black/5 px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-red-700">
                      Pending approval
                    </div>

                    <h2 className="mt-3 text-2xl font-extrabold text-gray-950">
                      {selectedReview.reviewer_name}
                    </h2>

                    <div className="mt-2">
                      <Stars rating={selectedReview.rating} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void moderateReview(selectedReview, 'approved')
                      }
                      disabled={acting}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Check size={17} />
                      Approve & publish
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void moderateReview(selectedReview, 'rejected')
                      }
                      disabled={acting}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={17} />
                      Decline & delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6 p-5">
                <div className="grid gap-4 rounded-2xl border border-black/5 bg-gray-50 p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Reviewer
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <User size={15} className="text-gray-400" />
                      {selectedReview.reviewer_name}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Email
                    </div>
                    <div className="mt-1 break-all text-sm text-gray-900">
                      {selectedReview.reviewer_email}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      User ID
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-gray-700">
                      {selectedReview.user_id ?? 'Anonymous / public submission'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Submitted
                    </div>
                    <div className="mt-1 text-sm text-gray-900">
                      {formatDate(selectedReview.created_at)}
                    </div>
                  </div>
                </div>

                <section>
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-gray-500">
                    Player review
                  </div>

                  <div className="mt-2 rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
                    <div className="mb-4">
                      <Stars rating={selectedReview.rating} />
                    </div>

                    <blockquote className="whitespace-pre-wrap text-base leading-8 text-gray-900">
                      “{selectedReview.review_text}”
                    </blockquote>

                    <div className="mt-5 border-t border-yellow-200 pt-4 text-sm font-bold text-gray-900">
                      {selectedReview.reviewer_name}
                    </div>
                  </div>
                </section>

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  Approving this review changes its status to
                  <strong> approved</strong>. The public homepage already loads
                  only approved reviews, so it becomes eligible to display
                  immediately. Declining permanently removes the review from the
                  database.
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
