import React from 'react'
import RiderProfilePage from './RiderProfilePage'

import type { TeamType } from '../types'

type RiderProfileRenderVariant = 'modal' | 'page'

type RiderProfileModalProps = {
  open: boolean
  onClose: () => void
  riderId: string | null
  onImageUpdated?: (id: string, imageUrl: string) => void
  gameDate?: string | null
  currentTeamType?: TeamType
  variant?: RiderProfileRenderVariant
  backButtonLabel?: string
}

export default function RiderProfileModal({
  open,
  onClose,
  riderId,
  onImageUpdated: _onImageUpdated,
  gameDate,
  currentTeamType = 'first',
  variant = 'modal',
  backButtonLabel: _backButtonLabel = 'Back',
}: RiderProfileModalProps) {
  if (!open || !riderId) return null

  const content = (
    <div className="mx-auto w-full max-w-7xl">
      <RiderProfilePage
        riderId={riderId}
        gameDate={gameDate}
        currentTeamType={currentTeamType}
        onBack={onClose}
      />
    </div>
  )

  if (variant === 'page') {
    return <div className="min-h-full w-full bg-slate-50 p-4 sm:p-6">{content}</div>
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  )
}