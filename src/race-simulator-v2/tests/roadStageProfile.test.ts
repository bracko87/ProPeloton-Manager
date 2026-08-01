import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calculateStageProgress,
  classifyTerrainPhase,
  createRoadStageProfile,
  getTerrainPhaseAtKm,
} from '../core/roadStageProfile'
import {
  flatRoadStageProfileInput,
  hillyRoadStageProfileInput,
  mountainRoadStageProfileInput,
} from '../fixtures/roadStageProfiles'

describe(
  'B2.1 shared road-stage profile model',
  () => {
    it(
      'creates identical normalized output for identical input',
      () => {
        expect(
          createRoadStageProfile(
            hillyRoadStageProfileInput,
          ),
        ).toEqual(
          createRoadStageProfile(
            hillyRoadStageProfileInput,
          ),
        )
      },
    )

    it(
      'classifies the deterministic terrain thresholds',
      () => {
        expect(classifyTerrainPhase(-1.5)).toBe(
          'descent',
        )
        expect(classifyTerrainPhase(-1.49)).toBe(
          'flat',
        )
        expect(classifyTerrainPhase(1.49)).toBe(
          'flat',
        )
        expect(classifyTerrainPhase(1.5)).toBe(
          'rolling',
        )
        expect(classifyTerrainPhase(3.99)).toBe(
          'rolling',
        )
        expect(classifyTerrainPhase(4)).toBe(
          'climb',
        )
      },
    )

    it(
      'normalizes the flat fixture to one merged flat finish phase',
      () => {
        const profile = createRoadStageProfile(
          flatRoadStageProfileInput,
        )

        expect(profile.stageType).toBe('flat')
        expect(profile.finishType).toBe('sprint')
        expect(profile.terrainPhases).toHaveLength(1)
        expect(
          profile.terrainPhases[0].terrainType,
        ).toBe('flat')
        expect(
          profile.terrainPhases[0]
            .sourceSegmentCount,
        ).toBe(3)
        expect(profile.sprintFinishEligible).toBe(
          true,
        )
      },
    )

    it(
      'creates climb and descent phases for the hilly fixture',
      () => {
        const profile = createRoadStageProfile(
          hillyRoadStageProfileInput,
        )
        const terrainTypes =
          profile.terrainPhases.map(
            (phase) => phase.terrainType,
          )

        expect(terrainTypes.includes('climb')).toBe(true)
        expect(terrainTypes.includes('descent')).toBe(true)
        expect(terrainTypes.includes('flat')).toBe(true)
      },
    )

    it(
      'creates multiple sustained climb phases for the mountain fixture',
      () => {
        const profile = createRoadStageProfile(
          mountainRoadStageProfileInput,
        )
        const climbs = profile.terrainPhases.filter(
          (phase) => phase.terrainType === 'climb',
        )

        expect(climbs.length).toBeGreaterThanOrEqual(3)
        expect(profile.highestElevationM).toBe(2020)
        expect(profile.totalElevationGainM).toBe(3030)
        expect(profile.totalElevationLossM).toBe(1260)
      },
    )

    it(
      'covers the complete stage distance without gaps or overlaps',
      () => {
        const profile = createRoadStageProfile(
          mountainRoadStageProfileInput,
        )

        expect(profile.terrainPhases[0].startKm).toBe(
          0,
        )
        expect(
          profile.terrainPhases[
            profile.terrainPhases.length - 1
          ].endKm,
        ).toBe(profile.distanceKm)

        profile.terrainPhases.forEach(
          (phase, index) => {
            expect(phase.distanceKm).toBeGreaterThan(
              0,
            )

            if (index > 0) {
              expect(phase.startKm).toBe(
                profile.terrainPhases[index - 1]
                  .endKm,
              )
            }
          },
        )
      },
    )

    it(
      'assigns stable phase ids and one finish phase',
      () => {
        const profile = createRoadStageProfile(
          hillyRoadStageProfileInput,
        )
        const finishPhases =
          profile.terrainPhases.filter(
            (phase) => phase.isFinishPhase,
          )

        expect(finishPhases).toHaveLength(1)
        expect(finishPhases[0].phaseId).toBe(
          profile.finishPhaseId,
        )
        expect(profile.terrainPhases[0].phaseId).toBe(
          'b2-hilly-80:phase-001',
        )
      },
    )

    it(
      'returns the following phase at an exact internal boundary',
      () => {
        const profile = createRoadStageProfile(
          hillyRoadStageProfileInput,
        )
        const firstBoundary =
          profile.terrainPhases[0].endKm

        expect(
          getTerrainPhaseAtKm(
            profile,
            firstBoundary,
          ).phaseIndex,
        ).toBe(1)
      },
    )

    it(
      'returns the final phase at the exact finish',
      () => {
        const profile = createRoadStageProfile(
          mountainRoadStageProfileInput,
        )

        expect(
          getTerrainPhaseAtKm(
            profile,
            profile.distanceKm,
          ).isFinishPhase,
        ).toBe(true)
      },
    )

    it(
      'calculates deterministic stage progress',
      () => {
        const profile = createRoadStageProfile(
          flatRoadStageProfileInput,
        )

        expect(
          calculateStageProgress(profile, 0),
        ).toBe(0)
        expect(
          calculateStageProgress(profile, 12.5),
        ).toBe(0.25)
        expect(
          calculateStageProgress(profile, 50),
        ).toBe(1)
      },
    )

    it(
      'keeps terrain distance totals aligned with stage distance',
      () => {
        const profile = createRoadStageProfile(
          hillyRoadStageProfileInput,
        )
        const summary = profile.distanceByTerrain

        expect(
          summary.flatKm +
            summary.rollingKm +
            summary.climbKm +
            summary.descentKm,
        ).toBe(profile.distanceKm)
      },
    )

    it(
      'does not mutate the profile input',
      () => {
        const snapshot = JSON.stringify(
          hillyRoadStageProfileInput,
        )

        createRoadStageProfile(
          hillyRoadStageProfileInput,
        )

        expect(
          JSON.stringify(
            hillyRoadStageProfileInput,
          ),
        ).toBe(snapshot)
      },
    )

    it(
      'rejects an empty profile id',
      () => {
        expect(() =>
          createRoadStageProfile({
            ...flatRoadStageProfileInput,
            profileId: '   ',
          }),
        ).toThrow()
      },
    )

    it(
      'rejects a non-positive stage distance',
      () => {
        expect(() =>
          createRoadStageProfile({
            ...flatRoadStageProfileInput,
            distanceKm: 0,
          }),
        ).toThrow()
      },
    )

    it(
      'rejects a profile that does not begin at zero',
      () => {
        expect(() =>
          createRoadStageProfile({
            ...flatRoadStageProfileInput,
            profilePoints: [
              { km: 1, elevationM: 20 },
              { km: 50, elevationM: 40 },
            ],
          }),
        ).toThrow()
      },
    )

    it(
      'rejects a profile that does not finish at stage distance',
      () => {
        expect(() =>
          createRoadStageProfile({
            ...flatRoadStageProfileInput,
            profilePoints: [
              { km: 0, elevationM: 20 },
              { km: 49, elevationM: 40 },
            ],
          }),
        ).toThrow()
      },
    )

    it(
      'rejects duplicate or decreasing profile kilometres',
      () => {
        expect(() =>
          createRoadStageProfile({
            ...flatRoadStageProfileInput,
            profilePoints: [
              { km: 0, elevationM: 20 },
              { km: 20, elevationM: 30 },
              { km: 20, elevationM: 40 },
              { km: 50, elevationM: 40 },
            ],
          }),
        ).toThrow()
      },
    )

    it(
      'rejects an unsupported uphill sprint finish',
      () => {
        expect(() =>
          createRoadStageProfile({
            profileId: 'invalid-uphill-sprint',
            stageType: 'hilly',
            finishType: 'sprint',
            distanceKm: 20,
            profilePoints: [
              { km: 0, elevationM: 100 },
              { km: 15, elevationM: 100 },
              { km: 20, elevationM: 350 },
            ],
          }),
        ).toThrow()
      },
    )

    it(
      'rejects terrain lookup outside the stage',
      () => {
        const profile = createRoadStageProfile(
          flatRoadStageProfileInput,
        )

        expect(() =>
          getTerrainPhaseAtKm(profile, -0.1),
        ).toThrow()
        expect(() =>
          getTerrainPhaseAtKm(profile, 50.1),
        ).toThrow()
      },
    )
  },
)
