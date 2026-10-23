import { describe, expect, it } from 'vitest'
import { runMountainV2SyntheticStage } from './mountainV2SyntheticStage.ts'
import type { MountainV2Rider, MountainV2Segment } from './mountainContactPhysicsV2.ts'

const riders: MountainV2Rider[] = [
  { riderId:'leader',teamId:'a',climbing:92,endurance:91,descending:65,energy:94,effort:'attack',gapSeconds:0 },
  { riderId:'helper',teamId:'a',climbing:78,endurance:86,descending:65,energy:92,effort:'support',gapSeconds:0 },
  { riderId:'chaser',teamId:'b',climbing:85,endurance:80,descending:65,energy:94,effort:'steady',gapSeconds:0 },
  { riderId:'rouleur',teamId:'c',climbing:57,endurance:82,descending:65,energy:95,effort:'steady',gapSeconds:0 },
  { riderId:'sprinter',teamId:'d',climbing:41,endurance:75,descending:65,energy:96,effort:'recover',gapSeconds:0 },
]
const segments: MountainV2Segment[] = [
  {lengthKm:10,gradientPercent:1,terrain:'flat'},
  {lengthKm:16,gradientPercent:8,terrain:'climb'},
  {lengthKm:12,gradientPercent:-6,terrain:'descent'},
  {lengthKm:7,gradientPercent:0,terrain:'flat'},
  {lengthKm:14,gradientPercent:9,terrain:'climb'},
  {lengthKm:14,gradientPercent:-5,terrain:'descent'},
  {lengthKm:12,gradientPercent:0,terrain:'flat'},
]
describe('Mountain V2 complete synthetic stage pipeline',()=>{
  it('conserves all riders through climb, descent and finish replay',()=>{
    const result=runMountainV2SyntheticStage(riders,segments)
    expect(result.authority).toBe('synthetic_only')
    expect(result.physicalCheckpoints).toHaveLength(segments.length)
    expect(result.timedCheckpoints).toHaveLength(segments.length)
    expect(result.replay).toHaveLength(segments.length)
    expect(result.finish).toHaveLength(riders.length)
    for(let i=0;i<segments.length;i++){
      const physical=result.physicalCheckpoints[i]
      const timed=result.timedCheckpoints[i]
      const replay=result.replay[i]
      expect(physical.km).toBe(timed.km)
      expect(timed.km).toBe(replay.km)
      expect(new Set(physical.groups.flatMap(g=>g.riderIds))).toEqual(new Set(riders.map(r=>r.riderId)))
      for(const rider of physical.riders) {
        expect(timed.riderElapsedSeconds[rider.riderId]-timed.leaderElapsedSeconds)
          .toBeCloseTo(rider.gapSeconds,4)
      }
    }
    for(const row of result.finish) {
      expect(row.elapsedSeconds).toBe(result.replay.at(-1)!.riderElapsedSeconds[row.riderId])
      expect(row.gapSeconds).toBeCloseTo(row.elapsedSeconds-result.finish[0].elapsedSeconds,6)
    }
    expect(runMountainV2SyntheticStage(riders,segments)).toEqual(result)
  })
  it('accepts physically merging or splitting groups without scripting sizes',()=>{
    const result=runMountainV2SyntheticStage(riders,segments)
    for(const frame of result.physicalCheckpoints){
      const unique=new Set(frame.groups.flatMap(g=>g.riderIds))
      expect(unique.size).toBe(riders.length)
    }
    expect(result.finish[0].rank).toBe(1)
  })
  it('rejects missing road segments and duplicate riders',()=>{
    expect(()=>runMountainV2SyntheticStage(riders,[])).toThrow()
    expect(()=>runMountainV2SyntheticStage([...riders,riders[0]],segments)).toThrow()
  })
})
