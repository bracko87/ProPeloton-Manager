import assert from 'node:assert/strict';
import {constrainedLaneTargetV3,researchRoadEnvelopeV3}
 from './a2VariableRoadWidthV3.mjs';
const bodyHalfWidthM=.3,physicalLateralCollisionM=.8;
const cases=[
 {road:'double_pinch',x:658.5,y:.41,nearY:1.25,v:9},
 {road:'staged_pinch',x:672,y:.42925,nearY:1.25,v:9}
];
for(const a of cases){
 const now=researchRoadEnvelopeV3(a.road,a.x);
 const look=researchRoadEnvelopeV3(a.road,a.x+a.v*4);
 const force=constrainedLaneTargetV3(a.road,a.x,a.v,a.y,{
  previewSeconds:4,bodyHalfWidthM});
 assert.equal(now.minY,0);
 assert(look.minY>now.minY);
 assert(force.changed,'road-taper command must override hold-steer intent');
 assert(force.targetY>a.y,
  'outer rider is compelled inward despite held target');
 assert(a.nearY-force.targetY<physicalLateralCollisionM,
  'forcing lane without stagger creates overlap risk with same-row neighbor');
 const reflected=constrainedLaneTargetV3(a.road,a.x,a.v,4.4-a.y,{
  previewSeconds:4,bodyHalfWidthM});
 assert(Math.abs(force.targetY+reflected.targetY-4.4)<1e-9);
 const noTaper=constrainedLaneTargetV3('constant',a.x,a.v,a.y,{
  previewSeconds:4,bodyHalfWidthM});
 assert.equal(noTaper.targetY,a.y,'unconstricted road should honor hold steer');
}
console.log(JSON.stringify({study:'A102_A64_GEOMETRIC_PREVIEW_FORCE_TRACE',
 status:'PASS',environments:cases.map(c=>c.road),
 mandatoryInwardSteeringWithoutHeadway:true,
 sourceUnchanged:true,
 fixRequiresJointLongitudinalAndLateralClearance:true,
 doesNotProvePhysicalImpossibility:true,officialWrites:0}));
