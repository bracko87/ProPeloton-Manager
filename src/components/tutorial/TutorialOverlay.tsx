// src/components/tutorial/TutorialOverlay.tsx
import React from 'react'
import { createPortal } from 'react-dom'

type TutorialOverlayProps = {
  open: boolean
  title: string
  body: string
  stepLabel?: string
  primaryAction: string
  secondaryAction?: string
  variant?: 'invite' | 'panel'
  onPrimary: () => void
  onSecondary?: () => void
  onClose?: () => void
  primaryDisabled?: boolean
  compact?: boolean
}

export default function TutorialOverlay({
  open,
  title,
  body,
  stepLabel,
  primaryAction,
  secondaryAction,
  variant = 'panel',
  onPrimary,
  onSecondary,
  onClose,
  primaryDisabled = false,
  compact = false,
}: TutorialOverlayProps) {
  if (!open) return null

  if (variant === 'invite') {
    return createPortal(
      <div
        data-tutorial-overlay-panel="true"
        className="fixed right-4 top-28 z-[1000] flex max-w-[calc(100vw-32px)] items-start gap-3"
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <button
            type="button"
            onClick={onPrimary}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-yellow-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-sm font-normal text-yellow-400">
              ?
            </span>

            <span>
              <span className="block text-sm font-normal text-slate-900">
                {title}
              </span>
              <span className="mt-0.5 block max-w-[280px] text-xs leading-5 text-slate-500">
                {body}
              </span>
            </span>
          </button>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {secondaryAction && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                className="text-xs font-normal text-slate-500 hover:text-black hover:underline"
              >
                {secondaryAction}
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled}
              className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-normal text-black shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {primaryAction}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-0 z-[999] bg-black/10" />

      <aside
        data-tutorial-overlay-panel="true"
        className={`fixed right-4 top-24 z-[1000] flex max-h-[calc(100vh-112px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl ${
          compact ? 'w-[360px]' : 'w-[390px]'
        }`}
      >
        <div className="shrink-0 bg-black px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              {stepLabel ? (
                <div className="mb-2 text-xs font-normal uppercase tracking-[0.3em] text-yellow-400">
                  {stepLabel}
                </div>
              ) : null}

              <h3 className="text-xl font-normal leading-7 text-white">
                {title}
              </h3>
            </div>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 text-lg font-normal text-white hover:bg-white/10"
                aria-label="Close tutorial"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={`min-h-0 flex-1 overflow-y-auto ${
            compact ? 'px-5 py-5' : 'px-6 py-6'
          }`}
        >
          <div className="whitespace-pre-line text-sm font-normal leading-7 text-slate-700">
            {body}
          </div>
        </div>

        <div
          className={`shrink-0 border-t border-slate-100 bg-white px-6 py-4 ${
            secondaryAction && onSecondary
              ? 'flex items-center justify-between gap-3'
              : 'flex items-center justify-end'
          }`}
        >
          {secondaryAction && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              className="text-sm font-normal text-slate-500 hover:text-black hover:underline"
            >
              {secondaryAction}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled}
            className="rounded-xl bg-yellow-400 px-5 py-3 text-sm font-normal text-black shadow-sm transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {primaryAction}
          </button>
        </div>
      </aside>
    </>,
    document.body,
  )
}