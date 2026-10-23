/**
 * Mountain V2 experimental continuous-contact physics.
 *
 * Synthetic-only until explicitly integrated into the *separate* experimental
 * solver and approved through simulation-only and checkpoint replay tests.
 *
 * Never import from or modify runRaceEngine.ts or its shared physics modules.
 * Group sizes and gaps emerge from travel times, not scripted quotas.
 */
export type MountainV2Effort = 'steady' | 'attack' | 'recover' | 'support'
export type MountainV2Terrain = 'climb' | 'flat' | 'descent'

export interface MountainV2Rider {
  readonly riderId: string
  readonly teamId: string
  readonly climbing: number
  readonly endurance: number
  readonly descending: number
  readonly energy: number
  readonly effort: MountainV2Effort
  /** Physical gap to the current front before this segment, in seconds. */
  readonly gapSeconds: number
}

export interface MountainV2Segment {
  readonly lengthKm: number
  /** Positive for climbing, negative for descent; actual segment grade. */
  readonly gradientPercent: number
  readonly terrain: MountainV2Terrain
}

export interface MountainV2RiderState {
  readonly riderId: string
  readonly teamId: string
  readonly gapSeconds: number
  readonly energy: number
  readonly speedKmh: number
  readonly effort: MountainV2Effort
}

export interface MountainV2PhysicalGroup {
  readonly groupId: string
  readonly riderIds: readonly string[]
  readonly leaderGapSeconds: number
}

export interface MountainV2Checkpoint {
  readonly km: number
  readonly terrain: MountainV2Terrain
  readonly riders: readonly MountainV2RiderState[]
  readonly groups: readonly MountainV2PhysicalGroup[]
}

export interface MountainV2Simulation {
  readonly modelVersion: 'mountain_continuous_contact_v2_prototype'
  readonly checkpoints: readonly MountainV2Checkpoint[]
  readonly finalRiders: readonly MountainV2RiderState[]
  readonly finalGroups: readonly MountainV2PhysicalGroup[]
}

/** A group exists only when arrival gaps are physically near each other. */
const CONTACT_SECONDS = 2.5
const MAX_GROUP_SPREAD_SECONDS = 5

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))
const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000

const supportFor = (
  row: MountainV2Rider,
  others: readonly MountainV2Rider[],
): number =>
  row.effort === 'support' ? 0 :
  others.some((mate) =>
    mate.riderId !== row.riderId &&
    mate.teamId === row.teamId &&
    mate.effort === 'support' &&
    Math.abs(mate.gapSeconds - row.gapSeconds) <= CONTACT_SECONDS
  ) ? 0.65 : 0

export function mountainV2SpeedKmh(
  rider: MountainV2Rider,
  segment: MountainV2Segment,
  supportBonusKmh = 0,
): number {
  const skill = (value: number) => clamp(value, 1, 100)
  const energy = clamp(rider.energy, 0, 100)
  const climb = skill(rider.climbing)
  const endurance = skill(rider.endurance)
  const descending = skill(rider.descending)
  const base = segment.terrain === 'climb'
    ? 21 - (segment.gradientPercent - 5) * 0.75 +
      (climb - 65) * 0.08 + (endurance - 65) * 0.028 +
      (energy - 60) * 0.026
    : segment.terrain === 'descent'
      ? 57 + (descending - 65) * 0.105 +
        (endurance - 65) * 0.018 + (energy - 60) * 0.012
      : 42 + (endurance - 65) * 0.065 +
        (climb - 65) * 0.01 + (energy - 60) * 0.018

  const effortMultiplier =
    rider.effort === 'attack' ? 1.035 :
    rider.effort === 'recover' ? 0.98 :
    rider.effort === 'support' ? 0.994 : 1
  return rounded(clamp((base + supportBonusKmh) * effortMultiplier, 9, 90))
}

/**
 * Energy is a time-based reserve, not a per-kilometre attrition pool. The old
 * calculation drained every Durmitor starter to zero regardless of ability.
 * Speeds have already been resolved when calculating the effort duration.
 */
function energyAfter(
  rider: MountainV2Rider,
  segment: MountainV2Segment,
  effectiveSpeedKmh: number,
): number {
  const hours = segment.lengthKm / effectiveSpeedKmh
  const demandPerHour = segment.terrain === 'climb'
    ? 10 + Math.max(0, segment.gradientPercent) * 0.6
    : segment.terrain === 'descent' ? 3 : 7
  const effortFactor =
    rider.effort === 'attack' ? 1.6 :
    rider.effort === 'support' ? 1.24 :
    rider.effort === 'recover' ? 0.7 : 1
  const enduranceFactor = clamp(1 + (70 - rider.endurance) * 0.005, 0.75, 1.35)
  const recovery = segment.terrain === 'descent'
    ? hours * (rider.effort === 'recover' ? 2.5 : 0.8) : 0
  return rounded(clamp(
    rider.energy - hours * demandPerHour * effortFactor * enduranceFactor + recovery,
    0, 100,
  ))
}

/**
 * Riders in physical contact can maintain a shared pace by drafting or easing
 * effort. Only riders who cannot sustain that pace are dropped. Strong riders
 * can still leave through an attack or sufficient climbing speed superiority.
 * This alters real segment travel speed, never checkpoint gaps directly.
 */
function segmentSpeeds(
  current: readonly MountainV2Rider[],
  segment: MountainV2Segment,
): ReadonlyMap<string, number> {
  const groupStates: MountainV2RiderState[] = current.map(r => ({
    riderId:r.riderId,teamId:r.teamId,gapSeconds:r.gapSeconds,
    energy:r.energy,speedKmh:0,effort:r.effort,
  }))
  const groups = mountainV2PhysicalGroups(groupStates)
  const raw = new Map(current.map(r => [
    r.riderId, mountainV2SpeedKmh(r, segment, supportFor(r,current)),
  ] as const))
  const byId = new Map(current.map(r => [r.riderId,r] as const))
  const final = new Map<string,number>()
  for (const group of groups) {
    if (group.riderIds.length === 1) {
      const id=group.riderIds[0]
      final.set(id,raw.get(id)!)
      continue
    }
    const sustainable = group.riderIds
      .map(id=>raw.get(id)!)
      .sort((a,b)=>a-b)
    const pace = sustainable[Math.floor((sustainable.length - 1) * 0.7)]
    // Wider paceline drafting on the flat; much less on climbs/descents.
    const draftingKmh = segment.terrain === 'flat' ? 1.75 :
      segment.terrain === 'climb' ? 0.85 : 1.1
    const breakawayKmh = segment.terrain === 'climb' ? 0.75 : 1.75
    for(const id of group.riderIds){
      const rider=byId.get(id)!
      const natural=raw.get(id)!
      const departing = rider.effort === 'attack' && natural > pace ||
        segment.terrain === 'climb' && natural > pace + breakawayKmh &&
        rider.energy > 18 && rider.effort !== 'support' && rider.effort !== 'recover'
      const achievable = natural + draftingKmh
      const speed = departing ? natural : Math.min(pace,achievable)
      final.set(id,rounded(clamp(speed,9,90)))
    }
  }
  return final
}

export function mountainV2PhysicalGroups(
  riderStates: readonly MountainV2RiderState[],
): readonly MountainV2PhysicalGroup[] {
  const sorted = [...riderStates].sort(
    (a, b) => a.gapSeconds - b.gapSeconds ||
      a.riderId.localeCompare(b.riderId),
  )
  const members: MountainV2RiderState[][] = []
  for (const rider of sorted) {
    const previous = members.at(-1)
    if (
      previous &&
      rider.gapSeconds - previous.at(-1)!.gapSeconds <= CONTACT_SECONDS &&
      rider.gapSeconds - previous[0].gapSeconds <= MAX_GROUP_SPREAD_SECONDS
    ) previous.push(rider)
    else members.push([rider])
  }
  return members.map((group, index) => ({
    groupId: index === 0 ? 'P' : `C${index}`,
    riderIds: group.map((rider) => rider.riderId),
    leaderGapSeconds: rounded(group[0].gapSeconds),
  }))
}

/**
 * Each segment advances every rider by distance / rider-specific speed.
 * Relative gaps are the differences in calculated arrival time. A rider
 * cannot join, overtake or leave another group without sufficient travel
 * speed over the intervening distance.
 */
export function simulateMountainV2Contacts(
  riders: readonly MountainV2Rider[],
  segments: readonly MountainV2Segment[],
): MountainV2Simulation {
  if (riders.length === 0) throw new Error('At least one rider is required')
  if (new Set(riders.map((rider) => rider.riderId)).size !== riders.length) {
    throw new Error('Duplicate rider ID')
  }
  if (riders.some((rider) =>
    !rider.riderId || !rider.teamId ||
    [rider.climbing, rider.endurance, rider.descending, rider.energy, rider.gapSeconds]
      .some((number) => !Number.isFinite(number)) ||
    rider.gapSeconds < 0
  )) throw new Error('Invalid rider physics input')
  if (segments.some((segment) =>
    !Number.isFinite(segment.lengthKm) || segment.lengthKm <= 0 ||
    !Number.isFinite(segment.gradientPercent) ||
    Math.abs(segment.gradientPercent) > 30 ||
    (segment.terrain === 'climb' && segment.gradientPercent <= 0) ||
    (segment.terrain === 'descent' && segment.gradientPercent >= 0) ||
    !['climb', 'flat', 'descent'].includes(segment.terrain)
  )) throw new Error('Invalid physical terrain segment')

  let current = riders.map((rider) => ({ ...rider }))
  let km = 0
  const checkpoints: MountainV2Checkpoint[] = []

  for (const segment of segments) {
    const speeds = segmentSpeeds(current,segment)
    const arrivals = current.map((rider) => {
      const speedKmh = speeds.get(rider.riderId)!
      const arrivalSeconds =
        rider.gapSeconds + (segment.lengthKm / speedKmh) * 3600
      return {
        rider,
        speedKmh,
        arrivalSeconds,
        energy: energyAfter(rider, segment, speedKmh),
      }
    })
    const fastestArrival = Math.min(...arrivals.map((row) => row.arrivalSeconds))
    const states: MountainV2RiderState[] = arrivals.map((row) => ({
      riderId: row.rider.riderId,
      teamId: row.rider.teamId,
      gapSeconds: rounded(Math.max(0, row.arrivalSeconds - fastestArrival)),
      energy: row.energy,
      speedKmh: row.speedKmh,
      effort: row.rider.effort,
    })).sort((a, b) =>
      a.gapSeconds - b.gapSeconds || a.riderId.localeCompare(b.riderId)
    )
    const groups = mountainV2PhysicalGroups(states)
    km = rounded(km + segment.lengthKm)
    checkpoints.push({ km, terrain: segment.terrain, riders: states, groups })
    current = current.map((rider) => {
      const state = states.find((row) => row.riderId === rider.riderId)!
      return { ...rider, gapSeconds: state.gapSeconds, energy: state.energy }
    })
  }

  const finalRiders = checkpoints.at(-1)?.riders ??
    current.map((rider) => ({
      riderId: rider.riderId, teamId: rider.teamId,
      gapSeconds: rounded(rider.gapSeconds),
      energy: rider.energy, speedKmh: 0, effort: rider.effort,
    })).sort((a, b) => a.gapSeconds - b.gapSeconds ||
      a.riderId.localeCompare(b.riderId))
  const finalGroups = mountainV2PhysicalGroups(finalRiders)
  return {
    modelVersion: 'mountain_continuous_contact_v2_prototype',
    checkpoints,
    finalRiders,
    finalGroups,
  }
}
