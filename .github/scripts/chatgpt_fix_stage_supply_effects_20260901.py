from pathlib import Path

PATH = Path("src/pages/dashboard/RacePreparation.tsx")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise AssertionError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def main() -> None:
    text = PATH.read_text(encoding="utf-8")
    original = text

    # Keep the player-facing help copy aligned with the actual Phase 9 supply
    # defaults currently used by race_engine_get_stage_phase9_inputs_v1.
    text = replace_once(
        text,
        '''    positiveEffects: [
      "Hydration support: +0.2% stamina stability per bidon",
      "Fatigue control: -0.2% stage fatigue per bidon",
    ],
    negativeEffects: [
      "Below minimum: +1% fatigue risk",
      "No extra benefit after 10 bidons per rider",
    ],''',
        '''    positiveEffects: [
      "Energy saving: +0.6% per usable bidon per rider",
      "Fatigue reduction: +0.6% per usable bidon per rider",
    ],
    negativeEffects: [
      "Stock shortages reduce the positive effect and can add a +3% fatigue penalty",
      "No additional selection beyond 10 bidons per rider",
    ],''',
        "bidon help copy",
    )

    text = replace_once(
        text,
        '''    positiveEffects: [
      "Energy boost: +0.5% stamina per gel",
      "Final effort support: +0.25% sprint/climb/attack efficiency per gel",
    ],
    negativeEffects: [
      "No gels: -1% final-phase stamina support",
      "No extra benefit after 4 gels per rider",
    ],''',
        '''    positiveEffects: [
      "Energy saving: +1.5% per usable gel per rider",
      "Race support: +0.75 points per usable gel per rider",
      "Power gels: up to 2 effective gels per rider, +5 live energy each from the late-race checkpoints",
    ],
    negativeEffects: [
      "Stock shortages reduce the positive effect and can add a +3% fatigue penalty",
      "General supply effects use up to 4 gels per rider; the separate live-energy Power Gel effect uses at most 2",
    ],''',
        "gel help copy",
    )

    text = replace_once(
        text,
        '''    positiveEffects: [
      "Endurance support: +1% stamina stability per pack",
      "Recovery support: +0.5% post-stage recovery per pack",
    ],
    negativeEffects: [
      "No nutrition on long stages: +1% fatigue pressure",
      "No extra benefit after 2 packs per rider",
    ],''',
        '''    positiveEffects: [
      "Energy saving: +3% per usable nutrition pack per rider",
      "Post-stage recovery: +1.5 points per usable nutrition pack per rider",
    ],
    negativeEffects: [
      "Stock shortages reduce the positive effect and can add a +3% fatigue penalty",
      "No additional selection beyond 2 nutrition packs per rider",
    ],''',
        "nutrition help copy",
    )

    text = replace_once(
        text,
        '''    positiveEffects: [
      "Race readiness: +0.5% setup readiness",
      "Comfort support: +0.25% fatigue control",
    ],
    negativeEffects: ["Missing jersey kit: blocks stage setup"],''',
        '''    positiveEffects: [
      "Race support: +1.5 points when a usable jersey kit is available per rider",
      "Fatigue reduction: +0.75% when a usable jersey kit is available per rider",
    ],
    negativeEffects: ["Missing jersey kit: blocks stage setup"],''',
        "jersey help copy",
    )

    if "type StageSupplyEffectPreview =" not in text:
        signature = "function getStageSupplyNeeds("
        start = text.index(signature)
        next_function = text.index("\nfunction ", start + len(signature))
        helper = r'''

type StageSupplyEffectPreview = {
  supportPoints: number;
  energySavingPct: number;
  fatigueReductionPct: number;
  recoveryBonusPoints: number;
  fatiguePenaltyPct: number;
  powerGelsEffectivePerRider: number;
  powerGelLiveEnergyMax: number;
  shortages: string[];
};

function formatStageSupplyEffectNumber(value: number): string {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function getStageSupplyEffectPreview({
  riders,
  plan,
  supplyOptions,
  stage,
}: {
  riders: JsonRecord[];
  plan: StageTeamSupplyPlan;
  supplyOptions: RaceSupplyOption[];
  stage: JsonRecord | null;
}): StageSupplyEffectPreview {
  const needs = getStageSupplyNeeds(riders, plan, stage);
  const riderCount = needs.riderCount;

  if (riderCount <= 0) {
    return {
      supportPoints: 0,
      energySavingPct: 0,
      fatigueReductionPct: 0,
      recoveryBonusPoints: 0,
      fatiguePenaltyPct: 0,
      powerGelsEffectivePerRider: 0,
      powerGelLiveEnergyMax: 0,
      shortages: [],
    };
  }

  const shortages: string[] = [];
  const usable = (
    label: string,
    supplyKey: string,
    plannedQuantity: number,
  ) => {
    const planned = Math.max(0, plannedQuantity);
    const available = Math.max(
      0,
      getSupplyAvailableQuantity(supplyOptions, supplyKey),
    );

    if (planned > available) {
      shortages.push(`${label}: ${available} available / ${planned} planned`);
    }

    return {
      usable: Math.min(planned, available),
      shortage: planned > available,
    };
  };

  const bidons = usable(
    "Bidons",
    "bidons_water_bottles",
    needs.bidons_water_bottles,
  );
  const gels = usable("Energy gels", "energy_gels", needs.energy_gels);
  const nutrition = usable(
    "Nutrition packs",
    "nutrition_packs",
    needs.nutrition_packs,
  );
  const jerseys = usable(
    "Race jerseys",
    "race_jersey_complete",
    needs.race_jersey_complete,
  );

  const supportPoints =
    (0.75 * gels.usable) / riderCount +
    (1.5 * jerseys.usable) / riderCount;
  const energySavingPct =
    (0.6 * bidons.usable) / riderCount +
    (1.5 * gels.usable) / riderCount +
    (3.0 * nutrition.usable) / riderCount;
  const fatigueReductionPct =
    (0.6 * bidons.usable) / riderCount +
    (0.75 * jerseys.usable) / riderCount;
  const recoveryBonusPoints = (1.5 * nutrition.usable) / riderCount;
  const hasConsumableShortage =
    bidons.shortage || gels.shortage || nutrition.shortage;
  const powerGelsEffectivePerRider = Math.min(
    2,
    Math.floor(gels.usable / riderCount),
  );

  return {
    supportPoints,
    energySavingPct,
    fatigueReductionPct,
    recoveryBonusPoints,
    fatiguePenaltyPct: hasConsumableShortage ? 3 : 0,
    powerGelsEffectivePerRider,
    powerGelLiveEnergyMax: powerGelsEffectivePerRider * 5,
    shortages,
  };
}
'''
        text = text[:next_function] + helper + text[next_function:]

    card_start = text.index("function StageFinalCalculationCard(")
    card_end = text.index("\nfunction ", card_start + len("function StageFinalCalculationCard("))
    card = text[card_start:card_end]

    if "Stage Supply Effects" in card:
        raise AssertionError("Stage Supply Effects block already exists unexpectedly")

    card = replace_once(
        card,
        "  const needs = getStageSupplyNeeds(riders, teamPlan, stage);\n",
        '''  const needs = getStageSupplyNeeds(riders, teamPlan, stage);
  const supplyEffects = getStageSupplyEffectPreview({
    riders,
    plan: teamPlan,
    supplyOptions,
    stage,
  });
''',
        "supply effect calculation",
    )

    card = replace_once(
        card,
        'label="Race Plan bonus total"',
        'label="Race Plan bonus (staff/assets/policies)"',
        "top Race Plan bonus label",
    )

    card = replace_once(
        card,
        '''              <div className="text-sm font-semibold text-slate-900">{racePrepText("screen.racePlanBonuses")}</div>
              <div className="mt-3 space-y-2">''',
        '''              <div className="text-sm font-semibold text-slate-900">{racePrepText("screen.racePlanBonuses")}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Stage supplies are calculated separately below. A +0% Race Plan
                row does not mean your selected bidons, gels, nutrition or
                jerseys have no effect.
              </p>
              <div className="mt-3 space-y-2">''',
        "Race Plan bonus explanation",
    )

    stage_supply_anchor = '''              <div className="text-sm font-semibold text-slate-900">{racePrepText("screen.stageSuppliesSummary")}</div>
              <div className="mt-3 grid gap-2 text-sm">'''
    stage_supply_replacement = '''              <div className="text-sm font-semibold text-slate-900">{racePrepText("screen.stageSuppliesSummary")}</div>

              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">
                      Stage Supply Effects
                    </div>
                    <p className="mt-1 text-xs leading-5 text-emerald-800/80">
                      Live preview from this stage plan and currently available
                      stock. These effects are separate from the Race Plan bonus
                      rows above.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-emerald-700 shadow-sm">
                    Engine preview
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="text-slate-600">Energy saving</span>
                    <strong className="text-emerald-700">
                      +{formatStageSupplyEffectNumber(supplyEffects.energySavingPct)}%
                    </strong>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="text-slate-600">Fatigue reduction</span>
                    <strong className="text-emerald-700">
                      +{formatStageSupplyEffectNumber(supplyEffects.fatigueReductionPct)}%
                    </strong>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="text-slate-600">Race support</span>
                    <strong className="text-emerald-700">
                      +{formatStageSupplyEffectNumber(supplyEffects.supportPoints)} pts
                    </strong>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="text-slate-600">Post-stage recovery</span>
                    <strong className="text-emerald-700">
                      +{formatStageSupplyEffectNumber(supplyEffects.recoveryBonusPoints)} pts
                    </strong>
                  </div>
                </div>

                <div className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-800">Power gels:</span>{" "}
                  {supplyEffects.powerGelsEffectivePerRider} effective per rider
                  for the separate live-energy effect · up to +
                  {formatStageSupplyEffectNumber(supplyEffects.powerGelLiveEnergyMax)}{" "}
                  live energy.
                </div>

                {supplyEffects.fatiguePenaltyPct > 0 ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-800">
                    Supply shortage penalty: +
                    {formatStageSupplyEffectNumber(supplyEffects.fatiguePenaltyPct)}%{" "}
                    fatigue pressure. Positive supply effects are also capped by
                    available stock.
                  </div>
                ) : null}

                {supplyEffects.shortages.length > 0 ? (
                  <div className="mt-2 text-xs leading-5 text-amber-800">
                    <span className="font-semibold">Stock limits:</span>{" "}
                    {supplyEffects.shortages.join(" · ")}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 text-sm">'''
    card = replace_once(
        card,
        stage_supply_anchor,
        stage_supply_replacement,
        "Stage Supply Effects panel",
    )

    text = text[:card_start] + card + text[card_end:]

    if text == original:
        raise AssertionError("No RacePreparation changes were produced")

    PATH.write_text(text, encoding="utf-8")
    print("Patched Stage Supply help copy and Final Stage Calculation preview.")


if __name__ == "__main__":
    main()
