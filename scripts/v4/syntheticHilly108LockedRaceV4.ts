/** Synthetic 18-AI-team, 108-rider, 174 km hilly research replay.
 * Public deterministic fixture; no Supabase or historical private input.
 */
import {PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION}
 from '../../src/universal-race-engine/runRaceEngine.ts'
import {prepareV4ShadowRace} from '../../src/race-engine-v4/templateFirstPlannerV4.ts'
function makeField(teamCount:number,aiTeams:number,
  {neutral=false,terrain='flat',seed='v4-mixed-real-solver-01',humanChase=false,humanPursuitTeam=false,phase2Chase=humanChase,phase3Chase=false,phase4Chase=humanChase}={}) {
 const teams=[],riders=[],stagePlans=[],teamControl=[]
 const stageId='v4-synthetic-stage-01',raceId='v4-synthetic-race-01'
 for(let t=0;t<teamCount;t++){
   const teamId='team-'+t,clubId='club-'+t
   const acceptedRiderIds=[],planRiders=[]
   const kind=t>=teamCount-aiTeams?'ai':'human'
   const designatedHumanPursuitTeam=humanPursuitTeam&&kind==='human'&&t===teamCount-aiTeams-1
   teamControl.push({teamId,kind})
   for(let i=0;i<6;i++){
      const ordinal=t*6+i,id='rider-'+String(ordinal).padStart(3,'0')
      acceptedRiderIds.push(id)
      const overall=62+(ordinal*11)%28
      riders.push({
       participantRiderId:'participant-'+id,riderId:id,teamId,
       participatingClubId:clubId,
       sprint:overall,climbing:overall,timeTrial:overall,flat:overall,
       endurance:overall,recovery:overall,resistance:overall,raceIQ:overall,
       teamwork:overall,morale:75,fatigueBeforeStage:12,
       raceSharpness:74,startStamina:91,recentFormScore:0,
       availabilityStatus:'fit',unavailableUntil:null,unavailableReason:null,
       startStatus:'starter',healthSnapshot:null,
       overall,snapshot:{displayName:id,startNumber:ordinal+1}
      })
      planRiders.push({
       riderId:id,stageRole:i===4?'breakaway_rider':
         i===0?'team_leader_gc':i===1?'sprinter':'helper_domestique',
       commands:{phase1:!neutral&&kind==='human'&&!designatedHumanPursuitTeam&&i===4?'join_breakaway':'follow_team_plan',
         phase2:phase2Chase&&designatedHumanPursuitTeam&&[2,3,5].includes(i)?'chase':'follow_team_plan',
         phase3:phase3Chase&&designatedHumanPursuitTeam&&[2,3,5].includes(i)?'chase':'follow_team_plan',
         phase4:phase4Chase&&designatedHumanPursuitTeam&&[2,3,5].includes(i)?'chase':'follow_team_plan'},
       equipmentSelection:null,supplySelection:null
      })
   }
   teams.push({
    participantTeamId:'participant-team-'+t,teamId,clubId,
    participatingClubId:clubId,ownerClubId:clubId,parentClubId:null,
    raceTeamEntryId:'entry-'+t,clubType:'main',acceptedRiderIds,
    snapshot:{teamName:'Test Team '+t,countryCode:'DE'},
   })
   stagePlans.push({teamId,teamTactic:'balanced',status:'locked',
     locked:true,defaulted:false,riders:planRiders,metadata:{}})
 }
 const input={
  engine:{engineKey:PPM_UNIVERSAL_RACE_ENGINE_KEY,
   engineVersion:PPM_UNIVERSAL_RACE_ENGINE_VERSION,deterministicSeed:seed},
  race:{raceId,raceType:'stage_race',stageCount:4},
  stage:{raceId,stageId,stageNumber:1,stageFormat:'road_race',
   terrainType:terrain,profileType:terrain==='mountain'?'mountain':'sprinter',
   finishType:terrain==='mountain'?'summit_finish':'flat_finish',
   distanceKm:120,elevationGainM:terrain==='mountain'?2600:500,
   summitFinish:terrain==='mountain',
   terrainPercentages:terrain==='mountain'?
      {flat:10,hilly:15,mountain:75,cobbled:0}:
      {flat:80,hilly:15,mountain:5,cobbled:0},
   profilePoints:terrain==='mountain'?
      [{km:0,elevationM:100},{km:60,elevationM:900},{km:120,elevationM:2600}]:
      [{km:0,elevationM:10},{km:60,elevationM:120},{km:120,elevationM:15}]},
  points:[
   {pointId:'start',stageId,pointType:'START',kmFromStart:0,name:'Start',
    komCategory:null,pointsScheme:[],timeBonusSeconds:[],
    isFinishPoint:false,sortOrder:0,metadata:{}},
   {pointId:'finish',stageId,pointType:'FINISH',kmFromStart:120,name:'Finish',
    komCategory:null,pointsScheme:[50,35,30],timeBonusSeconds:[10,6,4],
    isFinishPoint:true,sortOrder:1,metadata:{}},
  ],
  teams,riders,stagePlans,
  weather:{condition:'clear',temperatureC:22,windKmh:12,
   precipitationMm:0,rainProbabilityPct:10,cancelled:false,
   cancellationReason:null,source:'test',snapshot:{}},
  preparation:{equipment:{},staff:{},assets:{},raceSupplies:{},
   standardizedBonuses:{}}
 }
 return {input,options:{
  lock:{stageId,snapshotId:'v4-readonly-synthetic-snapshot',
   snapshotStatus:'locked',stageStartGameTs:'2000-06-01T12:00:00.000Z',
   lockCutoffGameTs:'2000-06-01T09:00:00.000Z',
   snapshotGameTs:'2000-06-01T09:00:00.000Z'},
  gameDate:'2000-06-01',teamControl,history:[],
  crosswindRisk:.20,descentRisk:.25,rainRisk:.1,
 }}
}
const {input,options}=makeField(18,18,{
 terrain:'hilly',neutral:false,seed:'v4-offline-108-riders-hilly-174'
})
input.stage.terrainType='hilly'
input.stage.profileType='rolling'
input.stage.finishType='flat_finish'
input.stage.distanceKm=174
input.stage.elevationGainM=1520
input.stage.terrainPercentages={flat:27,hilly:58,mountain:15,cobbled:0}
input.stage.profilePoints=[
 {km:0,elevationM:30},{km:27.84,elevationM:245},
 {km:62.64,elevationM:65},{km:99.18,elevationM:410},
 {km:132.24,elevationM:135},{km:156.6,elevationM:330},
 {km:174,elevationM:155}
]
for(const point of input.points)
 if(point.pointType==='FINISH')point.kmFromStart=174
const plan=prepareV4ShadowRace(input,options)
if(plan.status!=='ai_prepared'||plan.aiTeams!==18||plan.humanTeams!==0||
   plan.combinedInput.riders.length!==108)throw Error('SYNTHETIC_108_FIXTURE_BAD')
process.stdout.write(JSON.stringify({input:plan.combinedInput,options}))
