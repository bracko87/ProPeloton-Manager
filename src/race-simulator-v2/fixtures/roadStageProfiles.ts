/**
 * roadStageProfiles.ts
 *
 * Controlled B2.1 terrain-only fixtures. Rider movement is intentionally not
 * connected until B2.2.
 */

import type {
  RoadStageProfileInput,
} from '../types/stageProfile'

export const flatRoadStageProfileInput:
  RoadStageProfileInput = {
    profileId: 'b2-flat-sprint-50',
    stageType: 'flat',
    finishType: 'sprint',
    distanceKm: 50,
    profilePoints: [
      { km: 0, elevationM: 20 },
      { km: 15, elevationM: 35 },
      { km: 30, elevationM: 30 },
      { km: 50, elevationM: 40 },
    ],
  }

export const hillyRoadStageProfileInput:
  RoadStageProfileInput = {
    profileId: 'b2-hilly-80',
    stageType: 'hilly',
    finishType: 'standard',
    distanceKm: 80,
    profilePoints: [
      { km: 0, elevationM: 100 },
      { km: 20, elevationM: 120 },
      { km: 30, elevationM: 420 },
      { km: 40, elevationM: 170 },
      { km: 55, elevationM: 190 },
      { km: 65, elevationM: 690 },
      { km: 75, elevationM: 240 },
      { km: 80, elevationM: 250 },
    ],
  }

export const mountainRoadStageProfileInput:
  RoadStageProfileInput = {
    profileId: 'b2-mountain-100',
    stageType: 'mountain',
    finishType: 'standard',
    distanceKm: 100,
    profilePoints: [
      { km: 0, elevationM: 250 },
      { km: 20, elevationM: 300 },
      { km: 40, elevationM: 1500 },
      { km: 52, elevationM: 700 },
      { km: 65, elevationM: 760 },
      { km: 85, elevationM: 1960 },
      { km: 92, elevationM: 1500 },
      { km: 100, elevationM: 2020 },
    ],
  }
