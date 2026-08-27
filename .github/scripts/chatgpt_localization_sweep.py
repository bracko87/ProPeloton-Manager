from pathlib import Path
import json
import re


def load_json(path: str):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def save_json(path: str, value) -> None:
    Path(path).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


def replace(path: str, old: str, new: str, required: bool = False) -> int:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if required and count == 0:
        raise SystemExit(f'Missing required replacement in {path}: {old[:150]!r}')
    if count:
        p.write_text(text.replace(old, new), encoding='utf-8')
    print(f'{path}: replaced {count}: {old[:100]!r}')
    return count


def replace_once(path: str, old: str, new: str, required: bool = False) -> int:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if required and count == 0:
        raise SystemExit(f'Missing required replacement in {path}: {old[:150]!r}')
    if count:
        p.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'{path}: replaced-once {1 if count else 0}: {old[:100]!r}')
    return 1 if count else 0


def regex_replace(path: str, pattern: str, new: str, required: bool = False) -> int:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    text2, count = re.subn(pattern, new, text, flags=re.MULTILINE)
    if required and count == 0:
        raise SystemExit(f'Missing required regex in {path}: {pattern[:150]!r}')
    if count:
        p.write_text(text2, encoding='utf-8')
    print(f'{path}: regex replaced {count}: {pattern[:100]!r}')
    return count


# ---------------------------------------------------------------------------
# TRAINING CAMPS
# ---------------------------------------------------------------------------
training_path = 'src/pages/dashboard/Training.tsx'
training_en_path = 'src/i18n/locales/en/training.json'
training_sr_path = 'src/i18n/locales/sr-Latn/training.json'
training_en = load_json(training_en_path)
training_sr = load_json(training_sr_path)

training_en.setdefault('camps', {}).update({
    'perRider': 'rider',
    'selectedPeriodLabel': 'Selected period',
    'quoteTitle': 'Quote & Booking',
    'calculatingQuote': 'Calculating quote…',
    'chargedParticipants': 'Charged participants',
    'perPerson': 'Per person',
    'travelTotal': 'Travel total',
    'accommodation': 'Accommodation',
    'campFee': 'Camp fee',
    'logistics': 'Logistics',
    'totalCampCost': 'Total camp cost',
    'bookingBlocked': 'Booking blocked',
    'warnings': 'Warnings',
    'genericShort': '{{city}} offers a focused {{type}} training environment for rider preparation.',
    'genericLong': 'This camp in {{city}} provides structured conditions for {{type}} training, team preparation, and rider development.',
    'genericBestFor': 'Riders and teams focused on {{type}} preparation.',
    'genericWeatherNote': 'Check the forecast and seasonal conditions carefully before booking.',
    'overlapRider': 'Unavailable for this date range: already in an overlapping camp.',
    'injuredCanAttend': 'Can attend camp, but will not train until recovered.',
    'overlapWarning': 'Some riders are unavailable for the selected date range because they are already assigned to an overlapping training camp.',
    'staffSelectionDescription': 'Optional. Staff add camp boosts, but each selected staff member is charged like one rider.',
    'loadingStaff': 'Loading available staff…',
    'noEligibleStaff': 'No eligible camp staff found. You can still book the camp without staff, but riders will not receive staff boosts.',
    'noStaffSelected': 'No staff selected. The camp can still be booked, but there will be no coach, doctor, mechanic, or director boost.',
    'unknownStaff': 'Unknown staff',
    'scope': 'Scope: {{value}}',
})
training_sr.setdefault('camps', {}).update({
    'perRider': 'vozaču',
    'selectedPeriodLabel': 'Izabrani period',
    'quoteTitle': 'Ponuda i rezervacija',
    'calculatingQuote': 'Izračunavanje ponude…',
    'chargedParticipants': 'Učesnici koji se naplaćuju',
    'perPerson': 'Po osobi',
    'travelTotal': 'Ukupan trošak puta',
    'accommodation': 'Smeštaj',
    'campFee': 'Naknada za kamp',
    'logistics': 'Logistika',
    'totalCampCost': 'Ukupan trošak kampa',
    'bookingBlocked': 'Rezervacija je blokirana',
    'warnings': 'Upozorenja',
    'genericShort': '{{city}} pruža fokusirano okruženje za {{type}} trening i pripremu vozača.',
    'genericLong': 'Ovaj kamp u mestu {{city}} pruža strukturisane uslove za {{type}} trening, pripremu tima i razvoj vozača.',
    'genericBestFor': 'Vozači i timovi fokusirani na {{type}} pripremu.',
    'genericWeatherNote': 'Pažljivo proverite prognozu i sezonske uslove pre rezervacije.',
    'overlapRider': 'Nedostupan za izabrani period: već je u drugom trening kampu koji se preklapa.',
    'injuredCanAttend': 'Može prisustvovati kampu, ali neće trenirati dok se ne oporavi.',
    'overlapWarning': 'Neki vozači nisu dostupni za izabrani period jer su već dodeljeni trening kampu koji se vremenski preklapa.',
    'staffSelectionDescription': 'Opciono. Osoblje daje bonuse kampu, ali se svaki izabrani član osoblja naplaćuje kao jedan vozač.',
    'loadingStaff': 'Učitavanje dostupnog osoblja…',
    'noEligibleStaff': 'Nema dostupnog osoblja za kamp. Kamp i dalje možete rezervisati bez osoblja, ali vozači neće dobiti bonuse osoblja.',
    'noStaffSelected': 'Nije izabrano osoblje. Kamp i dalje može biti rezervisan, ali neće biti bonusa trenera, doktora, mehaničara ili sportskog direktora.',
    'unknownStaff': 'Nepoznati član osoblja',
    'scope': 'Opseg: {{value}}',
})

training_en['campTags'] = {
    'standard': 'standard', 'budget': 'budget', 'premium': 'premium', 'elite': 'elite',
    'flat': 'flat', 'mountain': 'mountain', 'rolling': 'rolling', 'altitude': 'altitude',
    'coastal': 'coastal', 'mixed': 'mixed', 'tt_friendly': 'TT friendly',
}
training_sr['campTags'] = {
    'standard': 'standardni', 'budget': 'povoljan', 'premium': 'premium', 'elite': 'elitni',
    'flat': 'ravničarski', 'mountain': 'planinski', 'rolling': 'talasast', 'altitude': 'visinska baza',
    'coastal': 'primorski', 'mixed': 'mešovit', 'tt_friendly': 'pogodan za hronometar',
}

# Ensure every direct string patched below has a resource key even if an older resource was incomplete.
for resource, values in [
    (training_en, {
        'bestPeriod': 'Best period', 'riskyPeriod': 'Risky period', 'normalPeriod': 'Normal',
        'existingBooking': 'Existing camp booking',
    }),
    (training_sr, {
        'bestPeriod': 'Najbolji period', 'riskyPeriod': 'Rizičan period', 'normalPeriod': 'Normalan period',
        'existingBooking': 'Postojeća rezervacija kampa',
    }),
]:
    resource.setdefault('weather', {}).update(values)

for resource, values in [
    (training_en, {
        'earliestStart': 'Earliest start: {{date}}', 'seasonLabel': 'Season {{season}}',
        'daysCount': '{{count}} days', 'checkDates': 'Check the camp dates before booking',
        'refundNotice': 'Plan camp dates carefully. Once a training camp is booked, cancelling it close to the start date may only return a partial refund or no refund.',
        'cannotStartPast': 'Training camp cannot start today or in the past.',
        'earliestStartSentence': 'Earliest start is {{date}}.', 'noMatches': 'No camp matches the current filters.',
        'imagePlaceholder': 'Camp image placeholder', 'closeCancel': 'Close cancel training camp modal',
        'important': 'Important', 'assignedRiders': 'Assigned Riders',
    }),
    (training_sr, {
        'earliestStart': 'Najraniji početak: {{date}}', 'seasonLabel': 'Sezona {{season}}',
        'daysCount': '{{count}} dana', 'checkDates': 'Proverite datume kampa pre rezervacije',
        'refundNotice': 'Pažljivo isplanirajte datume kampa. Nakon rezervacije, otkazivanje blizu početka može doneti samo delimičan povraćaj sredstava ili bez povraćaja.',
        'cannotStartPast': 'Trening kamp ne može početi danas niti u prošlosti.',
        'earliestStartSentence': 'Najraniji početak je {{date}}.', 'noMatches': 'Nijedan kamp ne odgovara izabranim filterima.',
        'imagePlaceholder': 'Slika kampa nije dostupna', 'closeCancel': 'Zatvori prozor za otkazivanje trening kampa',
        'important': 'Važno', 'assignedRiders': 'Dodeljeni vozači',
    }),
]:
    resource.setdefault('camps', {}).update(values)

save_json(training_en_path, training_en)
save_json(training_sr_path, training_sr)

# Main page gets locale awareness so database-authored English marketing copy does not leak into Serbian UI.
replace_once(
    training_path,
    "export default function TrainingPage(): JSX.Element {\n  const { t } = useTranslation('training')",
    "export default function TrainingPage(): JSX.Element {\n  const { t, i18n } = useTranslation('training')\n  const isSerbianUi = (i18n.resolvedLanguage ?? i18n.language ?? 'en').startsWith('sr')",
    required=True,
)

# Calendar legend.
replace(training_path, '<span>Best period</span>', "<span>{t('weather.bestPeriod')}</span>")
replace(training_path, '<span>Risky period</span>', "<span>{t('weather.riskyPeriod')}</span>")
replace(training_path, '<span>Normal</span>', "<span>{t('weather.normalPeriod')}</span>")
replace(training_path, '<span>Existing camp booking</span>', "<span>{t('weather.existingBooking')}</span>")

# Camp cards/details. Keep proper camp names/cities untouched; localize descriptive database prose for Serbian.
replace(training_path, '                              {t(\'camps.noImage\')}', "                              {t('camps.noImage')}")
replace(training_path, '                          <p className="mt-3 text-sm text-gray-600">{camp.short_description}</p>', "                          <p className=\"mt-3 text-sm text-gray-600\">{isSerbianUi ? t('camps.genericShort', { city: camp.city_name, type: t(CAMP_TYPE_TRANSLATION_KEYS[camp.camp_type]).toLowerCase() }) : camp.short_description}</p>")
replace(training_path, "                            / rider", "                            / {t('camps.perRider')}")
replace(training_path, "                              {t('camps.bestFor')} {camp.best_for_text || t(CAMP_TYPE_TRANSLATION_KEYS[camp.camp_type])}", "                              {t('camps.bestFor')} {isSerbianUi ? t('camps.genericBestFor', { type: t(CAMP_TYPE_TRANSLATION_KEYS[camp.camp_type]).toLowerCase() }) : (camp.best_for_text || t(CAMP_TYPE_TRANSLATION_KEYS[camp.camp_type]))}")
replace(training_path, "                              {camp.metadata?.budget_tier ?? 'standard'}", "                              {t(`campTags.${camp.metadata?.budget_tier ?? 'standard'}`, { defaultValue: camp.metadata?.budget_tier ?? 'standard' })}")
replace(training_path, '                              {camp.terrain_profile}', "                              {t(`campTags.${camp.terrain_profile}`, { defaultValue: camp.terrain_profile })}")
replace(training_path, '                    Camp image placeholder', "                    {t('camps.imagePlaceholder')}")
replace(training_path, '                  <p className="text-sm text-gray-700">{selectedCamp.long_description}</p>', "                  <p className=\"text-sm text-gray-700\">{isSerbianUi ? t('camps.genericLong', { city: selectedCamp.city_name, type: t(CAMP_TYPE_TRANSLATION_KEYS[selectedCamp.camp_type]).toLowerCase() }) : selectedCamp.long_description}</p>")
replace(training_path, '                      <div className="mt-1 text-sm text-gray-700">{selectedCamp.best_for_text}</div>', "                      <div className=\"mt-1 text-sm text-gray-700\">{isSerbianUi ? t('camps.genericBestFor', { type: t(CAMP_TYPE_TRANSLATION_KEYS[selectedCamp.camp_type]).toLowerCase() }) : selectedCamp.best_for_text}</div>")
replace(training_path, '                      <div className="mt-1 text-sm text-gray-700">{selectedCamp.weather_note}</div>', "                      <div className=\"mt-1 text-sm text-gray-700\">{isSerbianUi ? t('camps.genericWeatherNote') : selectedCamp.weather_note}</div>")
replace(training_path, '                          Earliest start: {formatGameDateLabel(minimumBookableCampStartDate)}', "                          {t('camps.earliestStart', { date: formatGameDateLabel(minimumBookableCampStartDate) })}")
replace(training_path, '                          Season {currentGameDateParts.season_number}', "                          {t('camps.seasonLabel', { season: currentGameDateParts.season_number })}")
replace(training_path, '                            {option} days', "                            {t('camps.daysCount', { count: option })}")
replace(training_path, '<div className="font-medium">Check the camp dates before booking</div>', "<div className=\"font-medium\">{t('camps.checkDates')}</div>")
replace(training_path, '{TRAINING_CAMP_REFUND_NOTICE}', "{t('camps.refundNotice')}")
replace(training_path, "                            Selected period:{' '}", "                            {t('camps.selectedPeriodLabel')}:{' '}")
replace(training_path, '                      Training camp cannot start today or in the past.', "                      {t('camps.cannotStartPast')}")
replace(training_path, "? ` Earliest start is ${formatGameDateLabel(minimumBookableCampStartDate)}.`", "? ` ${t('camps.earliestStartSentence', { date: formatGameDateLabel(minimumBookableCampStartDate) })}`")
replace(training_path, '                  No camp matches the current filters.', "                  {t('camps.noMatches')}")
replace(training_path, '                              Unavailable for this date range: already in an overlapping camp.', "                              {t('camps.overlapRider')}")
replace(training_path, '                              Can attend camp, but will not train until recovered.', "                              {t('camps.injuredCanAttend')}")
regex_replace(training_path, r'Some riders are unavailable for the selected date range because they are already\s+assigned to an overlapping training camp\.', "{t('camps.overlapWarning')}")
replace(training_path, '                    Optional. Staff add camp boosts, but each selected staff member is charged like one rider.', "                    {t('camps.staffSelectionDescription')}")
replace(training_path, '                  Loading available staff…', "                  {t('camps.loadingStaff')}")
replace(training_path, '                  No eligible camp staff found. You can still book the camp without staff, but riders will not receive staff boosts.', "                  {t('camps.noEligibleStaff')}")
replace(training_path, "{member.staff_name || 'Unknown staff'}", "{member.staff_name || t('camps.unknownStaff')}")
replace(training_path, "                                  Scope: {member.team_scope.replaceAll('_', ' ')}", "                                  {t('camps.scope', { value: member.team_scope.replaceAll('_', ' ') })}")
replace(training_path, '                      No staff selected. The camp can still be booked, but there will be no coach, doctor, mechanic, or director boost.', "                      {t('camps.noStaffSelected')}")

# Quote/cancellation area.
for english, key in [
    ('Quote & Booking','camps.quoteTitle'), ('Calculating quote…','camps.calculatingQuote'),
    ('Charged participants','camps.chargedParticipants'), ('Per person','camps.perPerson'),
    ('Travel total','camps.travelTotal'), ('Accommodation','camps.accommodation'),
    ('Camp fee','camps.campFee'), ('Logistics','camps.logistics'),
    ('Total camp cost','camps.totalCampCost'), ('Booking blocked','camps.bookingBlocked'),
    ('Warnings','camps.warnings'), ('Important','camps.important'), ('Assigned Riders','camps.assignedRiders'),
]:
    replace(training_path, f'>{english}<', f">{{t('{key}')}}<")
replace(training_path, 'aria-label="Close cancel training camp modal"', "aria-label={t('camps.closeCancel')}")


# ---------------------------------------------------------------------------
# INFRASTRUCTURE — VEHICLES & EQUIPMENT / ASSETS
# ---------------------------------------------------------------------------
assets_path = 'src/pages/dashboard/infrastructure/AssetsSection.tsx'
replace_once(
    assets_path,
    "import React, { createContext, useContext, useMemo, useState } from 'react'",
    "import React, { createContext, useContext, useMemo, useState } from 'react'\nimport { useTranslation } from 'react-i18next'",
    required=True,
)

# Add hook to AssetAcquireModal.
regex_replace(
    assets_path,
    r"(function AssetAcquireModal\([\s\S]*?\}: \{[\s\S]*?onClose: \(\) => void\n\}\): JSX\.Element \{)\n  return \(",
    r"\1\n  const { t } = useTranslation('infrastructure')\n\n  return (",
    required=True,
)

replace(assets_path, '>Close</button>', ">{t('common.close')}</button>")
regex_replace(assets_path, r'Garage capacity is full\. Cancel a pending delivery, sell an available asset, or wait\s+for future capacity upgrades before starting another delivery\.', "{t('assets.garageFullDescription')}")
replace(assets_path, '              No acquisition tiers are configured for this asset type yet.', "              {t('assets.noTiers')}")
replace(assets_path, "                          Level {config.asset_level} · Support{' '}", "                          {t('common.level')} {config.asset_level} · {t('common.support')}{' '}")
for english, key in [('Cost','common.cost'),('Delivery','common.delivery'),('Owned','common.owned'),('Pending','common.pending')]:
    replace(assets_path, f'>{english}</div>', f">{{t('{key}')}}</div>")
replace(assets_path, "? 'Starting...'", "? t('common.starting')")
replace(assets_path, "? 'Garage full'", "? t('common.garageFull')")
replace(assets_path, ": 'Start delivery'", ": t('assets.startDelivery')")

# Add hook to TeamCarGaragePanel.
regex_replace(
    assets_path,
    r"(function TeamCarGaragePanel\([\s\S]*?onRenameTeamCar: \(carId: string, displayName: string\) => Promise<void>\n\}\): JSX\.Element \{)\n  const \[isAcquireModalOpen",
    r"\1\n  const { t } = useTranslation('infrastructure')\n  const [isAcquireModalOpen",
    required=True,
)

# Team Car bonus cards + header.
replace(assets_path, "title: 'Mechanical response'", "title: t('assets.mechanicalResponse')")
replace(assets_path, "'Best owned car support value available for race-day service and technical response.'", "t('assets.mechanicalResponseDescription')")
replace(assets_path, "title: 'Feeding support'", "title: t('assets.feedingSupport')")
replace(assets_path, "'Garage-level race fatigue reduction from the current Team Car fleet summary.'", "t('assets.feedingSupportDescription')")
replace(assets_path, "title: 'Tactical comms'", "title: t('assets.tacticalComms')")
replace(assets_path, "'Highest current support tier available from owned Team Cars and their condition.'", "t('assets.tacticalCommsDescription')")
replace_once(assets_path, "title: 'Potential tier'", "title: t('common.potentialTier')")
replace(assets_path, "'Highest configured Team Car tier that can be acquired through the garage system.'", "t('assets.teamCarPotential')")
replace(assets_path, '>Team Cars</div>', ">{t('assets.teamCars')}</div>")
replace(assets_path, '>Team Car Fleet</h3>', ">{t('assets.teamCarFleet')}</h3>")
regex_replace(assets_path, r'Team Cars provide race support, tactical communication, feeding coverage, and fatigue\s+reduction on race days\. Manage the garage by slot, start new deliveries, repair worn\s+cars, or sell available cars\.', "{t('assets.teamCarDescription')}")
replace(assets_path, "{isFull ? 'Garage full' : 'Acquire Team Car'}", "{isFull ? t('common.garageFull') : t('assets.acquireTeamCar')}")
replace_once(assets_path, 'label="Garage size"', "label={t('common.garageSize')}")
replace_once(assets_path, 'label="Available"', "label={t('common.available')}")
replace_once(assets_path, 'label="Assigned"', "label={t('common.assigned')}")
replace_once(assets_path, 'label="In repair"', "label={t('common.inRepair')}")
replace_once(assets_path, 'label="Best support"', "label={t('common.bestSupport')}")
replace_once(assets_path, 'label="Potential tier"', "label={t('common.potentialTier')}")
replace_once(assets_path, '          Garage support vs actual race assignment', "          {t('assets.garageSupportTitle')}")
regex_replace(assets_path, r'The garage shows what your club owns and what is being delivered\. Actual race bonuses\s+should still come from the cars assigned to a specific event\. A strong garage increases\s+your available options, but only assigned and eligible cars should affect a race result\.', "{t('assets.teamCarAssignment')}")
replace_once(assets_path, '>Garage slots</div>', ">{t('common.garageSlots')}</div>")
regex_replace(assets_path, r'Owned cars appear first, pending deliveries fill the next empty slots, and open slots\s+remain available for future acquisitions\.', "{t('assets.garageSlotsTeamCar')}")
replace_once(assets_path, '            {effectiveSlots} active of {absoluteMaxSlots} maximum slots', "            {t('assets.activeMaximum', { active: effectiveSlots, max: absoluteMaxSlots })}")
replace(assets_path, '                          Slot #{slot.slotNumber}', "                          {t('assets.slot', { slot: slot.slotNumber })}")

# Common row labels shown inside Team Car and Generic garages will all have a local t hook after generic patch.
for english, key in [
    ('Condition','common.condition'), ('Support','common.support'), ('Acquired','common.acquired'),
    ('Current status','common.currentStatus'), ('Duration','common.duration'), ('Completes','common.completes'),
    ('Cost paid','common.costPaid'), ('Quantity','common.quantity'),
]:
    replace(assets_path, f'>{english}</div>', f">{{t('{key}')}}</div>")
replace(assets_path, '>Repair</button>', ">{t('common.repair')}</button>")
replace(assets_path, '>Sell</button>', ">{t('common.sell')}</button>")
replace(assets_path, '>Pending delivery</span>', ">{t('common.pendingDelivery')}</span>")
replace(assets_path, '>Cancel delivery</button>', ">{t('assets.cancelDelivery')}</button>")
replace(assets_path, 'title="Acquire Team Car"', "title={t('assets.acquireTeamCar')}")
replace(assets_path, 'description="Choose a Team Car tier. The delivery will enter the garage queue and complete after the configured game-time duration."', "description={t('assets.teamCarAcquireDescription')}")
replace(assets_path, 'assetLabel="Team Cars"', "assetLabel={t('assets.teamCars')}")

# Add translation hook + stable asset copy map to GenericAssetGaragePanel.
regex_replace(
    assets_path,
    r"(function GenericAssetGaragePanel<T extends GenericAssetRosterRow>\([\s\S]*?onRenameAsset: \(assetKey: AssetGarageKey, assetId: string, displayName: string\) => Promise<void>\n\}\): JSX\.Element \{)\n  const \[isAcquireModalOpen",
    r"\1\n  const { t } = useTranslation('infrastructure')\n  const assetCopy = {\n    team_car: { singular: 'assets.teamCar', plural: 'assets.teamCars', title: 'assets.teamCarFleet', description: 'assets.teamCarDescription', acquire: 'assets.acquireTeamCar', acquireDescription: 'assets.teamCarAcquireDescription', empty: 'assets.emptyTeamCar', assignment: 'assets.teamCarAssignment' },\n    team_bus: { singular: 'assets.teamBus', plural: 'assets.teamBus', title: 'assets.teamBusGarage', description: 'assets.teamBusDescription', acquire: 'assets.acquireTeamBus', acquireDescription: 'assets.teamBusAcquireDescription', empty: 'assets.emptyTeamBus', assignment: 'assets.teamBusAssignment' },\n    equipment_van: { singular: 'assets.equipmentVan', plural: 'assets.equipmentVans', title: 'assets.equipmentVanGarage', description: 'assets.equipmentVanDescription', acquire: 'assets.acquireEquipmentVan', acquireDescription: 'assets.equipmentVanAcquireDescription', empty: 'assets.emptyEquipmentVan', assignment: 'assets.equipmentVanAssignment' },\n    mobile_workshop: { singular: 'assets.mobileWorkshop', plural: 'assets.mobileWorkshops', title: 'assets.mobileWorkshopGarage', description: 'assets.mobileWorkshopDescription', acquire: 'assets.acquireMobileWorkshop', acquireDescription: 'assets.mobileWorkshopAcquireDescription', empty: 'assets.emptyMobileWorkshop', assignment: 'assets.mobileWorkshopAssignment' },\n    medical_van: { singular: 'assets.medicalVan', plural: 'assets.medicalVans', title: 'assets.medicalVanGarage', description: 'assets.medicalVanDescription', acquire: 'assets.acquireMedicalVan', acquireDescription: 'assets.medicalVanAcquireDescription', empty: 'assets.emptyMedicalVan', assignment: 'assets.medicalVanAssignment' },\n  }[assetKey]\n  const [isAcquireModalOpen",
    required=True,
)

replace(assets_path, '>{assetLabelPlural}</div>', '>{t(assetCopy.plural)}</div>')
replace(assets_path, '>{title}</h3>', '>{t(assetCopy.title)}</h3>')
replace(assets_path, '>{description}</p>', '>{t(assetCopy.description)}</p>')
replace(assets_path, "{isFull ? 'Garage full' : acquireButtonLabel}", "{isFull ? t('common.garageFull') : t(assetCopy.acquire)}")
replace(assets_path, "? `Free ${slotAccess.free_slots} · Premium ${slotAccess.premium_slots} · Max ${absoluteMaxSlots}`", "? t('assets.freePremiumMax', { free: slotAccess.free_slots, premium: slotAccess.premium_slots, max: absoluteMaxSlots })")
replace(assets_path, ": `Owned ${totalAssets} · Pending ${pendingQuantity}`", ": t('assets.ownedPending', { owned: totalAssets, pending: pendingQuantity })")
replace(assets_path, 'label="Garage size"', "label={t('common.garageSize')}")
replace(assets_path, 'label="Available"', "label={t('common.available')}")
replace(assets_path, 'label="Assigned"', "label={t('common.assigned')}")
replace(assets_path, 'label="In repair"', "label={t('common.inRepair')}")
replace(assets_path, 'label="Best support"', "label={t('common.bestSupport')}")
replace(assets_path, 'label="Potential tier"', "label={t('common.potentialTier')}")
replace(assets_path, '          Garage support vs actual race assignment', "          {t('assets.garageSupportTitle')}")
replace(assets_path, '<p className="mt-1 text-xs leading-5 text-blue-800">{assignmentNotice}</p>', '<p className="mt-1 text-xs leading-5 text-blue-800">{t(assetCopy.assignment)}</p>')
replace(assets_path, '>Garage slots</div>', ">{t('common.garageSlots')}</div>")
regex_replace(assets_path, r'Owned assets appear first, pending deliveries fill the next empty slots, and open\s+slots remain available for future acquisitions\.', "{t('assets.garageSlotsGeneric')}")
replace(assets_path, "            {garageSlots.length} slot{garageSlots.length === 1 ? '' : 's'}", "            {t(garageSlots.length === 1 ? 'assets.slotOne' : 'assets.slots', { count: garageSlots.length })}")
replace(assets_path, '                        Pending delivery', "                        {t('common.pendingDelivery')}")
replace(assets_path, '                        Delivery item {slot.copyIndex} of {slot.quantity}', "                        {t('assets.deliveryItem', { current: slot.copyIndex, total: slot.quantity })}")
replace(assets_path, '{emptySlotDescription}', '{t(assetCopy.empty)}')
replace(assets_path, '          title={acquireModalTitle}', '          title={t(assetCopy.acquire)}')
replace(assets_path, '          description={acquireModalDescription}', '          description={t(assetCopy.acquireDescription)}')
replace(assets_path, '          assetLabel={assetLabelPlural}', '          assetLabel={t(assetCopy.plural)}')

# Generic bonus cards: existing props are English. Map known labels/descriptions to existing resource keys at render construction.
replace(assets_path, "title: 'Potential tier'", "title: t('common.potentialTier')")

# Exported AssetsSection owns the top sub-tab labels.
regex_replace(
    assets_path,
    r"(export default function AssetsSection\([\s\S]*?\}\): JSX\.Element \{)\n  return \(",
    r"\1\n  const { t } = useTranslation('infrastructure')\n\n  return (",
    required=True,
)
replace(
    assets_path,
    '{tab.label}',
    "{t(tab.key === 'team_cars' ? 'assets.teamCars' : tab.key === 'team_bus' ? 'assets.teamBus' : tab.key === 'equipment_van' ? 'assets.equipmentVan' : tab.key === 'mobile_workshop' ? 'assets.mobileWorkshop' : 'assets.medicalVan')}",
)

print('Pass B localization changes prepared.')
