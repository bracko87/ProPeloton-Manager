/**
 * deterministicEngineClosureReferences.ts
 *
 * Accepted deterministic evidence accumulated through the isolated engine,
 * calibrated movement, weather, fatigue, crash, equipment, technical-incident,
 * replay, and legacy-fallback phases.
 *
 * These are acceptance references, not production configuration.
 */

export type DeterministicReferenceEvidence =
  | 'synthetic_browser'
  | 'live_read_only_browser'
  | 'pure_runtime'
  | 'regression'

export interface DeterministicEngineReference {
  readonly id: string
  readonly phase: string
  readonly label: string
  readonly value: string
  readonly evidence:
    DeterministicReferenceEvidence
  readonly checklistItems:
    readonly number[]
}

export interface ActiveTechnicalEventReference {
  readonly sequenceNumber: number
  readonly raceSecond: number
  readonly riderId: string
  readonly technicalType: string
  readonly severity: string
  readonly baseTimeLossSeconds: number
  readonly timeLossSeconds: number
  readonly targetGroupId: string
}

export interface DeterministicReferenceRegistryValidation {
  readonly valid: boolean
  readonly issues:
    readonly string[]
  readonly referenceCount: number
  readonly coveredChecklistItems:
    readonly number[]
  readonly uncoveredCompletedChecklistItems:
    readonly number[]
}

export const ACCEPTED_DETERMINISTIC_ENGINE_REFERENCES:
  readonly DeterministicEngineReference[] = [
    {
      id:
        'calibrated-gradient-8',
      phase:
        '7B.8L',
      label:
        'Calibrated 8 percent profile',
      value:
        '4e03cec8d39f300f',
      evidence:
        'synthetic_browser',
      checklistItems: [
        2,
        4,
        5,
      ],
    },
    {
      id:
        'calibrated-gradient-10',
      phase:
        '7B.8L',
      label:
        'Calibrated 10 percent profile',
      value:
        '36eaa685567dadf3',
      evidence:
        'synthetic_browser',
      checklistItems: [
        3,
        5,
      ],
    },
    {
      id:
        'calibrated-gradient-12',
      phase:
        '7B.8L',
      label:
        'Calibrated 12 percent profile',
      value:
        '3e9a032de2f7c9f0',
      evidence:
        'synthetic_browser',
      checklistItems: [
        3,
        5,
      ],
    },
    {
      id:
        'calibrated-gradient-15',
      phase:
        '7B.8L',
      label:
        'Calibrated 15 percent profile',
      value:
        'de2adf1423a9f099',
      evidence:
        'synthetic_browser',
      checklistItems: [
        3,
        5,
      ],
    },
    {
      id:
        'calibrated-rio-synthetic',
      phase:
        '7B.8L',
      label:
        'Rio synthetic calibrated result',
      value:
        '27a3bd1f1ada2e08',
      evidence:
        'synthetic_browser',
      checklistItems: [
        2,
        5,
      ],
    },
    {
      id:
        'legacy-existing-v1-calibrated-audit',
      phase:
        '7B.8L',
      label:
        'Historical existing_v1 regression',
      value:
        '15a31bd137a4c60c',
      evidence:
        'regression',
      checklistItems: [
        20,
      ],
    },

    {
      id:
        'weather-neutral',
      phase:
        '8G.4',
      label:
        'Neutral weather performance model',
      value:
        '1092e1986ea5d57e',
      evidence:
        'pure_runtime',
      checklistItems: [
        6,
      ],
    },
    {
      id:
        'weather-strong-wind',
      phase:
        '8G.4',
      label:
        'Strong wind performance and incident demand',
      value:
        'e5d84a50c4a9061e',
      evidence:
        'pure_runtime',
      checklistItems: [
        6,
        7,
        8,
      ],
    },
    {
      id:
        'weather-heat',
      phase:
        '8G.4',
      label:
        'Heat performance and fatigue demand',
      value:
        '4636c1506988519b',
      evidence:
        'pure_runtime',
      checklistItems: [
        6,
        9,
      ],
    },
    {
      id:
        'weather-cold-rain',
      phase:
        '8G.4',
      label:
        'Cold rain performance model',
      value:
        '4ce1fcb229045df8',
      evidence:
        'pure_runtime',
      checklistItems: [
        6,
        10,
      ],
    },
    {
      id:
        'weather-combined-severe',
      phase:
        '8G.4',
      label:
        'Combined severe weather model',
      value:
        '07bfb4e4a44bffc1',
      evidence:
        'pure_runtime',
      checklistItems: [
        6,
        7,
        8,
        9,
        10,
      ],
    },

    {
      id:
        'live-rio-stage-1-output',
      phase:
        '8G.6',
      label:
        'Rio Stage 1 live calibrated output',
      value:
        '03ce527d18fc5289',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        2,
        6,
        7,
        9,
        10,
        17,
      ],
    },
    {
      id:
        'live-rio-stage-1-replay',
      phase:
        '8G.6',
      label:
        'Rio Stage 1 generic replay',
      value:
        'a159885629c513f1',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        18,
        19,
      ],
    },
    {
      id:
        'live-japan-stage-1-output',
      phase:
        '8G.6',
      label:
        'Japan Stage 1 live calibrated output',
      value:
        '350c51d4e6129c0d',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        4,
        6,
        17,
      ],
    },
    {
      id:
        'live-japan-stage-1-replay',
      phase:
        '8G.6',
      label:
        'Japan Stage 1 generic replay',
      value:
        '47b81445749b12bb',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        18,
        19,
      ],
    },
    {
      id:
        'live-rio-stage-2-output',
      phase:
        '8G.6',
      label:
        'Rio Stage 2 mountain calibrated output',
      value:
        'ea432054ec0dff90',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        3,
        6,
        17,
      ],
    },
    {
      id:
        'live-rio-stage-2-replay',
      phase:
        '8G.6',
      label:
        'Rio Stage 2 mountain generic replay',
      value:
        'd6dddd94bc1ad0a9',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        18,
        19,
      ],
    },

    {
      id:
        'individual-crash-active-output',
      phase:
        '8H.2B',
      label:
        'Active individual crash output',
      value:
        '0d8fbf93934dcbef',
      evidence:
        'synthetic_browser',
      checklistItems: [
        11,
        12,
        14,
        18,
      ],
    },
    {
      id:
        'individual-crash-stage',
      phase:
        '8H.2B',
      label:
        'Active individual crash stage',
      value:
        '4b3de44c45977321',
      evidence:
        'synthetic_browser',
      checklistItems: [
        12,
      ],
    },
    {
      id:
        'individual-crash-replay',
      phase:
        '8H.2B',
      label:
        'Active individual crash replay',
      value:
        '6f153f8377fc5002',
      evidence:
        'synthetic_browser',
      checklistItems: [
        18,
        19,
      ],
    },
    {
      id:
        'individual-crash-audit',
      phase:
        '8H.2B',
      label:
        'Active individual crash audit',
      value:
        'a93474af1d3816aa',
      evidence:
        'synthetic_browser',
      checklistItems: [
        11,
        12,
        14,
      ],
    },

    {
      id:
        'group-crash-outcome',
      phase:
        '8H.3A',
      label:
        'Isolated group crash outcome',
      value:
        '151531e2df8b25a3',
      evidence:
        'synthetic_browser',
      checklistItems: [
        13,
      ],
    },
    {
      id:
        'group-crash-selection',
      phase:
        '8H.3A',
      label:
        'Isolated group crash rider selection',
      value:
        '9519c8aeb2a042ec',
      evidence:
        'synthetic_browser',
      checklistItems: [
        13,
      ],
    },
    {
      id:
        'group-crash-time-loss',
      phase:
        '8H.3A',
      label:
        'Isolated group crash time loss',
      value:
        'b9160f8d8441542f',
      evidence:
        'synthetic_browser',
      checklistItems: [
        13,
      ],
    },
    {
      id:
        'shared-crash-group-output',
      phase:
        '8H.3B',
      label:
        'Shared active group crash output',
      value:
        '7542f38b4737cdf9',
      evidence:
        'synthetic_browser',
      checklistItems: [
        12,
        13,
        14,
      ],
    },
    {
      id:
        'shared-crash-mixed-output',
      phase:
        '8H.3B',
      label:
        'Shared individual/group crash output',
      value:
        '4b240fea5a260363',
      evidence:
        'synthetic_browser',
      checklistItems: [
        12,
        13,
        14,
      ],
    },
    {
      id:
        'shared-crash-replay',
      phase:
        '8H.3B',
      label:
        'Shared crash generic replay',
      value:
        'c70f2e022fd34d72',
      evidence:
        'synthetic_browser',
      checklistItems: [
        18,
        19,
      ],
    },
    {
      id:
        'shared-crash-audit',
      phase:
        '8H.3B',
      label:
        'Shared crash integration audit',
      value:
        '46bad1b54124c2bf',
      evidence:
        'synthetic_browser',
      checklistItems: [
        12,
        13,
        14,
      ],
    },

    {
      id:
        'equipment-pure-input',
      phase:
        '8H.4B',
      label:
        'Pure equipment-enabled StageInput',
      value:
        '834c4b01f48420de',
      evidence:
        'synthetic_browser',
      checklistItems: [
        15,
        17,
      ],
    },
    {
      id:
        'equipment-pure-state',
      phase:
        '8H.4B',
      label:
        'Pure equipment-enabled initial state',
      value:
        '2b06a941606a4bf9',
      evidence:
        'synthetic_browser',
      checklistItems: [
        15,
        17,
      ],
    },
    {
      id:
        'equipment-pure-audit',
      phase:
        '8H.4B',
      label:
        'Equipment transport and risk audit',
      value:
        '358a5162458b46f8',
      evidence:
        'synthetic_browser',
      checklistItems: [
        15,
      ],
    },
    {
      id:
        'equipment-live-rio-audit',
      phase:
        '8H.4C',
      label:
        'Rio live equipment transport audit',
      value:
        'd8e6e976437f53fe',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        15,
        17,
        18,
        19,
      ],
    },
    {
      id:
        'equipment-live-japan-audit',
      phase:
        '8H.4C',
      label:
        'Japan live equipment transport audit',
      value:
        'bb1c68613528fd8f',
      evidence:
        'live_read_only_browser',
      checklistItems: [
        15,
        17,
        18,
        19,
      ],
    },

    {
      id:
        'technical-isolated-result-state',
      phase:
        '8H.5A',
      label:
        'Isolated technical incident resulting state',
      value:
        '8a32c2827f3a5a5c',
      evidence:
        'synthetic_browser',
      checklistItems: [
        15,
        16,
      ],
    },
    {
      id:
        'technical-isolated-outcome',
      phase:
        '8H.5A',
      label:
        'Isolated technical incident outcome',
      value:
        'aa0bddd6a218e63f',
      evidence:
        'synthetic_browser',
      checklistItems: [
        15,
        16,
      ],
    },
    {
      id:
        'technical-isolated-event',
      phase:
        '8H.5A',
      label:
        'Isolated technical incident event',
      value:
        'fb6c7a44f904e968',
      evidence:
        'synthetic_browser',
      checklistItems: [
        16,
        18,
      ],
    },
    {
      id:
        'technical-isolated-replay',
      phase:
        '8H.5A',
      label:
        'Isolated technical incident replay',
      value:
        '37e8e1800a27c927',
      evidence:
        'synthetic_browser',
      checklistItems: [
        18,
        19,
      ],
    },
    {
      id:
        'technical-isolated-audit',
      phase:
        '8H.5A',
      label:
        'Isolated technical incident audit',
      value:
        '128ccad87475fb5e',
      evidence:
        'synthetic_browser',
      checklistItems: [
        15,
        16,
      ],
    },

    {
      id:
        'active-technical-baseline',
      phase:
        '8H.5B',
      label:
        'Active technical controlled baseline',
      value:
        '58ef04b927fbb078',
      evidence:
        'regression',
      checklistItems: [
        2,
        4,
        5,
      ],
    },
    {
      id:
        'active-technical-output',
      phase:
        '8H.5B',
      label:
        'Active technical-only output',
      value:
        'b7a4216d57c17046',
      evidence:
        'synthetic_browser',
      checklistItems: [
        8,
        11,
        14,
        15,
        16,
      ],
    },
    {
      id:
        'active-technical-stage',
      phase:
        '8H.5B',
      label:
        'Active technical-only stage',
      value:
        '6d77b1b036a53fd2',
      evidence:
        'synthetic_browser',
      checklistItems: [
        15,
        16,
      ],
    },
    {
      id:
        'active-mixed-incident-output',
      phase:
        '8H.5B',
      label:
        'Active mixed crash and technical output',
      value:
        '21fa4687d01ee980',
      evidence:
        'synthetic_browser',
      checklistItems: [
        11,
        12,
        13,
        14,
        15,
        16,
      ],
    },
    {
      id:
        'active-mixed-incident-stage',
      phase:
        '8H.5B',
      label:
        'Active mixed crash and technical stage',
      value:
        '3a14ae95dbb20737',
      evidence:
        'synthetic_browser',
      checklistItems: [
        12,
        13,
        15,
        16,
      ],
    },
    {
      id:
        'active-technical-missing-equipment',
      phase:
        '8H.5B',
      label:
        'Equipment-free technical-ineligible output',
      value:
        '0d27ed15a68faeb5',
      evidence:
        'regression',
      checklistItems: [
        15,
      ],
    },
    {
      id:
        'active-technical-old-crash-wrapper',
      phase:
        '8H.5B',
      label:
        'Accepted Phase 8H.3B wrapper regression',
      value:
        '296163a86e551cb0',
      evidence:
        'regression',
      checklistItems: [
        12,
        13,
        20,
      ],
    },
    {
      id:
        'active-technical-existing-v1',
      phase:
        '8H.5B',
      label:
        'existing_v1 active-technical regression',
      value:
        '981d27c09deaae78',
      evidence:
        'regression',
      checklistItems: [
        20,
      ],
    },
    {
      id:
        'active-technical-replay',
      phase:
        '8H.5B',
      label:
        'Active technical generic replay',
      value:
        '6f1a2f49020e9d95',
      evidence:
        'synthetic_browser',
      checklistItems: [
        18,
        19,
      ],
    },
    {
      id:
        'active-technical-audit',
      phase:
        '8H.5B',
      label:
        'Active technical integration audit',
      value:
        'ec023db0a131038e',
      evidence:
        'synthetic_browser',
      checklistItems: [
        11,
        14,
        15,
        16,
      ],
    },
  ]

export const ACCEPTED_ACTIVE_TECHNICAL_EVENTS:
  readonly ActiveTechnicalEventReference[] = [
    {
      sequenceNumber: 2,
      raceSecond: 330,
      riderId:
        '9edd7492-3498-4d98-907e-78b35e42e28f',
      technicalType:
        'drivetrain_failure',
      severity:
        'minor',
      baseTimeLossSeconds: 41,
      timeLossSeconds: 37,
      targetGroupId:
        'dropped_1',
    },
    {
      sequenceNumber: 3,
      raceSecond: 480,
      riderId:
        '513f85cc-c2f3-4c61-904c-91623cbb0f54',
      technicalType:
        'bike_change',
      severity:
        'moderate',
      baseTimeLossSeconds: 111,
      timeLossSeconds: 100,
      targetGroupId:
        'dropped_2',
    },
    {
      sequenceNumber: 4,
      raceSecond: 660,
      riderId:
        '611a0191-2308-424a-a8a5-fb185f1fb17d',
      technicalType:
        'drivetrain_failure',
      severity:
        'moderate',
      baseTimeLossSeconds: 63,
      timeLossSeconds: 57,
      targetGroupId:
        'dropped_3',
    },
  ]

export function getAcceptedDeterministicReference(
  id: string,
): DeterministicEngineReference {
  const reference =
    ACCEPTED_DETERMINISTIC_ENGINE_REFERENCES.find(
      (candidate) =>
        candidate.id === id,
    )

  if (!reference) {
    throw new Error(
      `Unknown deterministic engine reference: ${id}.`,
    )
  }

  return reference
}

export function validateAcceptedDeterministicReferenceRegistry():
  DeterministicReferenceRegistryValidation {
  const issues:
    string[] = []

  const idSet =
    new Set<string>()

  const coveredChecklistItems =
    new Set<number>()

  for (
    const reference of
    ACCEPTED_DETERMINISTIC_ENGINE_REFERENCES
  ) {
    if (
      !reference.id.trim()
    ) {
      issues.push(
        'Reference IDs must be non-empty.',
      )
    }

    if (
      idSet.has(
        reference.id,
      )
    ) {
      issues.push(
        `Duplicate reference ID: ${reference.id}.`,
      )
    }

    idSet.add(
      reference.id,
    )

    if (
      !/^[0-9a-f]{16}$/.test(
        reference.value,
      )
    ) {
      issues.push(
        `Reference ${reference.id} does not contain a 16-character lowercase hexadecimal hash.`,
      )
    }

    if (
      reference
        .checklistItems
        .length ===
      0
    ) {
      issues.push(
        `Reference ${reference.id} has no checklist coverage.`,
      )
    }

    for (
      const checklistItem of
      reference.checklistItems
    ) {
      if (
        !Number.isInteger(
          checklistItem,
        ) ||
        checklistItem <
          2 ||
        checklistItem >
          20
      ) {
        issues.push(
          `Reference ${reference.id} contains unsupported checklist item ${String(checklistItem)}.`,
        )
      }

      coveredChecklistItems.add(
        checklistItem,
      )
    }
  }

  const expectedCompletedItems =
    Array.from(
      {
        length: 19,
      },
      (
        _,
        index,
      ) =>
        index + 2,
    )

  const uncoveredCompletedChecklistItems =
    expectedCompletedItems.filter(
      (item) =>
        !coveredChecklistItems.has(
          item,
        ),
    )

  if (
    uncoveredCompletedChecklistItems
      .length >
    0
  ) {
    issues.push(
      `Accepted evidence is missing for checklist items ${uncoveredCompletedChecklistItems.join(', ')}.`,
    )
  }

  return {
    valid:
      issues.length ===
      0,
    issues,
    referenceCount:
      ACCEPTED_DETERMINISTIC_ENGINE_REFERENCES
        .length,
    coveredChecklistItems:
      Array.from(
        coveredChecklistItems,
      ).sort(
        (left, right) =>
          left - right,
      ),
    uncoveredCompletedChecklistItems,
  }
}
