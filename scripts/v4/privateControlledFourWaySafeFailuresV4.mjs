/**
 * Allowlisted, data-free failure phases for private historical four-way runs.
 * NEVER emit exception text, rider identifiers, original input or replay issues.
 */
export const V4_FOUR_WAY_SAFE_PHASES=Object.freeze([
 'INPUT','PLAN',
 'BASELINE_ORIGINAL_EXECUTION','BASELINE_ORIGINAL_REPLAY',
 'BASELINE_V4_TACTICS_EXECUTION','BASELINE_V4_TACTICS_REPLAY',
 'V4_ORIGINAL_EXECUTION','V4_ORIGINAL_REPLAY',
 'V4_V4_TACTICS_EXECUTION','V4_V4_TACTICS_REPLAY',
 'AGGREGATION'
])
export const isV4FourWaySafePhase=x=>
 typeof x==='string'&&V4_FOUR_WAY_SAFE_PHASES.includes(x)
