/** Research-only route fidelity checks: never invent missing climbing elevation. */
export interface ProfilePointV3 { readonly km:number; readonly elevationM:number }
export interface NamedClimbV3 { readonly finishKm:number; readonly lengthKm:number; readonly averageGradientPercent:number }
export interface RouteFidelityV3 {
 readonly declaredGainM:number
 readonly profiledPositiveGainM:number
 readonly missingGainM:number
 readonly positiveGainCoverage:number
 readonly climbValidationIssues:readonly string[]
 readonly profileIncomplete:boolean
 readonly guidance:readonly string[]
}
export function assessRouteFidelityV3(profile:readonly ProfilePointV3[],lengthKm:number,declaredGainM:number,climbs:readonly NamedClimbV3[]=[]):RouteFidelityV3 {
 if(!Number.isFinite(lengthKm)||lengthKm<=0||!Number.isFinite(declaredGainM)||declaredGainM<0||profile.length<2)throw new Error('Invalid stage distance, gain or profile')
 const issues:string[]=[]
 let gain=0
 for(let i=0;i<profile.length;i++){
  const p=profile[i]
  if(!Number.isFinite(p.km)||!Number.isFinite(p.elevationM)||p.km<0||p.km>lengthKm+.001||i>0&&p.km<=profile[i-1].km)throw new Error('Invalid or unsorted elevation profile')
  if(i>0)gain+=Math.max(0,p.elevationM-profile[i-1].elevationM)
 }
 if(Math.abs(profile[0].km)>0.001||Math.abs(profile.at(-1)!.km-lengthKm)>0.001)issues.push('missing_profile_endpoints')
 for(const [i,c] of climbs.entries()){
  if(!Number.isFinite(c.finishKm)||!Number.isFinite(c.lengthKm)||!Number.isFinite(c.averageGradientPercent)||c.lengthKm<=0||c.finishKm-c.lengthKm<0||c.finishKm>lengthKm+.001||c.averageGradientPercent<=0||c.averageGradientPercent>22){issues.push(`invalid_climb_${i+1}`);continue}
  const climbGain=c.lengthKm*10*c.averageGradientPercent
  if(climbGain>declaredGainM+50)issues.push(`climb_gain_exceeds_stage_${i+1}`)
 }
 const missing=Math.max(0,declaredGainM-gain)
 const coverage=declaredGainM===0?1:Math.min(1,gain/declaredGainM)
 const incomplete=issues.length>0||missing>Math.max(150,declaredGainM*.25)
 return {declaredGainM,profiledPositiveGainM:Math.round(gain*1e3)/1e3,missingGainM:Math.round(missing*1e3)/1e3,positiveGainCoverage:Math.round(coverage*1e4)/1e4,climbValidationIssues:issues,profileIncomplete:incomplete,guidance:incomplete?['Do not fabricate hill gradients or gap targets from missing profile detail','Acquire route geometry or independently verified KOM segments before sporting acceptance']:[]}
}
