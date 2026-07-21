/**
 * RioStage1ShadowDiagnostic.tsx
 *
 * Browser-only, read-only Rio Stage 1 shadow diagnostic.
 *
 * This page:
 * - adapts the static production-shaped Rio source fixture
 * - runs the deterministic road-race engine twice in memory
 * - compares canonical inputs and outputs
 * - confirms all 96 riders finish
 *
 * It does not use Supabase, HTTP, persistence, API routes, or schedulers.
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

const EXPECTED_RACE_ID =
  '65739034-f9e5-4b5c-8f21-4ea27451e0d4';

const EXPECTED_STAGE_ID =
  '24709c46-b258-4db3-a3aa-fd92dc37630e';

const EXPECTED_SEED =
  `race_engine_ts_v1:${EXPECTED_RACE_ID}:${EXPECTED_STAGE_ID}`;

const EXPECTED_STAGE_INPUT_HASH =
  '85993905d61e0cc5';

const EXPECTED_SIMULATION_OUTPUT_HASH =
  '229fef0b88e36b02';

const EXPECTED_SOURCE_TEAM_COUNT = 20;
const EXPECTED_EXECUTABLE_TEAM_COUNT = 16;
const EXPECTED_RIDER_COUNT = 96;
const EXPECTED_PROFILE_POINT_COUNT = 9;
const EXPECTED_SNAPSHOT_COUNT = 395;
const EXPECTED_EVENT_COUNT = 98;
const EXPECTED_STAGE_DISTANCE_KM = 142;

interface DiagnosticChecks {
  readonly sourceFixtureUnchanged: boolean;
  readonly identicalStageInputs: boolean;
  readonly identicalStageInputHashes: boolean;
  readonly expectedExecutableTeamCount: boolean;
  readonly expectedRiderCount: boolean;
  readonly expectedProfilePointCount: boolean;
  readonly expectedProfileBoundaries: boolean;
  readonly expectedSeed: boolean;
  readonly identicalOutputs: boolean;
  readonly identicalOutputHashes: boolean;
  readonly expectedStageInputHash: boolean;
  readonly expectedSimulationOutputHash: boolean;
  readonly expectedSnapshotCount: boolean;
  readonly expectedEventCount: boolean;
  readonly allRidersFinished: boolean;
  readonly uniqueFinishPositions: boolean;
  readonly completionEventPresent: boolean;
}

interface DiagnosticResult {
  readonly passed: boolean;

  readonly raceId: string;
  readonly stageId: string;
  readonly seed: string;

  readonly sourceTeamCount: number;
  readonly executableTeamCount: number;
  readonly riderCount: number;
  readonly profilePointCount: number;

  readonly snapshotCount: number;
  readonly eventCount: number;
  readonly finishedRiderCount: number;

  readonly stageInputHash: string;
  readonly simulationOutputHash: string;

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
  return (
    checks.sourceFixtureUnchanged &&
    checks.identicalStageInputs &&
    checks.identicalStageInputHashes &&
    checks.expectedExecutableTeamCount &&
    checks.expectedRiderCount &&
    checks.expectedProfilePointCount &&
    checks.expectedProfileBoundaries &&
    checks.expectedSeed &&
    checks.identicalOutputs &&
    checks.identicalOutputHashes &&
    checks.expectedStageInputHash &&
    checks.expectedSimulationOutputHash &&
    checks.expectedSnapshotCount &&
    checks.expectedEventCount &&
    checks.allRidersFinished &&
    checks.uniqueFinishPositions &&
    checks.completionEventPresent
  );
}

function runRioStage1Diagnostic():
  DiagnosticResult {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows;

  const sourceBefore =
    createCanonicalHashedValue(
      sourceRows,
    );

  const stageInputA =
    createStageInputFromSourceRows(
      sourceRows,
    );

  const stageInputB =
    createStageInputFromSourceRows(
      sourceRows,
    );

  const sourceAfter =
    createCanonicalHashedValue(
      sourceRows,
    );

  const canonicalStageInputA =
    createCanonicalHashedValue(
      stageInputA,
    );

  const canonicalStageInputB =
    createCanonicalHashedValue(
      stageInputB,
    );

  const outputA =
    runDeterministicRoadRace(
      stageInputA,
    );

  const outputB =
    runDeterministicRoadRace(
      stageInputB,
    );

  const canonicalOutputA =
    createCanonicalHashedValue(
      outputA,
    );

  const canonicalOutputB =
    createCanonicalHashedValue(
      outputB,
    );

  const finishedRiderCount =
    outputA.finalRiderStates.filter(
      (rider) =>
        rider.finished &&
        rider.stageStatus ===
          'finished' &&
        rider.finishPosition !==
          null &&
        rider.finishTimeSeconds !==
          null,
    ).length;

  const finishPositions =
    outputA.finalRiderStates
      .map(
        (rider) =>
          rider.finishPosition,
      )
      .filter(
        (
          position,
        ): position is number =>
          position !== null,
      );

  const firstProfilePoint =
    stageInputA.profilePoints[0];

  const lastProfilePoint =
    stageInputA.profilePoints[
      stageInputA.profilePoints.length - 1
    ];

  const checks:
    DiagnosticChecks = {
      sourceFixtureUnchanged:
        sourceBefore.canonicalJson ===
          sourceAfter.canonicalJson &&
        sourceBefore.hash ===
          sourceAfter.hash,

      identicalStageInputs:
        canonicalStageInputA
          .canonicalJson ===
        canonicalStageInputB
          .canonicalJson,

      identicalStageInputHashes:
        canonicalStageInputA.hash ===
        canonicalStageInputB.hash,

      expectedExecutableTeamCount:
        stageInputA.teams.length ===
        EXPECTED_EXECUTABLE_TEAM_COUNT,

      expectedRiderCount:
        stageInputA.riders.length ===
        EXPECTED_RIDER_COUNT,

      expectedProfilePointCount:
        stageInputA.profilePoints.length ===
        EXPECTED_PROFILE_POINT_COUNT,

      expectedProfileBoundaries:
        firstProfilePoint?.kilometre ===
          0 &&
        lastProfilePoint?.kilometre ===
          EXPECTED_STAGE_DISTANCE_KM,

      expectedSeed:
        stageInputA.seed ===
        EXPECTED_SEED,

      identicalOutputs:
        canonicalOutputA
          .canonicalJson ===
        canonicalOutputB
          .canonicalJson,

      identicalOutputHashes:
        canonicalOutputA.hash ===
        canonicalOutputB.hash,

      expectedStageInputHash:
        canonicalStageInputA.hash ===
        EXPECTED_STAGE_INPUT_HASH,

      expectedSimulationOutputHash:
        canonicalOutputA.hash ===
        EXPECTED_SIMULATION_OUTPUT_HASH,

      expectedSnapshotCount:
        outputA.snapshots.length ===
        EXPECTED_SNAPSHOT_COUNT,

      expectedEventCount:
        outputA.events.length ===
        EXPECTED_EVENT_COUNT,

      allRidersFinished:
        finishedRiderCount ===
        EXPECTED_RIDER_COUNT,

      uniqueFinishPositions:
        finishPositions.length ===
          EXPECTED_RIDER_COUNT &&
        new Set(
          finishPositions,
        ).size ===
          EXPECTED_RIDER_COUNT,

      completionEventPresent:
        outputA.events.some(
          (event) =>
            event.eventType ===
            'SIMULATION_COMPLETED',
        ),
    };

  return {
    passed:
      allChecksPassed(
        checks,
      ),

    raceId:
      stageInputA.raceId,

    stageId:
      stageInputA.stageId,

    seed:
      stageInputA.seed,

    sourceTeamCount:
      sourceRows
        .participantTeams
        .length,

    executableTeamCount:
      stageInputA.teams.length,

    riderCount:
      stageInputA.riders.length,

    profilePointCount:
      stageInputA
        .profilePoints
        .length,

    snapshotCount:
      outputA.snapshots.length,

    eventCount:
      outputA.events.length,

    finishedRiderCount,

    stageInputHash:
      canonicalStageInputA.hash,

    simulationOutputHash:
      canonicalOutputA.hash,

    checks,
  };
}

export default function RioStage1ShadowDiagnostic() {
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
        runRioStage1Diagnostic();

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
          maxWidth: '960px',
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
          Rio Stage 1 Shadow Run
        </h1>

        <p
          style={{
            maxWidth: '760px',
            margin: '0 0 24px',
            color: '#b9c8d8',
            lineHeight: 1.6,
          }}
        >
          Executes two deterministic
          96-rider simulations entirely
          in browser memory and compares
          their canonical outputs.
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
            : 'Run Rio Stage 1 diagnostic'}
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
              FAIL
            </h2>

            <pre
              style={{
                marginBottom: 0,
                whiteSpace: 'pre-wrap',
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
                  ? 'Both Rio Stage 1 runs produced identical deterministic results.'
                  : 'One or more diagnostic checks failed.'}
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
                    'minmax(180px, 1fr) 2fr',
                  gap: '10px 20px',
                  marginBottom: 0,
                }}
              >
                <dt>Race ID</dt>
                <dd>{result.raceId}</dd>

                <dt>Stage ID</dt>
                <dd>{result.stageId}</dd>

                <dt>Source teams</dt>
                <dd>
                  {result.sourceTeamCount}
                </dd>

                <dt>Executable teams</dt>
                <dd>
                  {result.executableTeamCount}
                </dd>

                <dt>Riders</dt>
                <dd>{result.riderCount}</dd>

                <dt>Finished riders</dt>
                <dd>
                  {result.finishedRiderCount}
                </dd>

                <dt>Profile points</dt>
                <dd>
                  {result.profilePointCount}
                </dd>

                <dt>Snapshots</dt>
                <dd>
                  {result.snapshotCount}
                </dd>

                <dt>Events</dt>
                <dd>
                  {result.eventCount}
                </dd>

                <dt>StageInput hash</dt>
                <dd>
                  <code>
                    {result.stageInputHash}
                  </code>
                </dd>

                <dt>Output hash</dt>
                <dd>
                  <code>
                    {
                      result
                        .simulationOutputHash
                    }
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
              Expected source teams:{' '}
              {
                EXPECTED_SOURCE_TEAM_COUNT
              }
            </p>
          )}
      </div>
    </main>
  );
}