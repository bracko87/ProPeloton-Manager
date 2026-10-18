import { describe, expect, it } from 'vitest'
import { estimateRiderPower } from './riderPower'

const climber = { sprint:52, climbing:88, time_trial:73, endurance:86, flat:65, resistance:79 }
const sprinter = { sprint:92, climbing:52, time_trial:69, endurance:70, flat:81, resistance:78 }
describe('read-only power estimates', () => {
  it('are deterministic and independent of club membership', () => {
    expect(estimateRiderPower(climber,62)).toEqual(estimateRiderPower({...climber},62))
  })
  it('give stronger sprint attributes higher short-duration output at equal weight', () => {
    expect(estimateRiderPower({...climber,sprint:95},62)!.fiveSeconds)
      .toBeGreaterThan(estimateRiderPower(climber,62)!.fiveSeconds)
  })
  it('distinguish the FTP and sprint tradeoffs', () => {
    const a=estimateRiderPower(climber,62)!
    const b=estimateRiderPower(sprinter,80)!
    expect(a.wPerKg).toBeGreaterThan(0)
    expect(b.fiveSeconds).toBeGreaterThan(a.fiveSeconds)
  })
  it('rejects missing hidden scouting attributes',()=>{
    expect(estimateRiderPower(null,65)).toBeNull()
    expect(estimateRiderPower({...climber,climbing:NaN},62)).toBeNull()
  })
  it('keeps the power-duration curve ordered',()=>{
    const e=estimateRiderPower(climber,62)!
    expect(e.fiveSeconds).toBeGreaterThan(e.oneMinute)
    expect(e.oneMinute).toBeGreaterThan(e.fiveMinutes)
    expect(e.fiveMinutes).toBeGreaterThan(e.ftp)
  })
})
