import { describe, expect, it } from 'vitest'
import { auditMountainProfileV2 } from './mountainProfileAuditV2.ts'

describe('mountain stage profile data quality: diagnosis only', () => {
  it('identifies Poyang Lakes Stage 7 profile under-sampling without rewriting climbing data', () => {
    const points = [
      { km: 0, elevationM: 210 }, { km: 18, elevationM: 240 },
      { km: 28, elevationM: 250 }, { km: 40, elevationM: 520 },
      { km: 56, elevationM: 285 }, { km: 66, elevationM: 320 },
      { km: 78, elevationM: 660 }, { km: 96, elevationM: 330 },
      { km: 108.5, elevationM: 220 },
    ] as const
    const frozenCopy = JSON.stringify(points)
    const audit = auditMountainProfileV2(2320, points)
    expect(audit.sampledGainM).toBe(685)
    expect(audit.declaredGainM).toBe(2320)
    expect(audit.sampledCoverageFraction).toBeCloseTo(685 / 2320, 6)
    expect(audit.profileNeedsReview).toBe(true)
    expect(audit.notes).toContain('coarse_samples_capture_less_than_half_declared_ascent')
    expect(JSON.stringify(points)).toBe(frozenCopy)
  })

  it('reports a physically consistent sampled route without demanding an arbitrary group size', () => {
    const profile = [
      { km: 0, elevationM: 100 }, { km: 10, elevationM: 900 },
      { km: 20, elevationM: 400 }, { km: 30, elevationM: 1100 },
    ]
    const audit = auditMountainProfileV2(1500, profile)
    expect(audit.sampledGainM).toBe(1500)
    expect(audit.sampledCoverageFraction).toBe(1)
    expect(audit.profileNeedsReview).toBe(false)
  })

  it('does not convert bad samples to fake stage terrain or rider results', () => {
    const audit = auditMountainProfileV2(2320, [
      { km: 80, elevationM: 600 }, { km: 30, elevationM: 200 },
    ])
    expect(audit.profileNeedsReview).toBe(true)
    expect(audit.validSampleCount).toBe(0)
    expect(audit.notes).toContain('missing_or_invalid_ordered_elevation_samples')
  })

  it('handles absent gain and sparse samples without guessing a replacement', () => {
    expect(auditMountainProfileV2(0, [{ km: 0, elevationM: 100 }]).profileNeedsReview).toBe(true)
    expect(auditMountainProfileV2(0, []).sampledCoverageFraction).toBeNull()
  })
})
