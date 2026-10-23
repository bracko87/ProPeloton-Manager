/// <reference lib="deno.ns" />
/**
 * Isolated, NON-AUTHORITATIVE production-runtime Mountain V2 canary.
 * This is NOT an official race runner. Does not import an official worker,
 * use race write RPCs, persist results or update any race/GC/prize/replay.
 *
 * Public GET only runs a fixed, tiny synthetic engine self-test.
 * Real registered-cohort POST needs the already configured worker secret,
 * verified by the same server-side RPC as official race workers.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { runMountainV2SyntheticStage } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/cdc27d8b89004eeddef369a0ef083cd96a427694/src/universal-race-engine/mountainV2SyntheticStage.ts";
import { auditMountainProfileV2 } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/cdc27d8b89004eeddef369a0ef083cd96a427694/src/universal-race-engine/mountainProfileAuditV2.ts";
import { selectMountainV2Stage } from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/cdc27d8b89004eeddef369a0ef083cd96a427694/src/universal-race-engine/mountainV2StageRegistry.ts";
const SOURCE_COMMIT="cdc27d8b89004eeddef369a0ef083cd96a427694";
const CONTRACT="mountain_v2_read_only_stage_shadow_canary_v1";
const ALLOWED_SCENARIOS=new Set(["steady","team_attacks"]);
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const num=(value:unknown)=>Number(value);
const validId=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function segmentsFor(points:any[]){
 if(!Array.isArray(points)||points.length<3||points.length>2048)throw Error("invalid_profile_points");
 const ordered=points.map(p=>({km:num(p.km),elevationM:num(p.elevation_m??p.elevation)}));
 if(ordered.some(p=>!Number.isFinite(p.km)||!Number.isFinite(p.elevationM)))throw Error("invalid_profile_elevation");
 if(Math.abs(ordered[0].km)>0.001)throw Error("missing_profile_start");
 const segments=ordered.slice(1).map((p,i)=>{
   const prior=ordered[i],lengthKm=p.km-prior.km;
   const gradientPercent=(p.elevationM-prior.elevationM)/(10*lengthKm);
   if(!(lengthKm>0)||!Number.isFinite(gradientPercent)||Math.abs(gradientPercent)>30)throw Error("invalid_profile_geometry");
   return {lengthKm,gradientPercent,terrain:gradientPercent>1?"climb":gradientPercent< -1?"descent":"flat"};
 });
 return {ordered,segments};
}
function summary(scenario:string,result:any,riders:any[],audit:any){
 const physical=result.physicalCheckpoints.at(-1);
 const last=result.replay.at(-1);
 if(!physical||!last||result.finish.length!==riders.length)throw Error("inconsistent_synthetic_finish");
 if(result.finish.some((r:any)=>Math.abs(last.riderElapsedSeconds[r.riderId]-r.elapsedSeconds)>0.00001))throw Error("inconsistent_synthetic_replay");
 return {
   contract:CONTRACT,source_commit:SOURCE_COMMIT,
   authority:"synthetic_only",published_to_game:false,scenario,
   rider_count:riders.length,checkpoint_count:result.replay.length,
   distance_km:physical.km,
   declared_ascent_m:audit.declaredGainM,sampled_ascent_m:audit.sampledGainM,
   group_count:physical.groups.length,group_sizes:physical.groups.map((g:any)=>g.riderIds.length),
   zero_energy_count:physical.riders.filter((r:any)=>r.energy<=0).length,
   tenth_gap_seconds:result.finish[Math.min(9,result.finish.length-1)].gapSeconds,
   last_gap_seconds:result.finish.at(-1).gapSeconds,
   // The IDs here are anonymous R001... labels, not production rider UUIDs.
   standings:result.finish.map((r:any)=>({
     rank:r.rank,rider:r.riderId,
     elapsed_seconds:r.elapsedSeconds,gap_seconds:r.gapSeconds,
     group:physical.groups.find((g:any)=>g.riderIds.includes(r.riderId))?.groupId??null,
   })),
 };
}
Deno.serve(async req=>{
 try{
   if(req.method==="GET"){
     // Unprivileged readiness probe runs real V2 on a three-rider synthetic course.
     // No database access, user data, secrets or official-race mutation.
     const segments=[{lengthKm:4,gradientPercent:5,terrain:"climb"},{lengthKm:3,gradientPercent:-4,terrain:"descent"}];
     const riders=[
       {riderId:"R001",teamId:"T1",climbing:92,endurance:88,descending:65,energy:86,effort:"steady",gapSeconds:0},
       {riderId:"R002",teamId:"T2",climbing:80,endurance:81,descending:65,energy:86,effort:"steady",gapSeconds:0},
       {riderId:"R003",teamId:"T3",climbing:61,endurance:66,descending:65,energy:86,effort:"steady",gapSeconds:0},
     ];
     const result=runMountainV2SyntheticStage(riders as any,segments as any);
     return respond({status:"ok",contract:CONTRACT,source_commit:SOURCE_COMMIT,
       mode:"synthetic_canary_only",authority:result.authority,
       rider_count:result.finish.length,checkpoint_count:result.replay.length,
       winner:result.finish[0].riderId,official_engine_unchanged:true});
   }
   if(req.method!=="POST")return respond({error:"method_not_allowed"},405);
   const secret=req.headers.get("x-universal-race-worker-secret")?.trim();
   if(!secret)return respond({error:"worker_authorization_required"},401);
   const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
   if(!url||!key)return respond({error:"server_not_configured"},503);
   const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   const check=await sb.rpc("verify_universal_race_worker_secret_v1",{p_secret:secret});
   if(check.error||check.data!==true)return respond({error:"forbidden"},403);
   let body:any;
   try{body=await req.json()}catch{return respond({error:"invalid_json"},400)}
   const stageId=body?.stage_id,scenario=body?.scenario??"steady";
   if(!validId(stageId)||!ALLOWED_SCENARIOS.has(scenario))return respond({error:"invalid_request"},400);
   const stageQuery=await sb.from("race_stages").select("id,race_id,terrain_type,stage_format,distance_km,elevation_gain_m,stage_date").eq("id",stageId).maybeSingle();
   if(stageQuery.error||!stageQuery.data)return respond({error:"stage_unavailable"},404);
   const stage=stageQuery.data;
   const selected=selectMountainV2Stage({stageId,stageFormat:stage.stage_format,terrainType:stage.terrain_type});
   if(selected.mode!=="sandbox_shadow_only")return respond({error:"stage_not_allowlisted"},403);
   const official=await sb.from("race_stage_results").select("id",{count:"exact",head:true}).eq("stage_id",stageId);
   if(official.error)return respond({error:"result_state_unavailable"},503);
   if((official.count??0)>0)return respond({error:"already_completed_stage"},409);
   const p=await sb.from("race_stage_profile_details").select("profile_points").eq("stage_id",stageId).maybeSingle();
   if(p.error||!p.data)return respond({error:"profile_unavailable"},422);
   const {ordered,segments}=segmentsFor(p.data.profile_points);
   if(Math.abs(ordered.at(-1)!.km-num(stage.distance_km))>0.01)return respond({error:"incomplete_distance_coverage"},422);
   const audit=auditMountainProfileV2(num(stage.elevation_gain_m),ordered);
   if(audit.profileNeedsReview)return respond({error:"profile_requires_review",notes:audit.notes},422);
   const participants=await sb.from("race_participant_riders")
     .select("rider_id,team_id").eq("race_id",stage.race_id).order("rider_id",{ascending:true}).limit(250);
   if(participants.error||!participants.data||participants.data.length<2||participants.data.length>240)return respond({error:"invalid_roster"},422);
   const roster=participants.data;
   const skills=await sb.from("riders").select("id,climbing,endurance,fatigue").in("id",roster.map((x:any)=>x.rider_id)).limit(250);
   if(skills.error||!skills.data||skills.data.length!==roster.length)return respond({error:"missing_rider_attributes"},422);
   const byId=new Map(skills.data.map((x:any)=>[x.id,x]));
   const teamIds=[...new Set(roster.map((x:any)=>x.team_id))].sort();
   const entries=roster.map((row:any,i:number)=>{
     const attrs:any=byId.get(row.rider_id);
     if(!attrs||!Number.isFinite(num(attrs.climbing))||!Number.isFinite(num(attrs.endurance)))throw Error("missing_rider_skills");
     return {riderId:"R"+String(i+1).padStart(3,"0"),teamId:"T"+String(teamIds.indexOf(row.team_id)+1).padStart(2,"0"),
       climbing:num(attrs.climbing),endurance:num(attrs.endurance),descending:65,
       energy:Math.max(0,Math.min(100,85-num(attrs.fatigue??0)*0.2)),
       effort:"steady" as const,gapSeconds:0};
   });
   if(scenario==="team_attacks"){
     const best=new Map<string,number>(),worst=new Map<string,number>();
     for(let i=0;i<entries.length;i++){
       const r=entries[i],b=best.get(r.teamId),w=worst.get(r.teamId);
       if(b===undefined||r.climbing>entries[b].climbing)best.set(r.teamId,i);
       if(w===undefined||r.climbing<entries[w].climbing)worst.set(r.teamId,i);
     }
     entries.forEach((r,i)=>{
       if(best.get(r.teamId)===i)(r as any).effort="attack";
       else if(worst.get(r.teamId)===i)(r as any).effort="support";
     });
   }
   const result=runMountainV2SyntheticStage(entries as any,segments as any);
   return respond({...summary(scenario,result,entries,audit),
     stage_id:stageId,stage_game_date:stage.stage_date,
     inputs:"registered_roster_and_current_skills; synthetic tactics/energy; not actual start-line snapshot"});
 }catch{
   // Never echo SQL errors, rider data or secrets to caller.
   return respond({error:"shadow_calculation_failed",official_engine_unchanged:true},500);
 }
});
