import { describe, expect, it } from 'vitest'
import {
  mountainV2PhysicalGroups,
  simulateMountainV2Contacts,
  type MountainV2Rider,
  type MountainV2Segment,
} from './mountainContactPhysicsV2.ts'

const rider = (
  riderId: string,
  climbing: number,
  energy = 75,
  gapSeconds = 0,
  descending = 65,
  effort: MountainV2Rider['effort'] = 'steady',
): MountainV2Rider => ({
  riderId,
  teamId: 'team-' + riderId,
  climbing,
  endurance: climbing,
  descending,
  energy,
  gapSeconds,
  effort,
})

describe('experimental mountain V2 continuous contact — synthetic only', () => {
  it('uses sustained ability and energy to form physically separated groups', () => {
    const entrants = [
      rider('climber-a', 92),
      rider('climber-b', 90),
      rider('allrounder', 73),
      rider('rouleur', 53),
      rider('spent-rider', 78, 6),
    ]
    const original = JSON.stringify(entrants)
    const climb: MountainV2Segment = {
      lengthKm: 12,
      gradientPercent: 8,
      terrain: 'climb',
    }
    const result = simulateMountainV2Contacts(entrants, [climb])
    const gaps = new Map(result.finalRiders.map((r) => [r.riderId, r.gapSeconds]))
    expect(gaps.get('climber-a')).toBe(0)
    expect(gaps.get('climber-b')).toBeLessThan(gaps.get('allrounder')!)
    expect(gaps.get('allrounder')).toBeLessThan(gaps.get('rouleur')!)
    expect(gaps.get('spent-rider')).toBeGreaterThan(0)
    expect(result.finalGroups.length).toBeGreaterThan(1)
    expect(result.finalGroups.length).toBeLessThanOrEqual(entrants.length)
    expect(JSON.stringify(entrants)).toBe(original)
  })

  it('is deterministic for identical physical conditions without hidden randomness', () => {
    const entrants = [
      rider('a', 85), rider('b', 70), rider('c', 55),
    ]
    const course: MountainV2Segment[] = [
      { terrain: 'climb', lengthKm: 8, gradientPercent: 6 },
      { terrain: 'descent', lengthKm: 7, gradientPercent: -4.5 },
      { terrain: 'flat', lengthKm: 12, gradientPercent: 0 },
    ]
    expect(simulateMountainV2Contacts(entrants, course))
      .toEqual(simulateMountainV2Contacts(entrants, course))
  })

  it('does not magically reunite a distant rider on a short descent', () => {
    const race = simulateMountainV2Contacts([
      rider('front', 70, 80, 0, 65),
      rider('far-behind', 70, 80, 120, 95),
    ], [{ terrain: 'descent', lengthKm: 1, gradientPercent: -5 }])
    expect(race.finalRiders.find((x) => x.riderId === 'far-behind')!.gapSeconds)
      .toBeGreaterThan(60)
    expect(race.finalGroups).toHaveLength(2)
  })

  it('allows physically faster descending riders to bridge over enough road', () => {
    const race = simulateMountainV2Contacts([
      rider('front', 70, 80, 0, 40),
      rider('descending-specialist', 70, 80, 25, 95),
    ], [
      { terrain: 'descent', lengthKm: 12, gradientPercent: -5 },
    ])
    const front = race.finalRiders.find((x) => x.riderId === 'front')!
    const chaser = race.finalRiders.find((x) => x.riderId === 'descending-specialist')!
    expect(chaser.gapSeconds).toBeLessThan(front.gapSeconds)
    expect(chaser.gapSeconds).toBe(0)
  })

  it('charges attacks more energy and awards speed only during the attack', () => {
    const result = simulateMountainV2Contacts([
      rider('attacker', 80, 85, 0, 70, 'attack'),
      rider('steady', 80, 85, 0, 70, 'steady'),
    ], [{ terrain: 'climb', lengthKm: 5, gradientPercent: 7 }])
    const attacker = result.finalRiders.find((x) => x.riderId === 'attacker')!
    const steady = result.finalRiders.find((x) => x.riderId === 'steady')!
    expect(attacker.gapSeconds).toBe(0)
    expect(attacker.energy).toBeLessThan(steady.energy)
    expect(attacker.speedKmh).toBeGreaterThan(steady.speedKmh)
  })

  it('forms contact groups from actual arrival gaps rather than a scripted size', () => {
    const grouped = mountainV2PhysicalGroups([
      { riderId: 'a', teamId: 't', gapSeconds: 0, energy: 50, speedKmh: 22, effort: 'steady' },
      { riderId: 'b', teamId: 't', gapSeconds: 1, energy: 50, speedKmh: 22, effort: 'steady' },
      { riderId: 'c', teamId: 't', gapSeconds: 4.8, energy: 50, speedKmh: 22, effort: 'steady' },
      { riderId: 'd', teamId: 't', gapSeconds: 7, energy: 50, speedKmh: 22, effort: 'steady' },
      { riderId: 'e', teamId: 't', gapSeconds: 25, energy: 50, speedKmh: 22, effort: 'steady' },
    ])
    expect(grouped.map((group) => group.riderIds)).toEqual([
      ['a','b'],['c','d'],['e'],
    ])
    expect(new Set(grouped.flatMap((group) => group.riderIds)).size).toBe(5)
  })

  it('rejects duplicate rider IDs and invalid routes before simulating', () => {
    expect(() => simulateMountainV2Contacts([rider('x',80),rider('x',60)],[
      {terrain:'climb',lengthKm:5,gradientPercent:6},
    ])).toThrow('Duplicate rider ID')
    expect(() => simulateMountainV2Contacts([rider('x',80)],[
      {terrain:'descent',lengthKm:5,gradientPercent:5},
    ])).toThrow('Invalid physical terrain segment')
  })
})
