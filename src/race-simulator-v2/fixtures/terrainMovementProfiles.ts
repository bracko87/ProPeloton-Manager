/**
 * terrainMovementProfiles.ts
 *
 * Controlled B2.2 terrain-only fixtures based on the visibly confirmed Rio
 * Stage 6 and Stage 3 normalized phase shapes.
 */

import {
  createRoadStageProfile,
} from '../core/roadStageProfile'

export const controlledFlatMovementProfile =
  createRoadStageProfile({
    profileId: 'b2-2-flat-movement',
    stageType: 'flat',
    finishType: 'sprint',
    distanceKm: 50,
    profilePoints: [
      { km: 0, elevationM: 20 },
      { km: 50, elevationM: 20 },
    ],
  })

export const controlledHillyMovementProfile =
  createRoadStageProfile({
    profileId: 'b2-2-rio-stage-6-shape',
    stageType: 'hilly',
    finishType: 'standard',
    distanceKm: 142.8,
    profilePoints: [
      { km: 0, elevationM: 830 },
      { km: 37, elevationM: 700 },
      { km: 42, elevationM: 940 },
      { km: 87, elevationM: 120 },
      { km: 142.8, elevationM: 8 },
    ],
  })

export const controlledMountainMovementProfile =
  createRoadStageProfile({
    profileId: 'b2-2-rio-stage-3-shape',
    stageType: 'mountain',
    finishType: 'standard',
    distanceKm: 136,
    profilePoints: [
      { km: 0, elevationM: 875 },
      { km: 32, elevationM: 904 },
      { km: 44, elevationM: 1384 },
      { km: 56, elevationM: 1264 },
      { km: 72, elevationM: 984 },
      { km: 96, elevationM: 904 },
      { km: 108, elevationM: 1564 },
      { km: 120, elevationM: 1054 },
      { km: 136, elevationM: 850 },
    ],
  })
