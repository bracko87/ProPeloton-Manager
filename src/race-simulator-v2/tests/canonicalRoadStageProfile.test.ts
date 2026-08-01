import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  createCanonicalRoadStageProfile,
} from '../core/canonicalRoadStageProfile'
import {
  RIO_TOUR_RACE_ID,
  rioCanonicalRoadStageReferences,
  rioStage1FlatReference,
  rioStage3MountainReference,
  rioStage6HillyReference,
} from '../fixtures/rioCanonicalRoadStages'
import type {
  BackendRoadStageProfilePayload,
  CanonicalRoadStageReference,
} from '../types/canonicalRoadStageProfile'

const stage1Payload:
  BackendRoadStageProfilePayload = {
    stage_id:
      '24709c46-b258-4db3-a3aa-fd92dc37630e',
    race_id: RIO_TOUR_RACE_ID,
    stage_number: 1,
    stage_title:
      'Rio Tour Stage 1: Rio de Janeiro → Niterói',
    route_label:
      'Rio waterfront → Niterói',
    stage_summary: 'Controlled real-stage flat profile.',
    distance_km: 142,
    elevation_gain_m: 520,
    terrain_type: 'flat',
    profile_type: 'sprinter',
    has_profile: true,
    profile_points: [
      { km: 0, elevation: 12 },
      { km: 16, elevation: 8 },
      { km: 28, elevation: 10 },
      { km: 44, elevation: 22 },
      { km: 62, elevation: 30 },
      { km: 82, elevation: 18 },
      { km: 102, elevation: 12 },
      { km: 124, elevation: 8 },
      { km: 142, elevation: 5 },
    ],
    route_markers: [
      { km: 0, type: 'start', label: 'Start' },
      { km: 28, type: 'sprint', label: 'Sprint 1' },
      { km: 82, type: 'sprint', label: 'Sprint 2' },
      { km: 124, type: 'sprint', label: 'Sprint 3' },
      { km: 142, type: 'finish', label: 'Finish' },
    ],
    mountain_climbs: [],
  }

const stage6Payload:
  BackendRoadStageProfilePayload = {
    stage_id:
      '743b60ae-d6fd-4d3a-af65-10025179f03c',
    race_id: RIO_TOUR_RACE_ID,
    stage_number: 6,
    stage_title:
      'Rio Tour Stage 6: Petrópolis → Rio de Janeiro',
    route_label:
      'Petrópolis → Serra road → Rio de Janeiro',
    stage_summary: 'Controlled real-stage hilly profile.',
    distance_km: 142.8,
    elevation_gain_m: 1180,
    terrain_type: 'hilly',
    profile_type: 'puncheur',
    has_profile: true,
    profile_points: [
      { km: 0, elevation_m: 830 },
      { km: 18, elevation_m: 760 },
      { km: 42, elevation_m: 940 },
      { km: 62, elevation_m: 520 },
      { km: 87, elevation_m: 120 },
      { km: 108, elevation_m: 80 },
      { km: 128, elevation_m: 35 },
      { km: 142.8, elevation_m: 8 },
    ],
    route_markers: [
      { km: 0, type: 'start', label: 'Start' },
      {
        km: 42,
        type: 'kom',
        label: 'Cat 3',
        name: 'Serra road shoulder climb',
      },
      { km: 87, type: 'sprint', label: 'Sprint 1' },
      { km: 142.8, type: 'finish', label: 'Finish' },
    ],
    mountain_climbs: [
      {
        km: 42,
        name: 'Serra road shoulder climb',
        category: 'Cat 3',
        length_km: 5,
        avg_gradient: 4.8,
      },
    ],
  }

function createContractReference(
  overrides: Partial<CanonicalRoadStageReference> = {},
): CanonicalRoadStageReference {
  return {
    key: 'rio-stage-3-mountain',
    raceId: 'race-contract',
    stageId: 'stage-contract',
    stageNumber: 3,
    stageType: 'mountain',
    finishType: 'standard',
    buttonLabel: 'Contract stage',
    fallbackStageTitle: 'Contract stage',
    ...overrides,
  }
}

function createContractPayload(
  overrides: BackendRoadStageProfilePayload = {},
): BackendRoadStageProfilePayload {
  return {
    stage_id: 'stage-contract',
    race_id: 'race-contract',
    stage_number: 3,
    stage_title: 'Mountain adapter contract',
    distance_km: 20,
    terrain_type: 'mountain',
    profile_type: 'climber',
    elevation_gain_m: 800,
    has_profile: true,
    profile_points: [
      { km: 0, elevation: 200 },
      { km: 10, elevation: 800 },
      { km: 20, elevation: 300 },
    ],
    route_markers: [],
    mountain_climbs: [],
    ...overrides,
  }
}

describe(
  'B2.1a canonical read-only Rio stage profiles',
  () => {
    it(
      'defines one unique flat, hilly and mountain Rio reference',
      () => {
        expect(
          rioCanonicalRoadStageReferences.map(
            (reference) => reference.stageType,
          ),
        ).toEqual([
          'flat',
          'hilly',
          'mountain',
        ])

        expect(
          new Set(
            rioCanonicalRoadStageReferences.map(
              (reference) => reference.stageId,
            ),
          ).size,
        ).toBe(3)
      },
    )

    it(
      'keeps all canonical references on the Rio Tour race',
      () => {
        rioCanonicalRoadStageReferences.forEach(
          (reference) => {
            expect(reference.raceId).toBe(
              RIO_TOUR_RACE_ID,
            )
          },
        )
      },
    )

    it(
      'assigns sprint eligibility only to the flat integration stage',
      () => {
        expect(
          rioStage1FlatReference.finishType,
        ).toBe('sprint')
        expect(
          rioStage6HillyReference.finishType,
        ).toBe('standard')
        expect(
          rioStage3MountainReference.finishType,
        ).toBe('standard')
      },
    )

    it(
      'creates identical Stage 1 snapshots for identical payloads',
      () => {
        expect(
          createCanonicalRoadStageProfile(
            rioStage1FlatReference,
            stage1Payload,
          ),
        ).toEqual(
          createCanonicalRoadStageProfile(
            rioStage1FlatReference,
            stage1Payload,
          ),
        )
      },
    )

    it(
      'normalizes the real Stage 1 distance and one flat phase',
      () => {
        const snapshot =
          createCanonicalRoadStageProfile(
            rioStage1FlatReference,
            stage1Payload,
          )

        expect(
          snapshot.normalizedProfile.distanceKm,
        ).toBe(142)
        expect(
          snapshot.normalizedProfile.terrainPhases,
        ).toHaveLength(1)
        expect(
          snapshot.normalizedProfile.terrainPhases[0]
            .terrainType,
        ).toBe('flat')
        expect(
          snapshot.normalizedProfile
            .sprintFinishEligible,
        ).toBe(true)
      },
    )

    it(
      'preserves Stage 1 markers and source elevation gain',
      () => {
        const snapshot =
          createCanonicalRoadStageProfile(
            rioStage1FlatReference,
            stage1Payload,
          )

        expect(snapshot.routeMarkers).toHaveLength(5)
        expect(
          snapshot.routeMarkers.map(
            (marker) => marker.km,
          ),
        ).toEqual([0, 28, 82, 124, 142])
        expect(snapshot.sourceElevationGainM).toBe(
          520,
        )
      },
    )

    it(
      'adds one deterministic Stage 6 climb-start point from climb metadata',
      () => {
        const snapshot =
          createCanonicalRoadStageProfile(
            rioStage6HillyReference,
            stage6Payload,
          )

        expect(
          snapshot.derivedClimbStartPointCount,
        ).toBe(1)
        expect(
          snapshot.normalizedProfile.profilePoints.some(
            (point) =>
              point.km === 37 &&
              point.elevationM === 700,
          ),
        ).toBe(true)
      },
    )

    it(
      'preserves a real classified climb in the normalized Stage 6 terrain',
      () => {
        const snapshot =
          createCanonicalRoadStageProfile(
            rioStage6HillyReference,
            stage6Payload,
          )
        const climb =
          snapshot.normalizedProfile.terrainPhases.find(
            (phase) => phase.terrainType === 'climb',
          )

        expect(climb).toBeDefined()
        expect(climb?.startKm).toBe(37)
        expect(climb?.endKm).toBe(42)
        expect(climb?.averageGradientPercent).toBe(
          4.8,
        )
      },
    )

    it(
      'keeps Stage 6 ineligible for a sprint finish',
      () => {
        const snapshot =
          createCanonicalRoadStageProfile(
            rioStage6HillyReference,
            stage6Payload,
          )

        expect(
          snapshot.normalizedProfile.stageType,
        ).toBe('hilly')
        expect(
          snapshot.normalizedProfile
            .sprintFinishEligible,
        ).toBe(false)
      },
    )

    it(
      'does not mutate a production payload or canonical reference',
      () => {
        const payloadSnapshot = JSON.stringify(
          stage6Payload,
        )
        const referenceSnapshot = JSON.stringify(
          rioStage6HillyReference,
        )

        createCanonicalRoadStageProfile(
          rioStage6HillyReference,
          stage6Payload,
        )

        expect(JSON.stringify(stage6Payload)).toBe(
          payloadSnapshot,
        )
        expect(
          JSON.stringify(rioStage6HillyReference),
        ).toBe(referenceSnapshot)
      },
    )

    it(
      'accepts elevation and elevation_m source fields',
      () => {
        const snapshot =
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              profile_points: [
                { km: 0, elevation: 200 },
                { km: 10, elevation_m: 800 },
                { km: 20, elevation: 300 },
              ],
            }),
          )

        expect(
          snapshot.normalizedProfile.highestElevationM,
        ).toBe(800)
      },
    )

    it(
      'uses the fallback title when the payload has none',
      () => {
        const snapshot =
          createCanonicalRoadStageProfile(
            createContractReference({
              fallbackStageTitle: 'Fallback title',
            }),
            createContractPayload({
              stage_title: null,
            }),
          )

        expect(snapshot.stageTitle).toBe(
          'Fallback title',
        )
      },
    )

    it(
      'rejects a payload without an exposed profile',
      () => {
        expect(() =>
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              has_profile: false,
            }),
          ),
        ).toThrow()
      },
    )

    it(
      'rejects a mismatched stage id',
      () => {
        expect(() =>
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              stage_id: 'different-stage',
            }),
          ),
        ).toThrow()
      },
    )

    it(
      'rejects a mismatched race id',
      () => {
        expect(() =>
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              race_id: 'different-race',
            }),
          ),
        ).toThrow()
      },
    )

    it(
      'rejects a mismatched stage number',
      () => {
        expect(() =>
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              stage_number: 4,
            }),
          ),
        ).toThrow()
      },
    )

    it(
      'rejects a terrain type that conflicts with the canonical reference',
      () => {
        expect(() =>
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              terrain_type: 'flat',
            }),
          ),
        ).toThrow()
      },
    )

    it(
      'rejects a classified climb without an exact summit point',
      () => {
        expect(() =>
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              mountain_climbs: [
                {
                  km: 12,
                  length_km: 4,
                  avg_gradient: 5,
                },
              ],
            }),
          ),
        ).toThrow()
      },
    )

    it(
      'rejects malformed or incomplete profile points',
      () => {
        expect(() =>
          createCanonicalRoadStageProfile(
            createContractReference(),
            createContractPayload({
              profile_points: [
                { km: 0, elevation: 200 },
              ],
            }),
          ),
        ).toThrow()
      },
    )
  },
)
