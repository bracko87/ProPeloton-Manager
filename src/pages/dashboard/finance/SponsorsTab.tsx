/**
 * SponsorsTab.tsx
 * Updated sponsor dashboard UI with:
 * - Main / technical logos shown when real logo_url exists
 * - Broken logos gracefully fall back to initials
 * - Secondary sponsors intentionally shown without logos and without country
 * - Contract coverage simplified to "Until end of Season X"
 * - Optional sponsor descriptions from metadata
 * - Main offer preview goals shown in modal
 * - Main sponsor hero uses one single large logo area with less empty space
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

type SponsorKind = 'main' | 'secondary' | 'technical'

type SignedSponsor = {
  id: string
  company_id: string | null
  name: string
  sponsor_kind: SponsorKind
  slot_no: number | null
  status: string
  country_code: string | null
  logo_url: string | null
  season_number: number
  started_at: string | null
  ends_at: string | null
  signed_game_month: number
  coverage_months: number
  proration_factor: number | string
  full_season_guaranteed_amount: number | string
  full_season_bonus_pool_amount: number | string
  guaranteed_amount: number | string
  bonus_pool_amount: number | string
  monthly_amount: number | string
  technical_discount_pct: number | string | null
  metadata?: Record<string, unknown> | null
}

type SponsorOffer = {
  id: string
  company_id: string
  company_name: string
  company_country_code: string | null
  logo_url: string | null
  sponsor_kind: SponsorKind
  slot_no: number | null
  status: string
  season_number: number
  generated_game_month: number
  coverage_months: number
  proration_factor: number | string
  full_season_guaranteed_amount: number | string
  full_season_bonus_pool_amount: number | string
  guaranteed_amount: number | string
  bonus_pool_amount: number | string
  monthly_amount: number | string
  technical_discount_pct: number | string | null
  expires_at: string | null
  metadata?: Record<string, unknown> | null
}

type SponsorObjective = {
  id: string
  club_sponsor_id: string
  objective_code: string
  title: string
  reward_amount: number | string
  target_value: number
  current_value: number
  country_code: string | null
  status: string
  metadata?: Record<string, unknown> | null
}

type SponsorDashboard = {
  club_id: string
  season_number: number
  game_month: number
  needs_main_sponsor: boolean
  needs_technical_sponsor: boolean
  secondary_slots_used: number
  secondary_slots_total: number
  signed_sponsors: SignedSponsor[]
  offers: SponsorOffer[]
  objectives: SponsorObjective[]
}

type SignResult = {
  signed_sponsor_id: string
  payment_transaction_id: string | null
  accepted_offer_id: string
  signed_kind: SponsorKind
  assigned_slot_no: number | null
  created_objectives: number
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(n: number, currency: 'USD' | 'EUR' = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function getCountryName(countryCode: string | null | undefined): string {
  if (!countryCode) return 'Unknown country'

  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    return displayNames.of(countryCode.toUpperCase()) ?? countryCode.toUpperCase()
  } catch {
    return countryCode.toUpperCase()
  }
}

function getLocalFlagUrl(countryCode: string | null | undefined): string | null {
  if (!countryCode || countryCode.length !== 2) return null
  return `/flags/${countryCode.toLowerCase()}.svg`
}

function getMetadataValue(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getMetadataStringArray(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string[] {
  const value = metadata?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function getSponsorDescription(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  return getMetadataValue(metadata, 'description')
}

function getSponsorPreviewGoals(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  return getMetadataStringArray(metadata, 'preview_focus')
}

function getSponsorLogoUrl(
  sponsorKind: SponsorKind,
  directLogoUrl?: string | null,
  metadata?: Record<string, unknown> | null
): string | null {
  if (sponsorKind === 'secondary') return null

  const metadataLogo = getMetadataValue(metadata, 'logo_url')
  const finalUrl = directLogoUrl || metadataLogo
  if (!finalUrl || finalUrl.trim().length === 0) return null
  return finalUrl
}

function CountryFlagLabel({
  countryCode,
  imageWidth = 22,
  className = '',
}: {
  countryCode: string | null | undefined
  imageWidth?: number
  className?: string
}): JSX.Element {
  const [failed, setFailed] = React.useState(false)
  const src = getLocalFlagUrl(countryCode)
  const countryName = getCountryName(countryCode)

  return (
    <div className={`flex items-center gap-2 text-sm text-gray-600 ${className}`}>
      {!failed && src ? (
        <img
          src={src}
          alt={countryName}
          width={imageWidth}
          className="rounded-sm border object-cover shrink-0"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : null}
      <span>{countryName}</span>
    </div>
  )
}

function formatContractCoverage(seasonNumber: number | null | undefined): string {
  return `Until end of Season ${seasonNumber ?? 1}`
}

function sponsorKindLabel(kind: SponsorKind): string {
  switch (kind) {
    case 'main':
      return 'Main Sponsor'
    case 'secondary':
      return 'Secondary Sponsor'
    case 'technical':
      return 'Technical Sponsor'
    default:
      return kind
  }
}

function getObjectivePercent(objective: SponsorObjective): number {
  const target = Math.max(1, toNumber(objective.target_value))
  const current = Math.max(0, toNumber(objective.current_value))
  return Math.max(0, Math.min(100, (current / target) * 100))
}

function getObjectiveBadge(
  objectiveCode: string
): { label: string; tone: 'blue' | 'green' | 'yellow' } {
  if (objectiveCode.includes('starts')) return { label: 'Participation', tone: 'blue' }
  if (objectiveCode.includes('win') || objectiveCode.includes('podium')) {
    return { label: 'Performance', tone: 'green' }
  }
  if (objectiveCode.includes('top5') || objectiveCode.includes('gc')) {
    return { label: 'Results', tone: 'yellow' }
  }
  return { label: 'Objective', tone: 'blue' }
}

function LogoPlaceholder({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg' | 'hero'
}): JSX.Element {
  const [failed, setFailed] = React.useState(false)

  const initials = name
    .split(' ')
    .map((p) => p.trim()[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const sizeClass =
    size === 'hero'
      ? 'w-full h-full text-7xl rounded-none'
      : size === 'lg'
        ? 'w-24 h-24 text-xl rounded-xl'
        : size === 'sm'
          ? 'w-10 h-10 text-xs rounded-md'
          : 'w-14 h-14 text-sm rounded-xl'

  const paddingClass =
    size === 'hero'
      ? 'p-4 md:p-6'
      : size === 'lg'
        ? 'p-3'
        : 'p-2'

  const showImage = !!logoUrl && !failed

  return (
    <div
      className={[
        sizeClass,
        'bg-gray-100 border flex items-center justify-center overflow-hidden shrink-0',
      ].join(' ')}
    >
      {showImage ? (
        <img
          src={logoUrl}
          alt={name}
          className={`w-full h-full object-contain ${paddingClass}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-semibold text-gray-600">{initials}</span>
      )}
    </div>
  )
}

function StatusPill({
  label,
  tone = 'gray',
}: {
  label: string
  tone?: 'gray' | 'green' | 'yellow' | 'blue' | 'red'
}): JSX.Element {
  const classes =
    tone === 'green'
      ? 'bg-green-50 text-green-700 border-green-200'
      : tone === 'yellow'
        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
        : tone === 'blue'
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : tone === 'red'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'px-3 py-2 rounded-md text-sm font-medium transition border',
        disabled
          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
          : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function ProgressBar({
  value,
  tone = 'blue',
}: {
  value: number
  tone?: 'blue' | 'green' | 'yellow'
}): JSX.Element {
  const fillClass =
    tone === 'green'
      ? 'bg-green-500'
      : tone === 'yellow'
        ? 'bg-yellow-500'
        : 'bg-blue-500'

  return (
    <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
      <div className={`h-full ${fillClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function StatCard({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-lg bg-gray-50 border p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900 mt-1">{value}</div>
    </div>
  )
}

function OfferModal({
  open,
  kind,
  offers,
  currency,
  signingOfferId,
  onClose,
  onSign,
}: {
  open: boolean
  kind: SponsorKind | null
  offers: SponsorOffer[]
  currency: 'USD' | 'EUR'
  signingOfferId: string | null
  onClose: () => void
  onSign: (offerId: string) => Promise<void>
}): JSX.Element | null {
  if (!open || !kind) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-2xl border overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-gray-50">
            <div>
              <div className="text-lg font-semibold">{sponsorKindLabel(kind)} Offers</div>
              <div className="text-sm text-gray-500 mt-1">
                Review the available offers and sign the one that fits your team.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md bg-white border text-sm hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <div className="p-6">
            {offers.length === 0 ? (
              <div className="text-sm text-gray-600">No offers available for this sponsor category.</div>
            ) : (
              <div className="space-y-4">
                {offers.map((offer) => {
                  const guaranteed = toNumber(offer.guaranteed_amount)
                  const bonus = toNumber(offer.bonus_pool_amount)
                  const monthly = toNumber(offer.monthly_amount)
                  const discount =
                    offer.technical_discount_pct !== null ? Number(offer.technical_discount_pct) : null
                  const description = getSponsorDescription(offer.metadata)
                  const previewGoals = getSponsorPreviewGoals(offer.metadata)
                  const resolvedLogoUrl = getSponsorLogoUrl(
                    offer.sponsor_kind,
                    offer.logo_url,
                    offer.metadata
                  )

                  return (
                    <div key={offer.id} className="border rounded-xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                          {offer.sponsor_kind !== 'secondary' && (
                            <LogoPlaceholder
                              name={offer.company_name}
                              logoUrl={resolvedLogoUrl}
                              size="lg"
                            />
                          )}

                          <div className="min-w-0">
                            <div className="font-semibold text-lg truncate">{offer.company_name}</div>

                            <div className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                              {offer.sponsor_kind !== 'secondary' && (
                                <CountryFlagLabel countryCode={offer.company_country_code} imageWidth={20} />
                              )}
                              <span>{sponsorKindLabel(offer.sponsor_kind)}</span>
                            </div>

                            {description && offer.sponsor_kind !== 'secondary' && (
                              <div className="text-sm text-gray-500 mt-2">{description}</div>
                            )}

                            <div className="flex flex-wrap gap-2 mt-3">
                              <StatusPill label={`Season ${offer.season_number}`} tone="blue" />
                              <StatusPill label={`Factor ${toNumber(offer.proration_factor).toFixed(2)}`} />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void onSign(offer.id)}
                          disabled={signingOfferId === offer.id}
                          className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm hover:bg-black disabled:opacity-60"
                        >
                          {signingOfferId === offer.id ? 'Signing…' : 'Sign offer'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-5">
                        <StatCard label="Guaranteed" value={formatMoney(guaranteed, currency)} />
                        <StatCard
                          label={offer.sponsor_kind === 'main' ? 'Bonus pool' : 'Monthly equivalent'}
                          value={
                            offer.sponsor_kind === 'main'
                              ? formatMoney(bonus, currency)
                              : formatMoney(monthly, currency)
                          }
                        />
                        <StatCard
                          label="Contract Coverage"
                          value={formatContractCoverage(offer.season_number)}
                        />
                        <StatCard
                          label={offer.sponsor_kind === 'technical' ? 'Discount' : 'Details'}
                          value={
                            offer.sponsor_kind === 'technical'
                              ? discount !== null
                                ? `${discount.toFixed(2)}%`
                                : 'Future perk'
                              : offer.sponsor_kind === 'secondary'
                                ? 'Supporting sponsor'
                                : getCountryName(offer.company_country_code)
                          }
                        />
                      </div>

                      {offer.sponsor_kind === 'main' && (
                        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900">
                          <div className="font-medium">Main sponsor package</div>
                          <div className="mt-1">
                            Main sponsor deals include guaranteed money now and bonus money later through objectives.
                          </div>

                          {previewGoals.length > 0 && (
                            <div className="mt-3">
                              <div className="font-medium mb-2">Preview goals</div>
                              <ul className="list-disc pl-5 space-y-1">
                                {previewGoals.map((goal, index) => (
                                  <li key={`${offer.id}-goal-${index}`}>{goal}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {offer.sponsor_kind === 'secondary' && (
                        <div className="mt-4 rounded-lg bg-gray-50 border p-4 text-sm text-gray-700">
                          Secondary sponsors have no objectives in v1 and simply add more seasonal income.
                        </div>
                      )}

                      {offer.sponsor_kind === 'technical' && (
                        <div className="mt-4 rounded-lg bg-gray-50 border p-4 text-sm text-gray-700">
                          Technical sponsor rewards currently include guaranteed contract income. Discount/perk systems are prepared for future equipment integration.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ObjectiveCard({
  objective,
  currency,
}: {
  objective: SponsorObjective
  currency: 'USD' | 'EUR'
}): JSX.Element {
  const percent = getObjectivePercent(objective)
  const completed = objective.status === 'completed'
  const failed = objective.status === 'failed'
  const badge = getObjectiveBadge(objective.objective_code)

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-gray-900">{objective.title}</div>
          <div className="mt-2">
            <StatusPill label={badge.label} tone={badge.tone} />
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Progress: {objective.current_value}/{objective.target_value}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-green-700">
            {formatMoney(toNumber(objective.reward_amount), currency)}
          </div>
          <div className="mt-2">
            <StatusPill
              label={completed ? 'Completed' : failed ? 'Failed' : 'Active'}
              tone={completed ? 'green' : failed ? 'red' : 'blue'}
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar value={percent} tone={completed ? 'green' : 'blue'} />
        <div className="text-xs text-gray-500 mt-2">{percent.toFixed(0)}% complete</div>
      </div>
    </div>
  )
}

function MainSponsorHero({
  sponsor,
  objectives,
  canOpenOffers,
  onOpenOffers,
  currency,
}: {
  sponsor: SignedSponsor | null
  objectives: SponsorObjective[]
  canOpenOffers: boolean
  onOpenOffers: () => void
  currency: 'USD' | 'EUR'
}): JSX.Element {
  const resolvedLogoUrl = sponsor
    ? getSponsorLogoUrl(sponsor.sponsor_kind, sponsor.logo_url, sponsor.metadata)
    : null

  const description = sponsor ? getSponsorDescription(sponsor.metadata) : null

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b bg-gray-50">
        <div>
          <div className="font-semibold text-lg">Main Sponsor</div>
          <div className="text-sm text-gray-500 mt-1">
            Your primary seasonal partner and biggest sponsorship income.
          </div>
        </div>

        <ActionButton label="View Offers" disabled={!canOpenOffers} onClick={onOpenOffers} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5">
        <div className="xl:col-span-3 p-5">
          {sponsor ? (
            <div className="h-full">
              <div>
                <div className="text-2xl font-bold text-gray-900">{sponsor.name}</div>

                <CountryFlagLabel
                  countryCode={sponsor.country_code}
                  imageWidth={24}
                  className="mt-3"
                />

                {description && (
                  <div className="text-sm text-gray-500 mt-3">{description}</div>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  <StatusPill label="Signed" tone="green" />
                  <StatusPill label={`Season ${sponsor.season_number}`} tone="blue" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
                <StatCard
                  label="Guaranteed Payment"
                  value={formatMoney(toNumber(sponsor.guaranteed_amount), currency)}
                />
                <StatCard
                  label="Bonus Pool"
                  value={formatMoney(toNumber(sponsor.bonus_pool_amount), currency)}
                />
                <StatCard
                  label="Contract Coverage"
                  value={formatContractCoverage(sponsor.season_number)}
                />
              </div>

              <div className="mt-5 rounded-2xl border bg-gradient-to-br from-gray-50 to-white overflow-hidden">
                <div className="h-[320px] md:h-[420px]">
                  {resolvedLogoUrl ? (
                    <img
                      src={resolvedLogoUrl}
                      alt={sponsor.name}
                      className="w-full h-full object-contain p-4 md:p-6"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <div className="text-7xl md:text-8xl font-semibold text-gray-500">
                        {sponsor.name
                          .split(' ')
                          .map((p) => p.trim()[0] ?? '')
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center rounded-xl border border-dashed p-6 bg-gray-50">
              <div className="text-lg font-semibold text-gray-900">No Main Sponsor Signed</div>
              <div className="text-sm text-gray-600 mt-2">
                Choose one main sponsor to secure your biggest seasonal sponsorship deal.
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-2 border-t xl:border-t-0 xl:border-l bg-gray-50/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Main Sponsor Objectives</div>
              <div className="text-sm text-gray-500 mt-1">
                Track bonus progress for the current main sponsor.
              </div>
            </div>
            <StatusPill label={`${objectives.length} objective(s)`} tone="blue" />
          </div>

          <div className="mt-4 space-y-3">
            {!sponsor ? (
              <div className="rounded-xl border border-dashed bg-white p-4 text-sm text-gray-600">
                Objectives will appear here after you sign a main sponsor.
              </div>
            ) : objectives.length === 0 ? (
              <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
                No objectives found for the current sponsor.
              </div>
            ) : (
              objectives.map((objective) => (
                <ObjectiveCard key={objective.id} objective={objective} currency={currency} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SecondarySponsorPanel({
  signedSponsors,
  usedSlots,
  totalSlots,
  canOpenOffers,
  onOpenOffers,
  currency,
}: {
  signedSponsors: SignedSponsor[]
  usedSlots: number
  totalSlots: number
  canOpenOffers: boolean
  onOpenOffers: () => void
  currency: 'USD' | 'EUR'
}): JSX.Element {
  const progress = totalSlots > 0 ? (usedSlots / totalSlots) * 100 : 0

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b bg-gray-50">
        <div>
          <div className="font-semibold text-lg">Secondary Sponsors</div>
          <div className="text-sm text-gray-500 mt-1">
            Up to three supporting sponsor deals per season.
          </div>
        </div>

        <ActionButton label="View Offers" disabled={!canOpenOffers} onClick={onOpenOffers} />
      </div>

      <div className="p-5">
        <div className="rounded-xl border bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-gray-700">Slot Usage</div>
            <StatusPill label={`${usedSlots}/${totalSlots} filled`} tone={usedSlots > 0 ? 'blue' : 'gray'} />
          </div>
          <div className="mt-3">
            <ProgressBar value={progress} tone="blue" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-5">
          {[1, 2, 3].map((slot) => {
            const sponsor = signedSponsors.find((s) => s.slot_no === slot)

            return (
              <div key={slot} className="rounded-xl border p-4 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-gray-900">Slot {slot}</div>
                  {sponsor ? <StatusPill label="Signed" tone="green" /> : <StatusPill label="Empty" />}
                </div>

                {sponsor ? (
                  <div className="mt-4">
                    <div className="min-w-0">
                      <div className="font-semibold">{sponsor.name}</div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 mt-4">
                      <StatCard
                        label="Guaranteed"
                        value={formatMoney(toNumber(sponsor.guaranteed_amount), currency)}
                      />
                      <StatCard
                        label="Contract Coverage"
                        value={formatContractCoverage(sponsor.season_number)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-gray-600">
                    No sponsor assigned to this slot yet.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TechnicalSponsorPanel({
  sponsor,
  canOpenOffers,
  onOpenOffers,
  currency,
}: {
  sponsor: SignedSponsor | null
  canOpenOffers: boolean
  onOpenOffers: () => void
  currency: 'USD' | 'EUR'
}): JSX.Element {
  const discount =
    sponsor?.technical_discount_pct !== null && sponsor?.technical_discount_pct !== undefined
      ? Number(sponsor.technical_discount_pct)
      : null

  const resolvedLogoUrl = sponsor
    ? getSponsorLogoUrl(sponsor.sponsor_kind, sponsor.logo_url, sponsor.metadata)
    : null

  const description = sponsor ? getSponsorDescription(sponsor.metadata) : null

  return (
    <div className="bg-white rounded-xl shadow border overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b bg-gray-50">
        <div>
          <div className="font-semibold text-lg">Technical Sponsor</div>
          <div className="text-sm text-gray-500 mt-1">
            Equipment partnership foundation with future discounts and usage bonuses.
          </div>
        </div>

        <ActionButton label="View Offers" disabled={!canOpenOffers} onClick={onOpenOffers} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5">
        <div className="xl:col-span-3 p-5">
          {sponsor ? (
            <div>
              <div className="flex items-start gap-4">
                <LogoPlaceholder name={sponsor.name} logoUrl={resolvedLogoUrl} size="lg" />
                <div>
                  <div className="text-xl font-bold text-gray-900">{sponsor.name}</div>
                  <CountryFlagLabel
                    countryCode={sponsor.country_code}
                    imageWidth={24}
                    className="mt-2"
                  />

                  {description && (
                    <div className="text-sm text-gray-500 mt-3">{description}</div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-4">
                    <StatusPill label="Signed" tone="green" />
                    {discount !== null ? (
                      <StatusPill label={`${discount.toFixed(2)}% discount`} tone="blue" />
                    ) : (
                      <StatusPill label="Future perk" />
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
                <StatCard
                  label="Guaranteed Payment"
                  value={formatMoney(toNumber(sponsor.guaranteed_amount), currency)}
                />
                <StatCard
                  label="Perk"
                  value={discount !== null ? `${discount.toFixed(2)}% discount` : 'Future perk'}
                />
                <StatCard
                  label="Contract Coverage"
                  value={formatContractCoverage(sponsor.season_number)}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 bg-gray-50">
              <div className="text-lg font-semibold text-gray-900">No Technical Sponsor Signed</div>
              <div className="text-sm text-gray-600 mt-2">
                Sign a technical sponsor to prepare future equipment discounts and usage-based bonuses.
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-2 border-t xl:border-t-0 xl:border-l bg-gray-50/70 p-5">
          <div className="font-semibold">Perk Status</div>
          <div className="text-sm text-gray-500 mt-1">
            Technical sponsor effects are partly visual now and ready for equipment integration later.
          </div>

          <div className="space-y-3 mt-4">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Guaranteed Contract Income</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Technical sponsors already pay guaranteed money when signed.
                  </div>
                </div>
                <StatusPill label={sponsor ? 'Active' : 'Locked'} tone={sponsor ? 'green' : 'gray'} />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Equipment Discount</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Discount values are stored and ready for future equipment/shop integration.
                  </div>
                </div>
                <StatusPill label={discount !== null ? 'Ready' : 'Future'} tone={discount !== null ? 'green' : 'yellow'} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SponsorsTab({
  clubId,
  currency = 'USD',
}: {
  clubId: string
  currency?: 'USD' | 'EUR'
}): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [dashboard, setDashboard] = useState<SponsorDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signingOfferId, setSigningOfferId] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [offersModalKind, setOffersModalKind] = useState<SponsorKind | null>(null)

  const loadDashboard = useCallback(async (): Promise<void> => {
    setError(null)

    const refreshRes = await supabase.rpc('sponsor_refresh_daily_offers', {
      p_club_id: clubId,
    })

    if (refreshRes.error) {
      setDashboard(null)
      setError(refreshRes.error.message ?? 'Failed to refresh sponsor offers.')
      return
    }

    const dashboardRes = await supabase.rpc('sponsor_get_dashboard', {
      p_club_id: clubId,
    })

    if (dashboardRes.error) {
      setDashboard(null)
      setError(dashboardRes.error.message ?? 'Failed to load sponsor dashboard.')
      return
    }

    setDashboard((dashboardRes.data ?? null) as SponsorDashboard | null)
  }, [clubId])

  const generateIfNeeded = useCallback(async (): Promise<void> => {
    setGenerating(true)
    setError(null)

    const genRes = await supabase.rpc('sponsor_generate_offers', {
      p_club_id: clubId,
      p_force: false,
    })

    setGenerating(false)

    if (genRes.error) {
      setError(genRes.error.message ?? 'Failed to generate sponsor offers.')
      return
    }

    await loadDashboard()
  }, [clubId, loadDashboard])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)
      setBanner(null)
      await loadDashboard()
      if (!mounted) return
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [loadDashboard])

  useEffect(() => {
    if (!dashboard) return

    const shouldGenerate =
      dashboard.signed_sponsors.length === 0 && dashboard.offers.length === 0 && !generating

    if (shouldGenerate) {
      void generateIfNeeded()
    }
  }, [dashboard, generateIfNeeded, generating])

  const signedMain = useMemo(
    () => dashboard?.signed_sponsors.find((s) => s.sponsor_kind === 'main') ?? null,
    [dashboard]
  )

  const signedTechnical = useMemo(
    () => dashboard?.signed_sponsors.find((s) => s.sponsor_kind === 'technical') ?? null,
    [dashboard]
  )

  const signedSecondary = useMemo(
    () =>
      [...(dashboard?.signed_sponsors ?? [])]
        .filter((s) => s.sponsor_kind === 'secondary')
        .sort((a, b) => (a.slot_no ?? 99) - (b.slot_no ?? 99)),
    [dashboard]
  )

  const mainOffers = useMemo(
    () => dashboard?.offers.filter((o) => o.sponsor_kind === 'main') ?? [],
    [dashboard]
  )

  const secondaryOffers = useMemo(
    () => dashboard?.offers.filter((o) => o.sponsor_kind === 'secondary') ?? [],
    [dashboard]
  )

  const technicalOffers = useMemo(
    () => dashboard?.offers.filter((o) => o.sponsor_kind === 'technical') ?? [],
    [dashboard]
  )

  const mainObjectives = useMemo(() => {
    if (!signedMain || !dashboard) return []
    return [...dashboard.objectives]
      .filter((o) => o.club_sponsor_id === signedMain.id)
      .sort((a, b) => toNumber(b.reward_amount) - toNumber(a.reward_amount))
  }, [dashboard, signedMain])

  const modalOffers = useMemo(() => {
    if (offersModalKind === 'main') return mainOffers
    if (offersModalKind === 'secondary') return secondaryOffers
    if (offersModalKind === 'technical') return technicalOffers
    return []
  }, [offersModalKind, mainOffers, secondaryOffers, technicalOffers])

  const canOpenMainOffers = !!dashboard && dashboard.needs_main_sponsor && mainOffers.length > 0
  const canOpenSecondaryOffers =
    !!dashboard &&
    dashboard.secondary_slots_used < dashboard.secondary_slots_total &&
    secondaryOffers.length > 0
  const canOpenTechnicalOffers =
    !!dashboard && dashboard.needs_technical_sponsor && technicalOffers.length > 0

  async function handleSignOffer(offerId: string): Promise<void> {
    setSigningOfferId(offerId)
    setError(null)
    setBanner(null)

    const res = await supabase.rpc('sponsor_sign_offer', {
      p_offer_id: offerId,
    })

    setSigningOfferId(null)

    if (res.error) {
      setError(res.error.message ?? 'Failed to sign sponsor offer.')
      return
    }

    const row = Array.isArray(res.data) ? ((res.data[0] ?? null) as SignResult | null) : null

    if (row) {
      if (row.signed_kind === 'main') {
        setBanner(`Main sponsor signed. ${row.created_objectives} objective(s) created.`)
      } else if (row.signed_kind === 'secondary') {
        setBanner(`Secondary sponsor signed into slot ${row.assigned_slot_no ?? '—'}.`)
      } else {
        setBanner('Technical sponsor signed successfully.')
      }
    } else {
      setBanner('Sponsor contract signed successfully.')
    }

    setOffersModalKind(null)
    await loadDashboard()
  }

  return (
    <div className="space-y-4">
      <OfferModal
        open={offersModalKind !== null}
        kind={offersModalKind}
        offers={modalOffers}
        currency={currency}
        signingOfferId={signingOfferId}
        onClose={() => setOffersModalKind(null)}
        onSign={handleSignOffer}
      />

      {loading && (
        <div className="bg-white p-4 rounded shadow text-sm text-gray-600">Loading sponsor dashboard…</div>
      )}

      {!loading && error && (
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm font-semibold text-red-600">Error</div>
          <div className="text-sm text-gray-700 mt-1">{error}</div>
        </div>
      )}

      {!loading && banner && (
        <div className="bg-white p-4 rounded shadow border border-green-200">
          <div className="text-sm font-semibold text-green-700">Updated</div>
          <div className="text-sm text-gray-700 mt-1">{banner}</div>
        </div>
      )}

      {!loading && !error && dashboard && (
        <>
          <div className="bg-white p-4 rounded shadow">
            <div className="font-semibold">Sponsor Status</div>
            <div className="text-sm text-gray-500 mt-1">
              Season {dashboard.season_number} · Game month {dashboard.game_month}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
              <div className="rounded-xl bg-gray-50 border p-4">
                <div className="text-gray-500">Main sponsor</div>
                <div className="font-semibold mt-2">
                  {dashboard.needs_main_sponsor ? 'Needed' : 'Signed'}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 border p-4">
                <div className="text-gray-500">Secondary sponsors</div>
                <div className="font-semibold mt-2">
                  {dashboard.secondary_slots_used}/{dashboard.secondary_slots_total}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 border p-4">
                <div className="text-gray-500">Technical sponsor</div>
                <div className="font-semibold mt-2">
                  {dashboard.needs_technical_sponsor ? 'Needed' : 'Signed'}
                </div>
              </div>
            </div>
          </div>

          <MainSponsorHero
            sponsor={signedMain}
            objectives={mainObjectives}
            currency={currency}
            canOpenOffers={canOpenMainOffers}
            onOpenOffers={() => setOffersModalKind('main')}
          />

          <SecondarySponsorPanel
            signedSponsors={signedSecondary}
            usedSlots={dashboard.secondary_slots_used}
            totalSlots={dashboard.secondary_slots_total}
            currency={currency}
            canOpenOffers={canOpenSecondaryOffers}
            onOpenOffers={() => setOffersModalKind('secondary')}
          />

          <TechnicalSponsorPanel
            sponsor={signedTechnical}
            currency={currency}
            canOpenOffers={canOpenTechnicalOffers}
            onOpenOffers={() => setOffersModalKind('technical')}
          />

          {dashboard.offers.length === 0 && dashboard.signed_sponsors.length === 0 && !generating && (
            <div className="bg-white p-4 rounded shadow">
              <div className="font-semibold">Sponsors</div>
              <div className="text-sm text-gray-600 mt-2">
                No sponsors or offers are available right now.
              </div>
            </div>
          )}

          {generating && (
            <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
              Generating sponsor offers…
            </div>
          )}
        </>
      )}
    </div>
  )
}