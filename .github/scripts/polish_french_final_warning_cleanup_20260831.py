from __future__ import annotations

import polish_french_human_quality_followup_20260831 as base

base.base.OVERRIDES.update({
    'manual.json.sections.race-plan-deep.title': 'Guide approfondi du Race Plan',
    'manual.json.sections.stage-plan-deep.title': 'Guide approfondi des Stage Plans',
    'racePreparation.json.racePlan.assetOption': 'Niv. {{level}} · état {{condition}} %',
})

if __name__ == '__main__':
    base.base.main()
