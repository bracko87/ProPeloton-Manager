/**
 * Read-only representation of existing rider skills as estimated cycling power.
 * This is NOT a race simulation input, a transfer-value multiplier, or actual telemetry.
 * Same skills + stored weight => identical power before and after any club transfer.
 */
export type RiderPowerSkills = {
  sprint: number
  climbing: number
  time_trial: number
  endurance: number
  flat: number
  resistance: number
}
export type RiderPowerEstimate = {
  ftp: number
  wPerKg: number
  fiveSeconds: number
  oneMinute: number
  fiveMinutes: number
}
const clampSkill = (v: number) => Math.max(0, Math.min(100, v))
export function estimateRiderPower(
  input: RiderPowerSkills | null | undefined,
  weightKg: number | null | undefined,
): RiderPowerEstimate | null {
  if (!input || !Number.isFinite(weightKg) || !weightKg || weightKg < 32 || weightKg > 115) return null
  const values = [input.sprint,input.climbing,input.time_trial,input.endurance,input.flat,input.resistance]
  if (!values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)) return null
  const [sprint,climbing,timeTrial,endurance,flat,resistance] = values.map(clampSkill)
  const threshold = 0.30*endurance + 0.23*timeTrial + 0.18*flat + 0.19*climbing + 0.10*resistance
  const ftp = Math.round(weightKg*(1.8+0.049*threshold))
  const fiveMinutes = Math.max(Math.round(ftp*1.08),Math.round(weightKg*(2.05 + 0.055*(0.5*climbing+0.3*endurance+0.2*timeTrial))))
  const oneMinute = Math.max(Math.round(fiveMinutes*1.16),Math.round(weightKg*(2.6 + 0.085*(0.67*sprint+0.33*resistance))))
  const fiveSeconds = Math.max(Math.round(oneMinute*1.22),Math.round(weightKg*(3.7+0.148*sprint)))
  return { ftp, wPerKg: Math.round(100*ftp/weightKg)/100, fiveSeconds, oneMinute, fiveMinutes }
}
