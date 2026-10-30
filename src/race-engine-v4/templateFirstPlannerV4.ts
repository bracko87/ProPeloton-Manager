/**
 * V4 template-first RESEARCH ONLY. No V2 solver, Supabase, publish, or replay.
 * Pure adapter: prepare one race input from locked human commands and
 * templates which apply ONLY to authoritative AI-controlled teams.
 */
import type { UniversalRaceEngineInput } from '../universal-race-engine/runRaceEngine.ts'
import { FLAT_SCENARIO_TEMPLATES_V1 } from '../universal-race-engine/flatScenarioV1.ts'
import { HILLY_SCENARIO_TEMPLATES_V1 } from '../universal-race-engine/hillyScenarioV1.ts'
import { MOUNTAIN_SCENARIO_TEMPLATES_V1 } from '../universal-race-engine/mountainScenarioV1.ts'
import { COBBLED_SCENARIO_TEMPLATES_V1 } from '../universal-race-engine/cobbledScenarioV1.ts'

type Pair = readonly [number,number]
type Terrain = 'flat'|'hilly'|'mountain'|'cobbled'
type Phase = 1|2|3|4
type Command = 'join_breakaway'|'attack'|'chase_breakaway'|'control_race'|'final_sprint'
interface Directive {readonly breakawayRiders:Pair;readonly attackRiders:Pair;
 readonly controlTeams:Pair;readonly chaseTeams:Pair;readonly lateAttackers:Pair}
interface Template {readonly id:string;readonly label:string;readonly family:string;
 readonly targets:object;readonly requiresCrosswind?:boolean;
 readonly requiresDescentRisk?:boolean;readonly phases:Record<'phase1'|'phase2'|'phase3'|'phase4',Directive>;
 readonly breakaways:readonly {readonly targetPeakGapSec:Pair;readonly catchKmRemaining?:Pair}[]}
export const V4_VERSION='v4_template_first_ai_only_research_01' as const
export const V4_CATALOGS:Readonly<Record<Terrain,readonly Template[]>>={
 flat:FLAT_SCENARIO_TEMPLATES_V1 as readonly Template[],
 hilly:HILLY_SCENARIO_TEMPLATES_V1 as readonly Template[],
 mountain:MOUNTAIN_SCENARIO_TEMPLATES_V1 as readonly Template[],
 cobbled:COBBLED_SCENARIO_TEMPLATES_V1 as readonly Template[],
}
export interface V4Options {
 readonly lock:{readonly stageId:string;readonly snapshotId:string;
   readonly snapshotStatus:'locked';readonly stageStartGameTs:string;
   readonly lockCutoffGameTs:string;readonly snapshotGameTs:string}
 readonly teamControl:readonly {readonly teamId:string;readonly kind:'human'|'ai'}[]
 readonly gameDate:string
 readonly history?:readonly {readonly raceId:string;readonly gameDate:string;
   readonly templateId:string;readonly family:string}[]
 readonly crosswindRisk?:number
 readonly descentRisk?:number
 readonly rainRisk?:number
}
export interface V4AIIntent {
 readonly source:'v4_ai_template';readonly teamId:string;readonly riderId:string;
 readonly phase:Phase;readonly command:Command;readonly templateId:string
}
export interface V4Preparation {
 readonly version:typeof V4_VERSION;readonly status:'neutral_all_human'|'ai_prepared'|'unsupported_stage'
 readonly selectedTemplate:null|{readonly id:string;readonly label:string;readonly family:string;
   readonly seed:string;readonly eligible:number;readonly catalogSize:number;
   readonly targetsAreNotGuaranteed:true;readonly breakawayTargetsSec:readonly Pair[];
   readonly intendedCatchKmRemaining:readonly (Pair|null)[]}
 readonly intents:readonly V4AIIntent[]
 readonly combinedInput:UniversalRaceEngineInput
 readonly aiTeams:number;readonly humanTeams:number;readonly snapshotId:string
 readonly calculationCount:0;readonly productionWrites:0;readonly v2EngineInvoked:false
}
function hash(s:string):number {
 let h=2166136261>>>0
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
 return h>>>0
}
const roll=(s:string)=>hash(s)/4294967296
const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v))
const pick=(r:Pair,seed:string)=>Math.round(Math.min(...r)+roll(seed)*(Math.abs(r[1]-r[0])+1))
function verify(input:UniversalRaceEngineInput,opt:V4Options) {
 const l=opt.lock
 const start=Date.parse(l.stageStartGameTs),cutoff=Date.parse(l.lockCutoffGameTs)
 const snap=Date.parse(l.snapshotGameTs)
 if(l.stageId!==input.stage.stageId||l.snapshotStatus!=='locked'||!l.snapshotId||
   ![start,cutoff,snap].every(Number.isFinite)||start-cutoff!==10800000||
   snap<cutoff||snap>=start)throw Error('V4 requires immutable locked stage snapshot, 3 game hours before start')
 const roster=new Set(input.teams.map(t=>t.teamId))
 const plans=new Set(input.stagePlans.map(p=>p.teamId))
 const owners=new Map<string,'human'|'ai'>()
 if(roster.size!==input.teams.length||plans.size!==input.stagePlans.length||
   roster.size!==plans.size||[...roster].some(id=>!plans.has(id))||
   opt.teamControl.length!==roster.size)throw Error('V4 team/plan ownership mismatch')
 for(const t of opt.teamControl){
   if(!roster.has(t.teamId)||owners.has(t.teamId)||
      (t.kind!=='human'&&t.kind!=='ai'))throw Error('V4 ambiguous team ownership')
   owners.set(t.teamId,t.kind)
 }
 return owners
}
function choose(input:UniversalRaceEngineInput,opt:V4Options,catalog:readonly Template[]) {
 const terrain=String(input.stage.terrainType),cross=clamp(opt.crosswindRisk??0)
 const descent=clamp(opt.descentRisk??0),rain=clamp(opt.rainRisk??0)
 const mountain=terrain==='mountain'?1:terrain==='hilly'?.63:.18
 const elev=clamp(Number(input.stage.elevationGainM)/3600)
 // Only PRE-STAGE data. No preliminary race calculation or outcomes.
 const profile:Record<string,number>={
   crosswindRisk:cross,descentRisk:descent,rainRisk:rain,
   sprintControlStrength:terrain==='flat'?.75:.36,chaseStrength:.58,
   attackDensity:.55,bridgeIntent:.50,breakawayQuality:.57,
   sprintDepth:terrain==='flat'?.74:.34,
   puncheurDepth:terrain==='hilly'?.78:.4,
   climberDepth:.17+.73*mountain,gcDepth:.50+.3*mountain,
   gcPressure:.45+.35*mountain,protectLeaderStrength:.55,
   summitFinishSuitability:input.stage.summitFinish?.94:.26,
   uphillFinishSuitability:.72*mountain,cobbleDepth:terrain==='cobbled'?.85:.1,
   fragmentationRisk:clamp(.23+.33*mountain+.2*cross+.2*elev),
   averageFatigue:.4,fieldStrength:.58,responsibilityConcentration:.45,
   surfaceRisk:rain,heatStress:.2,
 }
 const eligible=catalog.filter(t=>
   (!t.requiresCrosswind||cross>=.65)&&(!t.requiresDescentRisk||descent>=.55))
 if(!eligible.length)throw Error('V4 no compatible AI template')
 const history=opt.history??[]
 const used=new Set(history.filter(x=>x.raceId===input.race.raceId).map(x=>x.templateId))
 const sameDay=new Set(history.filter(x=>x.gameDate===opt.gameDate).map(x=>x.templateId))
 const previous=history.filter(x=>x.raceId===input.race.raceId).at(-1)
 const unused=eligible.filter(t=>!used.has(t.id))
 const pool=unused.length?unused:eligible
 const seed='v4:'+input.race.raceId+':'+input.stage.stageId+':'+opt.gameDate
 const sorted=pool.map(t=>{
   const targets=Object.entries(t.targets) as [string,number][]
   const affinity=targets.length?targets.reduce((sum,[key,value])=>
     sum+1-Math.abs((profile[key]??.5)-value),0)/targets.length:.5
   const score=affinity-(sameDay.has(t.id)?.22:0)-
      (previous?.family===t.family?.10:0)+(roll(seed+':'+t.id)-.5)*.065
   return {template:t,score}
 }).sort((a,b)=>b.score-a.score||a.template.id.localeCompare(b.template.id))
 const nearby=sorted.filter(x=>x.score>=sorted[0].score-.12).slice(0,5)
 const choice=nearby[Math.floor(roll(seed+':choice')*nearby.length)]
 return {template:choice.template,seed,eligible:eligible.length}
}
function planAI(input:UniversalRaceEngineInput,ai:Set<string>,t:Template,seed:string) {
 const pool=input.stagePlans.filter(p=>ai.has(p.teamId)).flatMap(p=>
   p.riders.map(r=>({teamId:p.teamId,riderId:r.riderId})))
 const intents:V4AIIntent[]=[]
 const already=new Set<string>()
 const emit=(phase:Phase,command:Command,count:number,salt:string)=>{
   const ordered=[...pool].sort((a,b)=>
     hash(seed+':'+salt+':'+a.riderId)-hash(seed+':'+salt+':'+b.riderId)||
       a.riderId.localeCompare(b.riderId))
   const usedTeams=new Set<string>()
   for(const rider of ordered){
     if(count<=0)break
     if(already.has(phase+':'+rider.riderId))continue
     if(usedTeams.has(rider.teamId)&&usedTeams.size<Math.min(count,ai.size))continue
     already.add(phase+':'+rider.riderId);usedTeams.add(rider.teamId)
     intents.push({...rider,phase,command,templateId:t.id,source:'v4_ai_template'})
     count--
   }
 }
 for(const phase of [1,2,3,4] as const){
   const p=t.phases['phase'+phase as keyof Template['phases']]
   if(phase===4){
     emit(phase,'final_sprint',pick(p.lateAttackers,seed+':p4:finish'),'finish')
   }else{
     emit(phase,'join_breakaway',pick(p.breakawayRiders,seed+':p'+phase+':break'),'break'+phase)
     emit(phase,'attack',pick(p.attackRiders,seed+':p'+phase+':attack'),'attack'+phase)
     emit(phase,'chase_breakaway',pick(p.chaseTeams,seed+':p'+phase+':chase'),'chase'+phase)
     emit(phase,'control_race',pick(p.controlTeams,seed+':p'+phase+':control'),'control'+phase)
   }
 }
 return intents.sort((a,b)=>a.phase-b.phase||a.teamId.localeCompare(b.teamId)||
   a.riderId.localeCompare(b.riderId))
}
export function prepareV4ShadowRace(
 input:UniversalRaceEngineInput,opt:V4Options
):V4Preparation {
 const owner=verify(input,opt)
 const ai=new Set([...owner].filter(([,kind])=>kind==='ai').map(([id])=>id))
 const common={version:V4_VERSION,aiTeams:ai.size,humanTeams:owner.size-ai.size,
   snapshotId:opt.lock.snapshotId,calculationCount:0 as const,
   productionWrites:0 as const,v2EngineInvoked:false as const}
 if(input.stage.stageFormat!=='road_race'||
    !Object.prototype.hasOwnProperty.call(V4_CATALOGS,input.stage.terrainType))
   return {...common,status:'unsupported_stage',selectedTemplate:null,
     intents:[],combinedInput:input}
 if(!ai.size)return {...common,status:'neutral_all_human',selectedTemplate:null,
   intents:[],combinedInput:input}
 const catalog=V4_CATALOGS[input.stage.terrainType as Terrain]
 const chosen=choose(input,opt,catalog)
 const intents=planAI(input,ai,chosen.template,chosen.seed)
 const commands=new Map(intents.map(x=>[x.teamId+':'+x.riderId+':'+x.phase,x.command]))
 const stagePlans=input.stagePlans.map(plan=>{
  if(!ai.has(plan.teamId))return plan // preserve exact human plan reference
  return {...plan,riders:plan.riders.map(rider=>{
   const changes:Record<string,string>={}
   for(const phase of [1,2,3,4] as const){
    const cmd=commands.get(plan.teamId+':'+rider.riderId+':'+phase)
    if(cmd)changes['phase'+phase]=cmd
   }
   return Object.keys(changes).length?
     {...rider,commands:{...rider.commands,...changes} as typeof rider.commands}:rider
  })}
 })
 // Single combined input: actual V2 calculation can consume this later,
 // but nothing in V4 invokes that calculation or writes official outcomes.
 const combinedInput:UniversalRaceEngineInput={...input,stagePlans}
 return {...common,status:'ai_prepared',
   selectedTemplate:{id:chosen.template.id,label:chosen.template.label,
    family:chosen.template.family,seed:chosen.seed,eligible:chosen.eligible,
    catalogSize:catalog.length,targetsAreNotGuaranteed:true,
    breakawayTargetsSec:chosen.template.breakaways.map(b=>b.targetPeakGapSec),
    intendedCatchKmRemaining:chosen.template.breakaways.map(b=>b.catchKmRemaining??null)},
   intents,combinedInput}
}
