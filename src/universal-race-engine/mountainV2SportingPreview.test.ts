import {describe,expect,it} from 'vitest'
import {buildMountainV2SportingPreview} from './mountainV2SportingPreview.ts'
const finish=[
{riderId:'a',rank:1,elapsedSeconds:3600,gapSeconds:0},
{riderId:'b',rank:2,elapsedSeconds:3620,gapSeconds:20},
{riderId:'c',rank:3,elapsedSeconds:3650,gapSeconds:50},
]
describe('synthetic-only sporting preview',()=>{
 it('keeps finish order while computing separate incident and bonus adjustments',()=>{
  const r=buildMountainV2SportingPreview(finish,{nonFinisherIds:[],incidents:[{riderId:'a',penaltySeconds:15}],bonuses:[{riderId:'b',bonusSeconds:10}]})
  expect(r.classified.map(x=>x.riderId)).toEqual(['a','b','c'])
  expect(r.classified.map(x=>x.adjustedSeconds)).toEqual([3615,3610,3650])
  expect(r.authority).toBe('synthetic_only')
 })
 it('excludes DNF from classified finish without inventing an arrival',()=>{
  const r=buildMountainV2SportingPreview(finish,{nonFinisherIds:['c'],incidents:[],bonuses:[]})
  expect(r.nonFinishers).toEqual(['c'])
  expect(r.classified.map(x=>x.riderId)).toEqual(['a','b'])
 })
 it('rejects duplicates, outsiders and DNF time awards',()=>{
  expect(()=>buildMountainV2SportingPreview(finish,{nonFinisherIds:['x'],incidents:[],bonuses:[]})).toThrow()
  expect(()=>buildMountainV2SportingPreview(finish,{nonFinisherIds:['c'],incidents:[],bonuses:[{riderId:'c',bonusSeconds:4}]})).toThrow()
  expect(()=>buildMountainV2SportingPreview(finish,{nonFinisherIds:[],incidents:[{riderId:'a',penaltySeconds:1},{riderId:'a',penaltySeconds:2}],bonuses:[]})).toThrow()
 })
})
