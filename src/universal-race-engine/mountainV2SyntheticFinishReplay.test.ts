import {describe,expect,it} from 'vitest'
import {simulateMountainV2Contacts} from './mountainContactPhysicsV2.ts'
import {buildMountainV2SyntheticStageClock} from './mountainV2SyntheticStageClock.ts'
import {buildMountainV2SyntheticFinishReplay} from './mountainV2SyntheticFinishReplay.ts'
const segments = [
  {lengthKm:12,gradientPercent:8,terrain:'climb' as const},
  {lengthKm:10,gradientPercent:-5,terrain:'descent' as const},
  {lengthKm:8,gradientPercent:0,terrain:'flat' as const},
]
const riders=[
  {riderId:'a',teamId:'one',climbing:90,endurance:85,descending:65,energy:90,effort:'steady' as const,gapSeconds:0},
  {riderId:'b',teamId:'two',climbing:65,endurance:65,descending:65,energy:90,effort:'steady' as const,gapSeconds:0},
  {riderId:'c',teamId:'two',climbing:75,endurance:75,descending:65,energy:90,effort:'attack' as const,gapSeconds:0},
]
const stage=()=>buildMountainV2SyntheticStageClock(segments,simulateMountainV2Contacts(riders,segments))
describe('Mountain V2 synthetic finish/replay',()=>{
  it('reconciles every finish time to its final checkpoint',()=>{
    const timed=stage()
    const result=buildMountainV2SyntheticFinishReplay(timed)
    expect(result.authority).toBe('synthetic_only')
    expect(result.finish).toHaveLength(riders.length)
    expect(result.replay).toHaveLength(segments.length)
    expect(result.finish[0].rank).toBe(1)
    expect(result.finish[0].gapSeconds).toBe(0)
    for(const row of result.finish){
      expect(row.elapsedSeconds).toBe(timed.at(-1)!.riderElapsedSeconds[row.riderId])
    }
    expect(result.replay.at(-1)!.riderElapsedSeconds).toEqual(timed.at(-1)!.riderElapsedSeconds)
    expect(buildMountainV2SyntheticFinishReplay(timed)).toEqual(result)
  })
  it('rejects replay checkpoint time regression',()=>{
    const timed=stage()
    const cp=timed[1]
    const corrupted=[timed[0],{...cp,riderElapsedSeconds:{...cp.riderElapsedSeconds,a:0}},timed[2]]
    expect(()=>buildMountainV2SyntheticFinishReplay(corrupted)).toThrow()
  })
  it('rejects missing riders in replay contact groups',()=>{
    const timed=stage()
    const bad=timed.map((cp,i)=>i===1?{...cp,groups:cp.groups.slice(1)}:cp)
    expect(()=>buildMountainV2SyntheticFinishReplay(bad)).toThrow()
  })
})
