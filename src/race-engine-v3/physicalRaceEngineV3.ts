/**
 * Replacement road-race physical motion core (V3, isolated research implementation).
 * There is deliberately no production engine selector, database dependency,
 * results publication, or race-clock linkage in this module.
 *
 * Each rider moves through the same route in elapsed clock time. The replay,
 * gaps and finish are all derived from this one trajectory; no scripted group
 * reunification or ranking-to-time conversion is permitted.
 */

import {classifyAttackProximityV3} from './physicalAttackLifecycleV3.ts'
import {advancePhysicalGroupTimelineV3,initializePhysicalGroupTimelineV3,type PhysicalGroupTimelineStateV3,type TrackedPhysicalGroupFrameV3} from './physicalGroupTimelineV3.ts'

export type RoadSurfaceV3 = 'asphalt' | 'cobbled'
export type RoadActionV3 = 'follow' | 'tempo' | 'attack' | 'chase' | 'recover'

export interface RoadSegmentV3 {
  readonly lengthKm: number
  readonly gradePercent: number
  readonly surface?: RoadSurfaceV3
  readonly headwindKph?: number
  /** Perpendicular wind exposure; reduces usable drafting, does not script echelons. */
  readonly crosswindKph?: number
  /** Rain/wet-road exposure 0..1; provisional speed/handling response. */
  readonly wetness?: number
}
export interface PhysicalRiderV3 {
  readonly riderId: string
  readonly teamId: string
  readonly flat: number
  readonly hills: number
  readonly climbing: number
  readonly cobbles: number
  readonly stamina: number
  readonly form?: number
  readonly fatigue?: number
  readonly aggression?: number
}
export interface RoadOrderV3 {
  readonly riderId: string
  readonly startKm: number
  readonly endKm: number
  readonly action: RoadActionV3
}
export interface PhysicalRaceV3Input {
  readonly raceId: string
  readonly stageId: string
  readonly seed: string
  readonly route: readonly RoadSegmentV3[]
  readonly riders: readonly PhysicalRiderV3[]
  readonly orders?: readonly RoadOrderV3[]
  readonly sampleEverySeconds?: number
  readonly dtSeconds?: number
}
export interface PhysicalRiderStateV3 {
  riderId: string
  teamId: string
  meters: number
  speedMps: number
  energy: number
  finishSeconds: number | null
  attackUsedAtKm: number | null
  activeAttackKey: string | null
  attackAttempts: number
}
export interface PhysicalReplaySampleV3 {
  readonly elapsedSeconds: number
  readonly riders: readonly { readonly riderId: string; readonly meters: number; readonly energy: number }[]
}
export interface PhysicalFinishV3 {
  readonly riderId: string
  readonly teamId: string
  readonly rank: number
  readonly physicalFinishSeconds: number
  readonly officialFinishSeconds: number
  readonly physicalGapSeconds: number
  readonly officialGapSeconds: number
}
export interface PhysicalRaceV3State {
  readonly version: 'physical_road_v3_preview'
  readonly inputFingerprint: string
  elapsedSeconds: number
  tick: number
  readonly totalMeters: number
  readonly states: PhysicalRiderStateV3[]
  readonly replay: PhysicalReplaySampleV3[]
  /** Durable group lineage, persisted alongside the simulation checkpoint. */
  readonly groupTimeline: PhysicalGroupTimelineStateV3
  complete: boolean
}
export interface PhysicalRaceV3Result {
  readonly version: 'physical_road_v3_preview'
  readonly finish: readonly PhysicalFinishV3[]
  readonly replay: readonly PhysicalReplaySampleV3[]
  readonly groupFrames: readonly TrackedPhysicalGroupFrameV3[]
  readonly elapsedSeconds: number
  readonly tickCount: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const finite = (n: number) => typeof n === 'number' && Number.isFinite(n)
const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000
function stableHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; ++i) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
function fingerprint(input: PhysicalRaceV3Input): string {
  return stableHash(JSON.stringify(input)).toString(16).padStart(8, '0')
}
function routeLength(input: PhysicalRaceV3Input): number {
  return input.route.reduce((sum, s) => sum + s.lengthKm * 1000, 0)
}
function segmentAt(input: PhysicalRaceV3Input, meters: number): RoadSegmentV3 {
  let cursor = 0
  for (const segment of input.route) {
    cursor += segment.lengthKm * 1000
    if (meters < cursor) return segment
  }
  return input.route[input.route.length - 1]
}
function validate(input: PhysicalRaceV3Input): void {
  if (!input.stageId || !input.raceId || !input.seed) throw new Error('Missing identity or deterministic seed')
  if (!input.route.length || !input.riders.length) throw new Error('Missing route or riders')
  if (input.route.some(s => !finite(s.lengthKm) || s.lengthKm <= 0 || !finite(s.gradePercent) || Math.abs(s.gradePercent) > 22 || (s.headwindKph !== undefined && !finite(s.headwindKph)) || (s.crosswindKph !== undefined && (!finite(s.crosswindKph) || s.crosswindKph < 0 || s.crosswindKph > 120)) || (s.wetness !== undefined && (!finite(s.wetness) || s.wetness < 0 || s.wetness > 1)))) throw new Error('Invalid route segment')
  if (input.riders.length > 260) throw new Error('Unsupported rider count')
  const ids = new Set(input.riders.map(r => r.riderId))
  if (ids.size !== input.riders.length || ids.has('')) throw new Error('Duplicate or blank rider IDs')
  if (input.riders.some(r => !r.teamId || [r.flat,r.hills,r.climbing,r.cobbles,r.stamina].some(x => !finite(x) || x < 0 || x > 100) || (r.form !== undefined && (!finite(r.form) || r.form < 0 || r.form > 100)) || (r.fatigue !== undefined && (!finite(r.fatigue) || r.fatigue < 0 || r.fatigue > 100)))) throw new Error('Invalid rider attributes')
  if ((input.orders ?? []).some(o => !ids.has(o.riderId) || !finite(o.startKm) || !finite(o.endKm) || o.startKm < 0 || o.endKm <= o.startKm || !['follow','tempo','attack','chase','recover'].includes(o.action))) throw new Error('Invalid road order')
  const dt = input.dtSeconds ?? 10, sample = input.sampleEverySeconds ?? 60
  if (!Number.isInteger(dt) || dt < 1 || dt > 20 || !Number.isInteger(sample) || sample < dt || sample % dt !== 0) throw new Error('Invalid integration or replay interval')
}
function capability(rider: PhysicalRiderV3, seg: RoadSegmentV3): number {
  const grade = seg.gradePercent
  if (seg.surface === 'cobbled') return 0.65 * rider.cobbles + 0.25 * rider.flat + 0.10 * rider.hills
  if (grade >= 5) return rider.climbing * .83 + rider.stamina * .17
  if (grade >= 2) return rider.hills * .55 + rider.climbing * .3 + rider.stamina * .15
  if (grade < -2) return rider.flat * .65 + rider.hills * .35
  return rider.flat * .75 + rider.stamina * .25
}
function orderAt(input: PhysicalRaceV3Input, riderId: string, meters: number): RoadActionV3 {
  const km = meters / 1000
  // Latest scoped order wins; an ordinary tempo instruction is NOT an organized chase.
  const found = (input.orders ?? []).filter(o => o.riderId === riderId && km >= o.startKm && km < o.endKm)
  return found.length ? found[found.length - 1].action : 'follow'
}
function soloSpeedMps(rider: PhysicalRiderV3, seg: RoadSegmentV3, energy: number, action: RoadActionV3, seed: string): number {
  const grade = seg.gradePercent
  // The gradient itself controls base speed; ability modifies the sustainable
  // velocity continuously. Drafting cannot cancel climb-specific disadvantages.
  const baseKph = grade >= 0 ? 40 / (1 + 0.107 * Math.pow(grade, 1.08)) : Math.min(68, 40 + Math.abs(grade) * 3.7)
  const skill = capability(rider, seg)
  const riderVariation = (stableHash(`${seed}:${rider.riderId}`) / 0xffffffff - .5) * .008
  const form = (rider.form ?? 65) - 65
  const relative = 1 + (skill - 65) * .0051 + form * .0008 + riderVariation
  const depleted = energy < .38 ? .38 * Math.pow((.38 - energy) / .38, 1.4) : 0
  const effort = action === 'attack' ? 1.30 : action === 'chase' ? 1.125 : action === 'tempo' ? 1.025 : action === 'recover' ? .90 : 1
  const windFactor = clamp(1 - (seg.headwindKph ?? 0) * .0025 - (seg.crosswindKph ?? 0) * .0009, .76, 1.12)
  const wetness=seg.wetness??0
  const surfaceFactor = (seg.surface === 'cobbled' ? .86 : 1) * (1-wetness*(seg.gradePercent<0?.08:.012))
  return clamp(baseKph * relative * (1 - depleted) * effort * windFactor * surfaceFactor / 3.6, 1, 26)
}
/** Create a deterministic resumable state. No race is run during initialization. */
export function initializePhysicalRaceV3(input: PhysicalRaceV3Input): PhysicalRaceV3State {
  validate(input)
  return {
    version: 'physical_road_v3_preview', inputFingerprint: fingerprint(input), elapsedSeconds: 0,
    tick: 0, totalMeters: routeLength(input),
    states: input.riders.map(r => ({ riderId:r.riderId, teamId:r.teamId, meters:0, speedMps:0, energy:clamp(1-(r.fatigue??0)/350,.70,1), finishSeconds:null,attackUsedAtKm:null,activeAttackKey:null,attackAttempts:0 })),
    replay:[], groupTimeline:initializePhysicalGroupTimelineV3(routeLength(input)), complete:false,
  }
}
/** Advance a bounded count of time ticks; state can be serialized and resumed. */
export function advancePhysicalRaceV3(input: PhysicalRaceV3Input, state: PhysicalRaceV3State, maxTicks: number): PhysicalRaceV3State {
  validate(input)
  if (state.inputFingerprint !== fingerprint(input) || state.version !== 'physical_road_v3_preview') throw new Error('Checkpoint input/source mismatch')
  if (!Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 1_000_000) throw new Error('Invalid checkpoint budget')
  if(!state.groupTimeline || state.groupTimeline.courseMeters!==state.totalMeters || state.groupTimeline.history.length!==state.replay.length)throw Error('Missing or divergent durable group checkpoint')
  const dt = input.dtSeconds ?? 10, sample = input.sampleEverySeconds ?? 60
  const riders = new Map(input.riders.map(r => [r.riderId, r]))
  for (let tick=0; tick<maxTicks && !state.complete; ++tick) {
    const before = state.elapsedSeconds
    // Positions must be computed from the PREVIOUS tick, never from updated
    // positions of earlier riders in iteration order.
    const positions = [...state.states].filter(s=>s.finishSeconds===null).sort((a,b)=>b.meters-a.meters || a.riderId.localeCompare(b.riderId))
    const previous = new Map(positions.map(s=>[s.riderId,{meters:s.meters,speedMps:s.speedMps}]))
    const planned = new Map<string,number>()
    const effectiveActions = new Map<string,RoadActionV3>()
    const leaderMeters=positions[0]?.meters??0
    const medianSpeedCache = new Map<RoadSegmentV3,number>()
    const midfieldMeters=[...positions.map(s=>s.meters)].sort((a,b)=>a-b)[Math.floor(positions.length/2)] ?? 0
    for (let i=0;i<positions.length;i++) {
      const s=positions[i], r=riders.get(s.riderId)!
      const seg=segmentAt(input,s.meters)
      let action=orderAt(input,r.riderId,s.meters)
      // An attack is a short physical effort, never a persistent speed multiplier.
      // A NEW scoped order can trigger another burst, with depleted reserves.
      const requestedOrder=(input.orders ?? []).filter(o=>o.riderId===s.riderId && s.meters/1000>=o.startKm && s.meters/1000<o.endKm).at(-1)
      const attackKey=requestedOrder?.action==='attack' ? `${requestedOrder.startKm}:${requestedOrder.endKm}` : null
      if(attackKey && s.activeAttackKey!==attackKey){
        s.activeAttackKey=attackKey
        s.attackUsedAtKm=s.meters/1000
        s.attackAttempts++
      }else if(!attackKey) s.activeAttackKey=null
      if(action==='attack' && (s.meters/1000-(s.attackUsedAtKm??0)>2 || s.energy<=.16))action='follow'
      // A chase order is CONDITIONAL. Never create a solo attack just because
      // someone was told to chase when no breakaway is actually ahead.
      if(action==='chase' && leaderMeters-s.meters<120)action='follow'
      effectiveActions.set(s.riderId,action)
      const maxSolo=soloSpeedMps(r,seg,s.energy,'follow',input.seed)
      // Riders in the same peloton do not race at maximum power for every
      // kilometre. Pace is governed by stage context; capacity decides who
      // can sustain it, with intentional attacks allowed to exceed it.
      let median=medianSpeedCache.get(seg)
      if(median===undefined){
        const speeds=input.riders.map(x=>soloSpeedMps(x,seg,.8,'follow',input.seed))
        speeds.sort((a,b)=>a-b)
        median=speeds[Math.floor(speeds.length/2)]
        medianSpeedCache.set(seg,median)
      }
      const mountain=seg.gradePercent>=5
      const raceProgress=s.meters/state.totalMeters
      const finalClimbPressure=mountain && raceProgress>.75 ? .11 : mountain ? 0 : 0
      const fieldPace=median*(mountain ? .935 : .91)*(1+finalClimbPressure)
      // Completed attacks must not grant a lifetime escaped-rider pace.
      // Retire the burst only after physical reabsorption into the bunch;
      // a future breakout requires a new explicit tactical instruction.
      if(action!=='attack' && s.activeAttackKey===null && s.attackUsedAtKm!==null){
        const proximity=classifyAttackProximityV3(positions,s.riderId)
        if(proximity.classification==='within_peloton'||proximity.classification==='behind_peloton')s.attackUsedAtKm=null
      }
      const escaped=s.attackUsedAtKm!==null && s.meters>midfieldMeters+90 && s.energy>.12
      const naturalMountainAttack=mountain && raceProgress>.86 && capability(r,seg)>84
      const attackBoost=1+.25*clamp((s.energy-.16)/.6,0,1)
      let velocity= action==='attack' ? maxSolo*attackBoost : action==='chase' ? Math.min(maxSolo*1.02,fieldPace*1.07) :
        escaped ? maxSolo*(.90+.055*s.energy) : naturalMountainAttack ? maxSolo :
        Math.min(maxSolo,fieldPace*(action==='tempo'?1.025:action==='recover'?.90:1))
      // Drafting exists only for actual nearby physical riders, not assigned
      // race groups. On steep gradients aerodynamic help becomes negligible.
      if(i>0 && action!=='attack' && action!=='recover'){
        const front=positions[i-1],gap=front.meters-s.meters
        if(gap>=0 && gap<=24){
          // A following rider may briefly match a faster pack when sheltered.
          // The physical energy cost below determines whether this is sustainable.
          // Never cap speed to last tick's initial zero-speed checkpoint.
          const aerodynamic=clamp(1-Math.max(0,seg.gradePercent)/7,0,1)
          const shelter=(seg.surface==='cobbled'?.40:1)*aerodynamic*clamp(1-(seg.crosswindKph??0)/45,.25,1)
          const packSpeed=planned.get(front.riderId)!
          const supported=maxSolo*(1+.24*shelter)
          velocity=Math.max(velocity,Math.min(packSpeed+(gap>1?.16:0),supported))
        }
      }
      planned.set(s.riderId,velocity)
    }
    for(const s of positions){
      const r=riders.get(s.riderId)!
      const adjustedAction=effectiveActions.get(s.riderId)??'follow'
      const velocity=planned.get(s.riderId)!
      const remaining=state.totalMeters-s.meters
      if(velocity*dt>=remaining){
        s.finishSeconds=round6(before+remaining/velocity)
        s.meters=state.totalMeters
      } else {
        s.meters=round6(s.meters+velocity*dt)
      }
      s.speedMps=round6(velocity)
      const speedStress=Math.pow(velocity / Math.max(1,soloSpeedMps(r,segmentAt(input,Math.min(s.meters,state.totalMeters-.000001)),1,'follow',input.seed)),2)
      // Reserve depletion is tied to actual power demand AND costly bursts.
      // Repeating attack orders rapidly exhausts reserves; phases never refill it.
      const workCost=dt*.000006*speedStress + dt*(adjustedAction==='attack'?.00105:adjustedAction==='chase'?.000090:adjustedAction==='tempo'?.000026:0)
      const recovery=adjustedAction==='recover'?dt*.000025:0
      s.energy=round6(clamp(s.energy-workCost+recovery,0,1))
    }
    state.tick++
    state.elapsedSeconds=round6(before+dt)
    state.complete=state.states.every(s=>s.finishSeconds!==null)
    // Group identity and replay trajectory are committed at exactly the same
    // authoritative checkpoint, including a non-periodic final finish frame.
    if(state.elapsedSeconds%sample===0 || (state.complete && state.replay.at(-1)?.elapsedSeconds!==state.elapsedSeconds)){
      const frame={elapsedSeconds:state.elapsedSeconds,riders:state.states.map(s=>({riderId:s.riderId,meters:s.meters,energy:s.energy}))}
      advancePhysicalGroupTimelineV3(state.groupTimeline,frame)
      state.replay.push(frame)
    }
  }
  return state
}
/** Official road bunch times are granted only for actual <=1s arrivals;
 * physical arrival times remain available independently for verification. */
export function finalizePhysicalRaceV3(state: PhysicalRaceV3State): PhysicalRaceV3Result {
  if(!state.complete) throw new Error('Cannot publish unfinished physical race')
  const sorted=[...state.states].sort((a,b)=>(a.finishSeconds??Infinity)-(b.finishSeconds??Infinity)||a.riderId.localeCompare(b.riderId))
  if(!sorted.length||sorted.some(x=>x.finishSeconds===null))throw new Error('Missing finish')
  const first=sorted[0].finishSeconds!
  let groupSeconds=first
  const finish=sorted.map((r,i)=>{
    // No group flattening across gaps > 1s: gaps are measured to the
    // preceding PHYSICAL finisher, not to an arbitrary synthesized pack.
    if(i>0 && r.finishSeconds!-groupSeconds>1) groupSeconds=r.finishSeconds!
    return {
      riderId:r.riderId,teamId:r.teamId,rank:i+1,physicalFinishSeconds:r.finishSeconds!,
      officialFinishSeconds:groupSeconds,
      physicalGapSeconds:round6(r.finishSeconds!-first),
      officialGapSeconds:round6(groupSeconds-first),
    }
  })
  if(state.groupTimeline.history.length!==state.replay.length)throw Error('Group/replay checkpoint divergence')
  return {version:state.version,finish,replay:state.replay,groupFrames:state.groupTimeline.history,elapsedSeconds:state.elapsedSeconds,tickCount:state.tick}
}
export function runPhysicalRaceV3(input: PhysicalRaceV3Input): PhysicalRaceV3Result {
  const state=initializePhysicalRaceV3(input)
  // Simulation of 500 km at 1 m/s, dt=10s requires <50k ticks.
  advancePhysicalRaceV3(input,state,300_000)
  return finalizePhysicalRaceV3(state)
}