/**
 * RioStage1ReplayAdapterDiagnostic.tsx
 *
 * Browser-only, read-only validation of the generic deterministic replay adapter.
 *
 * This page:
 * - adapts the static Rio Stage 1 source fixture into StageInput
 * - runs the deterministic road-race engine once in browser memory
 * - converts StageInput + SimulationOutput into ReplayStageModel twice
 * - verifies deterministic adapter output and source immutability
 * - validates replay frames, events, final results, and null-only unavailable data
 *
 * It does not use Supabase, HTTP, persistence, database writes,
 * production replay routes, API routes, or schedulers.
 */

import { useState } from 'react';

import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../race-engine/integration/createStageInputFromSourceRows';
import {
  createCanonicalHashedValue,
} from '../../race-engine/simulation/canonicalSerialization';
import {
  runDeterministicRoadRace,
} from '../../race-engine/simulation/runDeterministicRoadRace';
import {
  rioStage1SourceRows,
} from '../../race-engine/tests/fixtures/rioStage1SourceRows';
import {
  createReplayStageModelFromSimulationOutput,
  validateReplayStageModel,
} from '../../race-replay';

const EXPECTED_STAGE_INPUT_HASH =
  '85993905d61e0cc5';

const EXPECTED_SIMULATION_OUTPUT_HASH =
  '229fef0b88e36b02';

const EXPECTED_RIDER_COUNT = 96;
const EXPECTED_SNAPSHOT_COUNT = 395;
const EXPECTED_EVENT_COUNT = 98;
const EXPECTED_STAGE_DISTANCE_KM = 142;

interface DiagnosticChecks {
  readonly sourceFixtureUnchanged: boolean;
  readonly stageInputUnchanged: boolean;
  readonly simulationOutputUnchanged: boolean;

  readonly expectedStageInputHash: boolean;
  readonly expectedSimulationOutputHash: boolean;

  readonly identicalReplayModels: boolean;
  readonly identicalReplayModelHashes: boolean;
  readonly replayValidatorPassed: boolean;

  readonly expectedRiderCount: boolean;
  readonly expectedSnapshotCount: boolean;
  readonly expectedEventCount: boolean;
  readonly expectedFrameCount: boolean;

  readonly everyFrameHasExpectedRiderCount: boolean;
  readonly everyFrameHasUniqueRiders: boolean;

  readonly firstFrameAtStart: boolean;
  readonly finalFrameAtFinish: boolean;
  readonly finalProgressIsOne: boolean;

  readonly expectedFinalResultCount: boolean;
  readonly allFinalResultsFinished: boolean;
  readonly uniqueFinishPositions: boolean;

  readonly completionEventPresent: boolean;

  readonly allStaminaValuesNull: boolean;
  readonly allFatigueValuesNull: boolean;
}

interface DiagnosticResult {
  readonly passed: boolean;

  readonly raceId: string;
  readonly stageId: string;
  readonly seed: string;

  readonly riderCount: number;
  readonly snapshotCount: number;
  readonly eventCount: number;

  readonly replayFrameCount: number;
  readonly replayFinalResultCount: number;
  readonly replayDurationSeconds: number;

  readonly firstFrameKm: number | null;
  readonly finalFrameKm: number | null;
  readonly finalProgress: number | null;

  readonly stageInputHash: string;
  readonly simulationOutputHash: string;
  readonly replayModelHash: string;

  readonly validationIssueCount: number;
  readonly validationMessages: readonly string[];

  readonly checks: DiagnosticChecks;
}

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function allChecksPassed(
  checks: DiagnosticChecks,
): boolean {
  return Object.values(
    checks,
  ).every(Boolean);
}

function runRioStage1ReplayAdapterDiagnostic():
  DiagnosticResult {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows;

  const sourceBefore =
    createCanonicalHashedValue(
      sourceRows,
    );

  const stageInput =
    createStageInputFromSourceRows(
      sourceRows,
    );

  const stageInputBefore =
    createCanonicalHashedValue(
      stageInput,
    );

  const simulationOutput =
    runDeterministicRoadRace(
      stageInput,
    );

  const simulationOutputBefore =
    createCanonicalHashedValue(
      simulationOutput,
    );

  const replayModelA =
    createReplayStageModelFromSimulationOutput({
      stageInput,
      simulationOutput,
    });

  const replayModelB =
    createReplayStageModelFromSimulationOutput({
      stageInput,
      simulationOutput,
    });

  const sourceAfter =
    createCanonicalHashedValue(
      sourceRows,
    );

  const stageInputAfter =
    createCanonicalHashedValue(
      stageInput,
    );

  const simulationOutputAfter =
    createCanonicalHashedValue(
      simulationOutput,
    );

  const canonicalReplayModelA =
    createCanonicalHashedValue(
      replayModelA,
    );

  const canonicalReplayModelB =
    createCanonicalHashedValue(
      replayModelB,
    );

  const validation =
    validateReplayStageModel(
      replayModelA,
    );

  const firstFrame =
    replayModelA.frames[0];

  const finalFrame =
    replayModelA.frames[
      replayModelA.frames.length - 1
    ];

  const finishPositions =
    replayModelA.finalResults
      .map(
        (result) =>
          result.finishPosition,
      )
      .filter(
        (
          position,
        ): position is number =>
          position !== null,
      );

  const checks:
    DiagnosticChecks = {
      sourceFixtureUnchanged:
        sourceBefore.canonicalJson ===
          sourceAfter.canonicalJson &&
        sourceBefore.hash ===
          sourceAfter.hash,

      stageInputUnchanged:
        stageInputBefore.canonicalJson ===
          stageInputAfter.canonicalJson &&
        stageInputBefore.hash ===
          stageInputAfter.hash,

      simulationOutputUnchanged:
        simulationOutputBefore.canonicalJson ===
          simulationOutputAfter.canonicalJson &&
        simulationOutputBefore.hash ===
          simulationOutputAfter.hash,

      expectedStageInputHash:
        stageInputBefore.hash ===
        EXPECTED_STAGE_INPUT_HASH,

      expectedSimulationOutputHash:
        simulationOutputBefore.hash ===
        EXPECTED_SIMULATION_OUTPUT_HASH,

      identicalReplayModels:
        canonicalReplayModelA
          .canonicalJson ===
        canonicalReplayModelB
          .canonicalJson,

      identicalReplayModelHashes:
        canonicalReplayModelA.hash ===
        canonicalReplayModelB.hash,

      replayValidatorPassed:
        validation.valid &&
        validation.issues.length === 0,

      expectedRiderCount:
        stageInput.riders.length ===
        EXPECTED_RIDER_COUNT,

      expectedSnapshotCount:
        simulationOutput
          .snapshots
          .length ===
        EXPECTED_SNAPSHOT_COUNT,

      expectedEventCount:
        simulationOutput
          .events
          .length ===
        EXPECTED_EVENT_COUNT,

      expectedFrameCount:
        replayModelA.frames.length ===
        EXPECTED_SNAPSHOT_COUNT,

      everyFrameHasExpectedRiderCount:
        replayModelA.frames.every(
          (frame) =>
            frame.riders.length ===
            EXPECTED_RIDER_COUNT,
        ),

      everyFrameHasUniqueRiders:
        replayModelA.frames.every(
          (frame) =>
            new Set(
              frame.riders.map(
                (rider) =>
                  rider.riderId,
              ),
            ).size ===
            EXPECTED_RIDER_COUNT,
        ),

      firstFrameAtStart:
        firstFrame !== undefined &&
        firstFrame.leaderDistanceKm ===
          0,

      finalFrameAtFinish:
        finalFrame !== undefined &&
        finalFrame.leaderDistanceKm ===
          EXPECTED_STAGE_DISTANCE_KM,

      finalProgressIsOne:
        finalFrame !== undefined &&
        finalFrame.progress === 1,

      expectedFinalResultCount:
        replayModelA
          .finalResults
          .length ===
        EXPECTED_RIDER_COUNT,

      allFinalResultsFinished:
        replayModelA
          .finalResults
          .every(
            (result) =>
              result.status ===
                'finished' &&
              result.finishPosition !==
                null &&
              result.finishTimeSeconds !==
                null,
          ),

      uniqueFinishPositions:
        finishPositions.length ===
          EXPECTED_RIDER_COUNT &&
        new Set(
          finishPositions,
        ).size ===
          EXPECTED_RIDER_COUNT,

      completionEventPresent:
        replayModelA.events.some(
          (event) =>
            event.type ===
              'RACE_COMPLETED' ||
            event.type ===
              'SIMULATION_COMPLETED',
        ),

      allStaminaValuesNull:
        replayModelA.frames.every(
          (frame) =>
            frame.riders.every(
              (rider) =>
                rider
                  .staminaPercent ===
                null,
            ),
        ),

      allFatigueValuesNull:
        replayModelA.frames.every(
          (frame) =>
            frame.riders.every(
              (rider) =>
                rider
                  .fatiguePercent ===
                null,
            ),
        ),
    };

  return {
    passed:
      allChecksPassed(
        checks,
      ),

    raceId:
      replayModelA.raceId,

    stageId:
      replayModelA.stageId,

    seed:
      replayModelA.seed,

    riderCount:
      stageInput.riders.length,

    snapshotCount:
      simulationOutput
        .snapshots
        .length,

    eventCount:
      simulationOutput
        .events
        .length,

    replayFrameCount:
      replayModelA.frames.length,

    replayFinalResultCount:
      replayModelA
        .finalResults
        .length,

    replayDurationSeconds:
      replayModelA
        .durationSeconds,

    firstFrameKm:
      firstFrame
        ?.leaderDistanceKm ??
      null,

    finalFrameKm:
      finalFrame
        ?.leaderDistanceKm ??
      null,

    finalProgress:
      finalFrame
        ?.progress ??
      null,

    stageInputHash:
      stageInputBefore.hash,

    simulationOutputHash:
      simulationOutputBefore.hash,

    replayModelHash:
      canonicalReplayModelA.hash,

    validationIssueCount:
      validation.issues.length,

    validationMessages:
      validation.issues.map(
        (issue) =>
          `${issue.path}: ${issue.message}`,
      ),

    checks,
  };
}

export default function RioStage1ReplayAdapterDiagnostic():
  JSX.Element {
  const [
    result,
    setResult,
  ] =
    useState<DiagnosticResult | null>(
      null,
    );

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    running,
    setRunning,
  ] =
    useState(false);

  const handleRun = (): void => {
    setRunning(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const nextResult =
        runRioStage1ReplayAdapterDiagnostic();

      setResult(nextResult);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error),
      );
    } finally {
      setRunning(false);
    }
  };

  const checkEntries =
    result
      ? Object.entries(
          result.checks,
        )
      : [];

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px',
        background: '#07111f',
        color: '#f5f7fa',
        fontFamily:
          'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1040px',
          margin: '0 auto',
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            color: '#8aa4c2',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform:
              'uppercase',
          }}
        >
          Development diagnostic
        </p>

        <h1
          style={{
            margin: '0 0 12px',
            fontSize: '34px',
          }}
        >
          Rio Stage 1 Replay Adapter
        </h1>

        <p
          style={{
            maxWidth: '800px',
            margin: '0 0 24px',
            color: '#b9c8d8',
            lineHeight: 1.6,
          }}
        >
          Runs Rio Stage 1 in browser
          memory, converts the deterministic
          output into the generic replay
          model twice, and verifies
          determinism, immutability, replay
          coverage, results, and validation.
        </p>

        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          style={{
            padding: '12px 20px',
            border: 0,
            borderRadius: '8px',
            cursor:
              running
                ? 'not-allowed'
                : 'pointer',
            fontSize: '15px',
            fontWeight: 700,
          }}
        >
          {running
            ? 'Running…'
            : 'Run replay adapter diagnostic'}
        </button>

        {errorMessage !== null && (
          <section
            style={{
              marginTop: '24px',
              padding: '20px',
              border:
                '1px solid #ff6b6b',
              borderRadius: '10px',
              background:
                'rgba(255, 107, 107, 0.08)',
            }}
          >
            <h2
              style={{
                marginTop: 0,
              }}
            >
              ERROR
            </h2>

            <pre
              style={{
                marginBottom: 0,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {errorMessage}
            </pre>
          </section>
        )}

        {result !== null && (
          <>
            <section
              style={{
                marginTop: '24px',
                padding: '24px',
                border:
                  result.passed
                    ? '1px solid #55d187'
                    : '1px solid #ff6b6b',
                borderRadius: '10px',
                background:
                  result.passed
                    ? 'rgba(85, 209, 135, 0.08)'
                    : 'rgba(255, 107, 107, 0.08)',
              }}
            >
              <h2
                style={{
                  margin: '0 0 8px',
                }}
              >
                {result.passed
                  ? 'PASS'
                  : 'FAIL'}
              </h2>

              <p
                style={{
                  margin: 0,
                  color: '#b9c8d8',
                }}
              >
                {result.passed
                  ? 'The Rio replay adapter produced a valid, deterministic, non-mutating generic replay model.'
                  : 'One or more replay-adapter checks failed.'}
              </p>
            </section>

            <section
              style={{
                marginTop: '20px',
                padding: '24px',
                border:
                  '1px solid #23364d',
                borderRadius: '10px',
                background: '#0d1a2a',
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                }}
              >
                Run summary
              </h2>

              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(220px, 1fr) 2fr',
                  gap: '10px 20px',
                  marginBottom: 0,
                }}
              >
                <dt>Race ID</dt>
                <dd>{result.raceId}</dd>

                <dt>Stage ID</dt>
                <dd>{result.stageId}</dd>

                <dt>Riders</dt>
                <dd>{result.riderCount}</dd>

                <dt>Source snapshots</dt>
                <dd>{result.snapshotCount}</dd>

                <dt>Source events</dt>
                <dd>{result.eventCount}</dd>

                <dt>Replay frames</dt>
                <dd>{result.replayFrameCount}</dd>

                <dt>Final results</dt>
                <dd>
                  {result.replayFinalResultCount}
                </dd>

                <dt>Replay duration</dt>
                <dd>
                  {result.replayDurationSeconds}
                  {' seconds'}
                </dd>

                <dt>First frame km</dt>
                <dd>{result.firstFrameKm}</dd>

                <dt>Final frame km</dt>
                <dd>{result.finalFrameKm}</dd>

                <dt>Final progress</dt>
                <dd>{result.finalProgress}</dd>

                <dt>Validation issues</dt>
                <dd>
                  {result.validationIssueCount}
                </dd>

                <dt>StageInput hash</dt>
                <dd>
                  <code>
                    {result.stageInputHash}
                  </code>
                </dd>

                <dt>SimulationOutput hash</dt>
                <dd>
                  <code>
                    {
                      result
                        .simulationOutputHash
                    }
                  </code>
                </dd>

                <dt>Replay model hash</dt>
                <dd>
                  <code>
                    {result.replayModelHash}
                  </code>
                </dd>

                <dt>Seed</dt>
                <dd>
                  <code>
                    {result.seed}
                  </code>
                </dd>
              </dl>
            </section>

            <section
              style={{
                marginTop: '20px',
                padding: '24px',
                border:
                  '1px solid #23364d',
                borderRadius: '10px',
                background: '#0d1a2a',
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                }}
              >
                Checks
              </h2>

              <ul
                style={{
                  marginBottom: 0,
                  paddingLeft: '20px',
                }}
              >
                {checkEntries.map(
                  ([
                    checkName,
                    passed,
                  ]) => (
                    <li
                      key={checkName}
                      style={{
                        marginBottom:
                          '8px',
                      }}
                    >
                      {passed
                        ? 'PASS'
                        : 'FAIL'}
                      {' — '}
                      {checkName}
                    </li>
                  ),
                )}
              </ul>
            </section>

            {result.validationMessages.length >
              0 && (
              <section
                style={{
                  marginTop: '20px',
                  padding: '24px',
                  border:
                    '1px solid #ffb84d',
                  borderRadius: '10px',
                  background:
                    'rgba(255, 184, 77, 0.08)',
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                  }}
                >
                  Validation messages
                </h2>

                <ul
                  style={{
                    marginBottom: 0,
                    paddingLeft: '20px',
                  }}
                >
                  {result
                    .validationMessages
                    .map(
                      (message) => (
                        <li
                          key={message}
                          style={{
                            marginBottom:
                              '8px',
                          }}
                        >
                          {message}
                        </li>
                      ),
                    )}
                </ul>
              </section>
            )}
          </>
        )}

        {!result &&
          !errorMessage && (
            <p
              style={{
                marginTop: '20px',
                color: '#8aa4c2',
              }}
            >
              Expected: 96 riders, 395
              replay frames, 98 events,
              and a 142 km final frame.
            </p>
          )}
      </div>
    </main>
  );
}
