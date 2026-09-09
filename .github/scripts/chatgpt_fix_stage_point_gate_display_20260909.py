from pathlib import Path

PATH = Path('src/pages/dashboard/RaceDetailPage.tsx')
text = PATH.read_text(encoding='utf-8')

function_marker = 'function SimpleReplayStagePointsPanel({'
function_start = text.index(function_marker)
function_end = text.index('\ntype UniversalShadowMode', function_start)
original_panel = text[function_start:function_end]

if 'const cumulativeRows = useMemo(() => {' not in original_panel:
    raise SystemExit('Expected cumulative stage totals logic was not found in SimpleReplayStagePointsPanel')
if "{t('replay.currentStageTotals')}" not in original_panel:
    raise SystemExit('Expected cumulative stage totals UI was not found in SimpleReplayStagePointsPanel')

logic_start = text.index('  const rows = selectedPoint?.reached', function_start)
logic_end_marker = '  }, [currentKm, pointResults, stagePoints])\n\n  return ('
logic_end = text.index(logic_end_marker, logic_start) + len(logic_end_marker)

new_logic = '''  const selectedStagePoint =
    stagePoints.find((point) => point.id === selectedPointId) ?? null
  const pointsScheme = Array.isArray(selectedStagePoint?.points_scheme)
    ? selectedStagePoint.points_scheme
    : []
  const bonusScheme = Array.isArray(selectedStagePoint?.time_bonus_seconds)
    ? selectedStagePoint.time_bonus_seconds
    : []
  const expectedAwardRanks = new Set<number>()
  const expectedAwardPositionCount = Math.max(
    pointsScheme.length,
    bonusScheme.length
  )

  for (let index = 0; index < expectedAwardPositionCount; index += 1) {
    const points = Number(pointsScheme[index] ?? 0)
    const bonusSeconds = Number(bonusScheme[index] ?? 0)

    if (
      (Number.isFinite(points) && points > 0) ||
      (Number.isFinite(bonusSeconds) && bonusSeconds > 0)
    ) {
      expectedAwardRanks.add(index + 1)
    }
  }

  const selectedAwardRows = selectedPoint?.reached
    ? pointResults
        .filter((row) => {
          const rank = Number(row.rank ?? 0)
          const hasAward =
            Number(row.points_awarded ?? 0) > 0 ||
            Number(row.bonus_seconds_awarded ?? 0) > 0

          return (
            row.point_id === selectedPointId &&
            Number.isInteger(rank) &&
            rank > 0 &&
            hasAward &&
            (expectedAwardRanks.size === 0 || expectedAwardRanks.has(rank))
          )
        })
        .sort((left, right) => Number(left.rank ?? 999) - Number(right.rank ?? 999))
    : []

  const receivedAwardRanks = new Set(
    selectedAwardRows
      .map((row) => Number(row.rank ?? 0))
      .filter((rank) => Number.isInteger(rank) && rank > 0)
  )
  const pointAwardPending =
    Boolean(selectedPoint?.reached) &&
    expectedAwardRanks.size > 0 &&
    [...expectedAwardRanks].some((rank) => !receivedAwardRanks.has(rank))
  const rows = pointAwardPending ? [] : selectedAwardRows

  return ('''

text = text[:logic_start] + new_logic + text[logic_end:]

old_description = "{t('replay.stagePointsDescription')}"
new_description = "{t('replay.stagePointAwardDescription', { defaultValue: 'Awards for the selected point appear once all scoring positions are finalized.' })}"
description_pos = text.find(old_description, function_start, function_end + 4000)
if description_pos < 0:
    raise SystemExit('Stage-points description marker was not found')
text = text[:description_pos] + new_description + text[description_pos + len(old_description):]

old_empty_award = '''      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {t('replay.pointNoAward')}
        </div>
'''
new_empty_award = '''      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {pointAwardPending
            ? t('replay.pointAwardsPending', {
                defaultValue:
                  'Waiting for all scoring positions to reach this point. Awards will be published together once the full scoring set is known.',
              })
            : t('replay.pointNoAward')}
        </div>
'''
if old_empty_award not in text[function_start:function_end + 6000]:
    raise SystemExit('Selected-point empty award block was not found')
text = text.replace(old_empty_award, new_empty_award, 1)

# The selected dropdown represents one gate. Do not show a second table containing
# accumulated awards from all previous stage gates beneath it.
function_start = text.index(function_marker)
render_start = text.index(
    '\n      <div className="mt-4 border-t border-slate-100 pt-4">',
    function_start,
)
outer_close = text.index('\n    </div>\n  )\n}', render_start)
text = text[:render_start] + text[outer_close:]

function_start = text.index(function_marker)
function_end = text.index('\ntype UniversalShadowMode', function_start)
panel = text[function_start:function_end]

required = [
    'expectedAwardRanks',
    'pointAwardPending',
    'selectedAwardRows',
    'Awards will be published together once the full scoring set is known.',
]
for marker in required:
    if marker not in panel:
        raise SystemExit(f'Missing expected patched marker: {marker}')

for forbidden in ['const cumulativeRows = useMemo(() => {', "{t('replay.currentStageTotals')}"]:
    if forbidden in panel:
        raise SystemExit(f'Cumulative stage totals were not fully removed: {forbidden}')

PATH.write_text(text, encoding='utf-8')
print('Patched selected stage-point gate display successfully.')
