/**
 * rioCanonicalRoadStages.ts
 *
 * Stable references to the three existing Rio Tour road stages used as B2
 * integration profiles. These references do not unlock, start or mutate a
 * race. Profile data is loaded through the existing read-only profile RPC.
 */

import type {
  CanonicalRoadStageReference,
} from '../types/canonicalRoadStageProfile'

export const RIO_TOUR_RACE_ID =
  '65739034-f9e5-4b5c-8f21-4ea27451e0d4'

export const rioStage1FlatReference:
  CanonicalRoadStageReference = {
    key: 'rio-stage-1-flat',
    raceId: RIO_TOUR_RACE_ID,
    stageId:
      '24709c46-b258-4db3-a3aa-fd92dc37630e',
    stageNumber: 1,
    stageType: 'flat',
    finishType: 'sprint',
    buttonLabel: 'Rio Stage 1 · Flat',
    fallbackStageTitle:
      'Rio Tour Stage 1: Rio de Janeiro → Niterói',
  }

export const rioStage6HillyReference:
  CanonicalRoadStageReference = {
    key: 'rio-stage-6-hilly',
    raceId: RIO_TOUR_RACE_ID,
    stageId:
      '743b60ae-d6fd-4d3a-af65-10025179f03c',
    stageNumber: 6,
    stageType: 'hilly',
    finishType: 'standard',
    buttonLabel: 'Rio Stage 6 · Hilly',
    fallbackStageTitle:
      'Rio Tour Stage 6',
  }

export const rioStage3MountainReference:
  CanonicalRoadStageReference = {
    key: 'rio-stage-3-mountain',
    raceId: RIO_TOUR_RACE_ID,
    stageId:
      'ff1822c8-18dd-425f-ac30-b10d0c491221',
    stageNumber: 3,
    stageType: 'mountain',
    finishType: 'standard',
    buttonLabel: 'Rio Stage 3 · Mountain',
    fallbackStageTitle:
      'Rio Tour Stage 3: Teresópolis → Nova Friburgo',
  }

export const rioCanonicalRoadStageReferences = [
  rioStage1FlatReference,
  rioStage6HillyReference,
  rioStage3MountainReference,
] as const
