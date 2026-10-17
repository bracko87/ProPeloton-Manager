import type { TFunction } from 'i18next'

type FinanceT = TFunction<'finance'>
type LedgerEntry = { type: string; type_name?: string | null; metadata?: unknown }

const LABELS: Record<string, string> = {
  sponsor_contract_payment: 'transactionLabels.sponsorContractPayment',
  sponsor_objective_bonus: 'transactionLabels.bonus',
  tax_withholding: 'transactionLabels.taxWithholding',
  tax_monthly_adjustment: 'transactionLabels.taxMonthlyAdjustment',
  tax_monthly_refund: 'transactionLabels.taxMonthlyRefund',
  rider_salary_payday: 'transactionLabels.riderSalaryPayday',
  rider_salary_payday_reset_reversal: 'transactionLabels.riderSalary',
  staff_salary_payday: 'transactionLabels.staffSalaryPayday',
  new_club_bonus: 'transactionLabels.newClubBonus',
  staff_course_fee: 'transactionLabels.staffCourseFee',
  staff_release_cost: 'transactionLabels.staffReleaseCost',
  infrastructure_facility_start: 'transactionLabels.infrastructureFacilityStart',
  infrastructure_asset_start: 'transactionLabels.infrastructureAssetStart',
  infrastructure_asset_delivery_start: 'transactionLabels.infrastructureDelivery',
  infrastructure_asset_repair: 'transactionLabels.infrastructureAssetRepair',
  infrastructure_asset_sale: 'transactionLabels.infrastructureAssetSale',
  infrastructure_job_refund: 'transactionLabels.infrastructureJobRefund',
  club_house_monthly_maintenance: 'transactionLabels.clubHouseMonthlyMaintenance',
  club_house_staff_payroll_saving: 'transactionLabels.clubHouseStaffPayrollSaving',
  team_policy_housing_cost: 'transactionLabels.teamPolicyHousingCost',
  team_policy_accommodation_cost: 'transactionLabels.hotel',
  team_policy_logistics_cost: 'transactionLabels.transport',
  team_policy_travel_cost: 'transactionLabels.travel',
  team_policy_nutrition_cost: 'transactionLabels.teamPolicyCost',
  team_policy_recovery_support_cost: 'transactionLabels.teamPolicyCost',
  team_policy_one_time_cost: 'transactionLabels.teamPolicyCost',
  race_prize: 'transactionLabels.racePrize',
  race_supplies_purchase: 'transactionLabels.raceSupplies',
  race_preparation_cost: 'transactionLabels.racePreparationCost',
  race_missed_startlist_fine: 'transactionLabels.raceEntryFine',
  race_prestart_disqualification_fine: 'transactionLabels.raceEntryFine',
  race_result_correction: 'transactionLabels.racePrizeCorrection',
  race_reset_reversal: 'transactionLabels.racePrizeCorrection',
  competition_reward_cash: 'transactionLabels.competitionRewardDetailed',
  competition_reward_net_correction: 'transactionLabels.racePrizeCorrection',
  rider_transfer_fee_paid: 'transactionLabels.riderTransferFeePaid',
  rider_transfer_signing_cost_paid: 'transactionLabels.freeAgentTransferSigning',
  rider_free_agent_signing_cost_paid: 'transactionLabels.freeAgentTransferSigning',
  free_agent_signing_cost_paid: 'transactionLabels.freeAgentSigningCostPaid',
  rider_release_compensation: 'transactionLabels.transferFee',
  emergency_loan_disbursement: 'transactionLabels.emergencyLoanDisbursement',
  emergency_loan_principal_repayment: 'transactionLabels.loanPrincipalRepayment',
  emergency_loan_interest: 'transactionLabels.loanInterest',
  emergency_loan_reset_reversal: 'transactionLabels.loan',
  training_camp_booking: 'transactionLabels.trainingCampBookingDetailed',
  training_camp_refund: 'transactionLabels.trainingCampRefundDetailed',
  equipment_purchase: 'transactionLabels.equipmentPurchaseDetailed',
  equipment_maintenance: 'transactionLabels.equipment',
  equipment_sale: 'transactionLabels.equipment',
  starting_cash_balance_rebase: 'transactionLabels.startingBalanceAdjustment',
  game_world_reset_starting_cash: 'transactionLabels.startingBalanceAdjustment',
  youth_academy_budget_transfer: 'transactionLabels.transfer',
  income: 'financeCategories.income',
  test_cost_fee: 'transactionLabels.other',
  test_cost_hotel: 'transactionLabels.hotel',
  test_cost_maintenance: 'transactionLabels.other',
  test_cost_travel: 'transactionLabels.travel',
  test_cost_upgrade: 'transactionLabels.infrastructure',
  test_income_bonus: 'transactionLabels.bonus',
  test_income_grant: 'transactionLabels.bonus',
  test_income_prize: 'transactionLabels.racePrize',
  test_income_sale: 'transactionLabels.equipment',
  test_income_sponsor: 'transactionLabels.sponsor',
}

export function getLedgerTypeLabel(t: FinanceT, entry: LedgerEntry): string {
  const key = LABELS[entry.type]
  return key ? t(key) : (entry.type_name || t('transactionLabels.other'))
}

function metadataOf(entry: LedgerEntry): Record<string, unknown> {
  return entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
    ? entry.metadata as Record<string, unknown>
    : {}
}

function textValue(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(trimmed) ? trimmed : null
}

export function getLedgerExplanation(t: FinanceT, entry: LedgerEntry): string {
  const meta = metadataOf(entry)
  const race = textValue(meta.race_name)
  const rider = textValue(meta.rider_name)
  const sponsor = textValue(meta.sponsor_name)
  const asset = textValue(meta.asset_name) || textValue(meta.camp_name)
  const count = Number(meta.rider_count ?? meta.main_squad_rider_count ?? 0)

  if (entry.type === 'club_house_monthly_maintenance')
    return t('transactionDetails.explainClubMaintenance')
  if (entry.type === 'tax_monthly_adjustment' || entry.type === 'tax_monthly_refund')
    return t('transactionDetails.explainTaxAdjustment')
  if (entry.type === 'tax_withholding')
    return t('transactionDetails.explainTaxWithholding')
  if (entry.type === 'rider_salary_payday' && count > 0)
    return t('transactionDetails.explainRiderSalary', { count })
  if (entry.type === 'race_prize' && rider)
    return t('transactionDetails.explainRacePrize', { name: rider })
  if (entry.type === 'race_preparation_cost' && race)
    return t('transactionDetails.explainRacePreparation', { name: race })
  if (entry.type === 'sponsor_contract_payment' && sponsor)
    return t('transactionDetails.explainSponsor', { name: sponsor })
  if (entry.type.startsWith('infrastructure_') && asset)
    return t('transactionDetails.explainAsset', { name: asset })

  const subject = race || rider || sponsor || asset
  if (subject) return t('transactionDetails.explainSubject', { name: subject })
  return t('transactionDetails.explainOther')
}

export function getLedgerContext(t: FinanceT, entry: LedgerEntry): string[] {
  const m = metadataOf(entry)
  const out: string[] = []
  const period = textValue(m.period_key) ||
    (textValue(m.period_start) && textValue(m.period_end)
      ? `${m.period_start} — ${m.period_end}`
      : null)
  if (period) out.push(t('transactionDetails.forPeriod', { period }))
  if (m.club_house_level != null)
    out.push(t('transactionDetails.clubHouseLevel', { level: m.club_house_level }))
  if (m.rank != null && ['race_prize','tax_withholding'].includes(entry.type))
    out.push(t('transactionDetails.raceRank', { rank: m.rank }))
  return out
}
