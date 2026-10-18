import type { TFunction } from 'i18next'

const effectKeys: Record<string, string> = {
  'Tour Fatigue Protection': 'tourFatigueProtection',
  'Recovery Comfort': 'recoveryComfort',
  'Race Support Coverage': 'raceSupportCoverage',
  'Feeding Support': 'feedingSupport',
  'Mechanical Response': 'mechanicalResponse',
  'Tactical Communication': 'tacticalCommunication',
  'Incident Response': 'incidentResponse',
  'Race Fatigue Protection': 'raceFatigueProtection',
  'Race Support Quality': 'raceSupportQuality',
  'Mechanical Reliability': 'mechanicalReliability',
  'Equipment Protection': 'equipmentProtection',
  'Field Equipment Recovery': 'fieldEquipmentRecovery',
  'Health Protection': 'healthProtection',
  'Fatigue Control': 'fatigueControl',
  'Recovery Support': 'recoverySupport',
  'Medical response': 'medicalResponse',
  'Minor injury risk': 'minorInjuryRisk',
  'Hydration': 'hydration',
  'Heat/hydration': 'heatHydration',
  'Recovery': 'medicalRecovery',
}

const defaultVehicleNames: Record<string, string> = {
  'Team Car': 'assets.teamCar',
  'Team Bus': 'assets.teamBus',
  'Equipment Van': 'assets.equipmentVan',
  'Mobile Workshop': 'assets.mobileWorkshop',
  'Medical Van': 'assets.medicalVan',
}

/** Translate database-configured benefit labels, never change their numeric values. */
export function localizeAssetBenefit(
  source: string,
  t: TFunction<'infrastructure'>,
): string {
  const match = /^(.+?)\s+([+-]?\d+(?:[.,]\d+)?%?)$/.exec(source.trim())
  if (!match) return source
  const key = effectKeys[match[1].trim()]
  return key ? t(`assetBonusText.${key}`, { value: match[2] }) : source
}

/** Translate only generated vehicle labels; preserve names that managers supplied. */
export function localizeDefaultVehicleName(
  source: string | null | undefined,
  t: TFunction<'infrastructure'>,
): string {
  const raw = String(source ?? '').trim()
  const match = /^(Team Car|Team Bus|Equipment Van|Mobile Workshop|Medical Van) #(\d+)$/i.exec(raw)
  if (!match) return raw
  const key = Object.keys(defaultVehicleNames).find(name => name.toLowerCase() === match[1].toLowerCase())
  return key ? `${t(defaultVehicleNames[key])} #${match[2]}` : raw
}
