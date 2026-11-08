/**
 * Universal post-stage breakaway recovery policy, all race categories.
 * Pure post-stage adaptation. Never changes stage ranks, road physics, live
 * replay energy, winner, or historical runs without the checkpoint flag.
 * Requires physical accepted escape membership/catch intervals.
 */
export const BREAKAWAY_RECOVERY_POLICY_V2 = 'universal_physical_breakaway_recovery_20_50_100km_v2'

function clamp(n, lower, upper) { return Math.max(lower, Math.min(upper, n)) }
function round6(n) { return Math.round((n + Number.EPSILON) * 1e6) / 1e6 }
function validNumber(n) { return typeof n === 'number' && Number.isFinite(n) }
function requiredNumber(n, key) {
  if (!validNumber(n)) throw new Error('Universal breakaway fatigue: invalid ' + key)
  return n
}
export function calculateBreakawayRecoveryDebtKmV2(km) {
  const n = Math.max(0, requiredNumber(km, 'distance'))
  return round6(clamp(n - 20, 0, 30) * 0.15 +
    clamp(n - 50, 0, 50) * 0.28 +
    Math.max(0, n - 100) * 0.45)
}

/**
 * Union overlapping physical-distance intervals per rider. A repeated
 * accepted attack cannot accidentally count the same kilometres twice.
 */
export function physicalBreakawayExposureKmV2(road, distanceKm) {
  const distance = requiredNumber(distanceKm, 'stage length')
  if (distance <= 0) throw new Error('Universal breakaway fatigue: stage length must be positive')
  const segments = new Map()
  const add = (riderIds, from, to) => {
    if (!Array.isArray(riderIds) || !validNumber(from) || !validNumber(to)) return
    const start = clamp(from, 0, distance), end = clamp(to, 0, distance)
    if (end <= start) return
    for (const riderId of new Set(riderIds)) {
      if (typeof riderId !== 'string' || !riderId) continue
      if (!segments.has(riderId)) segments.set(riderId, [])
      segments.get(riderId).push([start, end])
    }
  }
  const p1 = road?.phase1Opening, p2 = road?.phase2Development
  const p3 = road?.phase3Decisive, p4 = road?.phase4Finish
  if (p1) {
    const stop = Math.min(p1.phaseBoundary?.endKm ?? 0,
      p1.breakawayCatchKm ?? p1.phaseBoundary?.endKm ?? 0)
    for (const attack of p1.attackAttempts ?? []) {
      if (attack.acceptedEscapeLaunch === true) add([attack.riderId], attack.attemptKm, stop)
    }
  }
  if (p2) add(p2.breakawayRiderIdsAtStart,
    p2.phaseBoundary?.startKm, Math.min(p2.phaseBoundary?.endKm ?? 0,
      p2.breakawayCatchKm ?? p2.phaseBoundary?.endKm ?? 0))
  if (p3) add(p3.physicalEscapeRiderIdsAtStart,
    p3.phaseBoundary?.startKm, Math.min(p3.phaseBoundary?.endKm ?? 0,
      p3.physicalCatchKm ?? p3.phaseBoundary?.endKm ?? 0))
  if (p4) {
    const catchStep = p4.breakawayCaught
      ? (p4.chaseSteps ?? []).find(step => validNumber(step.endGapSeconds) &&
          step.endGapSeconds <= 5 && validNumber(step.kmEnd))
      : null
    const lastKm = p4.breakawayCaught
      ? (catchStep?.kmEnd ?? p4.phaseBoundary?.startKm)
      : p4.phaseBoundary?.endKm
    add(p4.escapeRiderIdsAtStart, p4.phaseBoundary?.startKm,
      Math.min(p4.phaseBoundary?.endKm ?? 0, lastKm ?? 0))
  }
  const result = new Map()
  for (const [id, intervals] of segments) {
    intervals.sort((a,b)=>a[0]-b[0] || a[1]-b[1])
    let distanceSum = 0, currentStart = -1, currentEnd = -1
    for (const [start,end] of intervals) {
      if (currentStart < 0) { currentStart=start; currentEnd=end }
      else if (start<=currentEnd) currentEnd=Math.max(currentEnd,end)
      else { distanceSum+=currentEnd-currentStart; currentStart=start; currentEnd=end }
    }
    if (currentStart>=0) distanceSum+=currentEnd-currentStart
    result.set(id, round6(Math.min(distance, Math.max(0, distanceSum))))
  }
  return result
}

/**
 * Preserve the chosen lane's own normal post-stage fatigue and adjust only
 * its extra breakaway recovery debt. Also update every persistence/summary
 * alias so the database writer never gets a stale earlier value.
 */
export function applyUniversalBreakawayRecoveryV2(post, road, distanceKm) {
  if (!post || !Array.isArray(post.riderUpdates) ||
      !Array.isArray(post.persistenceContract?.rows)) {
    throw new Error('Universal breakaway fatigue: missing canonical post-stage persistence contract')
  }
  const physicalKmByRider = physicalBreakawayExposureKmV2(road, distanceKm)
  let above20=0, above50=0, above100=0, physicalEscapeRiders=0
  const nextRiderUpdates = post.riderUpdates.map(old => {
    if (!old || typeof old.riderId !== 'string') throw new Error('Missing rider in post-stage update')
    const eligible = old.eligibleToStart === true
    const km = eligible ? (physicalKmByRider.get(old.riderId) ?? 0) : 0
    const debt = eligible ? calculateBreakawayRecoveryDebtKmV2(km) : 0
    if (km > 0) physicalEscapeRiders++
    if (km > 20) above20++
    if (km > 50) above50++
    if (km > 100) above100++
    const existingDebt = validNumber(old.breakawayRecoveryDebtLoad) ? old.breakawayRecoveryDebtLoad : 0
    const gross = requiredNumber(old.grossFatigueGain, 'gross fatigue') - existingDebt + debt
    const multiplier = requiredNumber(old.postStageFatigueMultiplier, 'fatigue multiplier')
    const recoveryBonus = requiredNumber(old.postStageRecoveryBonusPoints, 'recovery bonus')
    const fatigueBefore = requiredNumber(old.effectiveFatigueBeforeStage, 'fatigue before stage')
    const adjusted = eligible ? round6(Math.max(0, gross * multiplier - recoveryBonus)) : 0
    const rawAfter = fatigueBefore + adjusted
    const after = round6(clamp(rawAfter, 0, 100))
    const applied = round6(Math.max(0, after - fatigueBefore))
    const daily = requiredNumber(old.intrinsicDailyRecoveryPoints, 'daily recovery')
    if (daily <= 0) throw new Error('Universal breakaway fatigue: nonpositive recovery')
    return {
      ...old,
      breakawayExposureKm: km,
      breakawayRecoveryDebtLoad: debt,
      grossFatigueGain: round6(gross),
      adjustedFatigueGain: adjusted,
      appliedFatigueGain: applied,
      fatigueGained: applied,
      fatigueAfterStage: after,
      fatigueAfter: after,
      fatigueClampedAtMaximum: rawAfter > 100,
      fatigueAfterOneRecoveryDay: round6(Math.max(0, after - daily)),
      estimatedDaysToPreStageFatigue: applied > 0 ? Math.ceil(applied / daily) : 0,
      estimatedDaysToFullRecovery: after > 0 ? Math.ceil(after / daily) : 0,
      recoveryDemandPoints: after,
      recoveryDemand: after,
      previousStageSeed: {
        ...old.previousStageSeed,
        fatigueAfterStage: after,
        fatigueGain: old.writeEligible ? applied : null,
      },
    }
  })
  const byRider = new Map(nextRiderUpdates.map(row=>[row.riderId,row]))
  if (byRider.size !== nextRiderUpdates.length) throw new Error('Duplicate rider post-stage updates')
  const persistent = post.persistenceContract.rows.map(old=>{
    const row=byRider.get(old.riderId)
    if(!row || row.writeEligible!==true) throw new Error('Unmatched post-stage persistence row')
    return {...old,
      fatigueBefore:row.fatigueBefore,
      fatigueGained:row.fatigueGained,
      fatigueAfter:row.fatigueAfter,
      recoveryDemand:row.recoveryDemand
    }
  })
  const eligibles=nextRiderUpdates.filter(row=>row.writeEligible===true)
  if (eligibles.length!==persistent.length) throw new Error('Missing persistence rider')
  return {
    ...post,
    riderUpdates:nextRiderUpdates,
    persistenceContract:{...post.persistenceContract,rows:persistent},
    averageAppliedFatigueGain:eligibles.length ? round6(eligibles.reduce((n,r)=>n+r.appliedFatigueGain,0)/eligibles.length):0,
    maximumFatigueAfterStage:nextRiderUpdates.length
      ? round6(Math.max(...nextRiderUpdates.map(r=>r.fatigueAfterStage))) : 0,
    breakawayRecoveryPolicyVersion: BREAKAWAY_RECOVERY_POLICY_V2,
    breakawayRecoveryEvidence: {physicalEscapeRiders,above20,above50,above100},
  }
}
