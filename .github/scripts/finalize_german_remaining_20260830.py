from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / 'src/i18n/locales'

# Residual German strings identified by the full English/German semantic audit.
DE_PATCHES: dict[str, dict[str, str]] = {
    'appShell.json': {
        'restartWelcome.subtitle': 'Ihr Club hat einen Neustart erhalten.',
    },
    'club.json': {
        'common.unknownRace': 'Unbekanntes Rennen',
        'common.scout': 'Scout',
        'dashboardAccess.welcomeSubtitle': 'Ihr Club hat einen Neustart erhalten.',
        'history.allSeasons': 'Alle Saisons',
    },
    'finance.json': {
        'common.missed': 'Verpasst',
        'transactionLabels.signingBonus': 'Unterschriftsbonus',
        'transactionLabels.trainingCamp': 'Trainingslager',
        'transactionLabels.principal': 'Tilgung',
        'policyCostTypes.seasonal': 'Saisonal',
        'overview.hoverBar': 'Bewegen Sie den Mauszeiger über einen Balken, um Details anzuzeigen.',
        'sponsors.missed': 'Verpasst',
    },
    'help.json': {
        'faq.q5': 'Warum werden bei angenommenen Rennen unterschiedliche Statusstufen angezeigt?',
        'footer.title': 'Benötigen Sie weitere Hilfe?',
    },
    'manual.json': {
        'sections.staff.facts[0].value': 'Trainer, Cheftrainer, U23-Cheftrainer, Teamarzt, Physiotherapeut, Ernährungsberater, Mechaniker, Sportdirektor, Scout / Analyst',
        'sections.calendar-race-detail.facts[2].label': 'Rennstatus',
        'sections.race-preparation.subtitle': 'Angenommene Rennen, Race Plan, Stage Plans und Bereitschaft.',
        'sections.race-preparation.facts[0].value': 'Angenommene Rennen, Race Plan, Stage Plans',
        'sections.transfers-scouting.facts[4].label': 'Scout',
        'sections.overview-race-world.details[3]': 'Verwandte Links können Rennen oder andere Spielseiten öffnen.',
        'sections.staff-roles-deep.facts[2].value': 'Mechaniker, Scout / Analyst, U23-Cheftrainer',
        'sections.assets-deep.facts[2].label': 'Renneinsatz',
        'sections.race-calendar-deep.facts[1].label': 'Renndaten',
        'sections.stage-roles-deep.details[5]': 'Rollen sollten auch Ermüdung, Moral, Gesundheit und Race Sharpness berücksichtigen, nicht nur die reinen Fähigkeiten.',
        'sections.faq-rider-underperformed.details[4]': 'Niedrige Moral oder geringe Race Sharpness können einen normalerweise starken Fahrer weniger effektiv machen.',
        'sections.faq-equipment.facts[2].label': 'Renneinsatz',
    },
    'manualCore.json': {
        'sections.staff.facts[1]': 'Trainer, Cheftrainer, U23-Cheftrainer, Teamarzt, Physiotherapeut, Ernährungsberater, Mechaniker, Sportdirektor, Scout / Analyst',
        'sections.calendarRaceDetail.facts[4]': 'Rennstatus',
        'sections.racePreparation.subtitle': 'Angenommene Rennen, Race Plan, Stage Plans und Bereitschaft.',
        'sections.racePreparation.facts[1]': 'Angenommene Rennen, Race Plan, Stage Plans',
        'sections.transfersScouting.facts[8]': 'Scout',
    },
    'manualDeepA.json': {
        'sections.overviewRaceWorld.details[3]': 'Verwandte Links können Rennen oder andere Spielseiten öffnen.',
        'sections.staffRolesDeep.facts[1]': 'Trainer, Cheftrainer, U23-Cheftrainer, Teamarzt, Physiotherapeut, Ernährungsberater, Mechaniker, Sportdirektor, Scout / Analyst',
        'sections.staffRolesDeep.details[6]': 'Der Scout / Analyst unterstützt Marktinformationen und Scouting-Berichte.',
        'sections.trainingCampsDeep.title': 'Trainingslager',
    },
    'manualDeepB2.json': {
        'sections.transferListDeep.tips[0]': 'Prüfen Sie das Gehalt, bevor Sie ein großes Transferangebot abgeben.',
        'sections.freeAgentsDeep.facts[1]': 'Gehalt, Laufzeit, Unterschriftsbonus, Agentengebühr und Stufenanpassung',
        'sections.scoutingDeep.tips[0]': 'Scouten Sie Fahrer vor teuren Verpflichtungen.',
    },
    'manualFaq.json': {
        'sections.riderUnderperformed.details[2]': 'Prüfen Sie Moral und Race Sharpness.',
    },
    'notifications.json': {
        'roles.scout': 'Scout',
        'roles.scoutAnalyst': 'Scout / Analyst',
        'scout.recommendations': 'Scout-Empfehlungen',
        'templateWords.SCOUT': 'Scout',
        'templateWords.MISSED': 'Verpasst',
    },
    'publicInfo.json': {
        'about.title': 'Bauen Sie Ihr Radsport-Vermächtnis auf.',
        'about.developmentText': 'Die Spielsysteme, Balance, Rennsimulation, Benutzeroberfläche, Benachrichtigungen und Wirtschaftswerte von ProPeloton Manager können sich während der Entwicklung weiter verändern. Ziel ist ein tiefgehendes Radsport-Manager-Erlebnis, das über viele Saisons hinweg fair, verständlich und nachhaltig bleibt.',
        'privacy.heroTitle': 'Ihre Privatsphäre ist wichtig.',
    },
    'riderProfile.json': {
        'simpleProfile.markScouted': 'Als gescoutet markieren',
        'external.scoutingTarget': 'Scouting-Ziel',
        'external.unknownRace': 'Unbekanntes Rennen',
        'external.scoutRider': 'Fahrer scouten',
        'external.scoutRiderAgain': 'Fahrer erneut scouten',
        'external.loadingScouts': 'Scouts werden geladen...',
        'scouting.chooseScout': 'Bitte wählen Sie einen Scout.',
        'scouting.chooseTitle': 'Scout auswählen',
        'scouting.activeCourse': 'Dieser Scout nimmt bereits an einem aktiven Lehrgang teil.',
        'scouting.noneAvailable': 'Für diesen Fahrer ist kein Scout verfügbar.',
        'scouting.selectScout': 'Scout auswählen',
        'scouting.chooseOption': 'Wählen Sie einen Scout...',
        'market.primaryClubUnavailable': 'Ihr Hauptclub ist nicht verfügbar.',
        'owned.latest10Seasons': 'Letzte 10 Saisons',
        'ownedAnalysis.racesUsed': 'Verwendete Rennen',
        'ownedAnalysis.fromLoadedRaces': 'Aus geladenen Rennen',
        'ownedAnalysis.racesUsedNote': '{{count}} ausgewertete Rennen',
        'ownedRenewal.twoSeasons': '2 Saisons',
        'ownedRenewal.extendedMany': 'Vertrag ab {{date}} um {{count}} Saisons verlängert.',
    },
    'scouting.json': {
        'report.scout': 'Scout',
    },
    'sharedRiderModal.json': {
        'common.markScouted': 'Als gescoutet markieren',
    },
    'staff.json': {
        'courseOptions.u23_race_readiness_course.title': 'U23-Rennbereitschaft',
        'courseOptions.scout_networking.title': 'Scout-Networking',
    },
    'statistics.json': {
        'filters.allSeasons': 'Alle Saisons',
        'teams.noHistoryDescription': 'Ihre Spielwelt befindet sich derzeit in Saison 1, daher gibt es noch keine abgeschlossenen historischen Saisons.',
        'tutorial.teamsHistoryBody': 'Der Bereich Verlauf zeigt frühere Saisons. Dort sehen Sie vergangene Sieger, Saison-Snapshots, historische Platzierungen und die Entwicklung der Teams in früheren Saisons. Dieser Bereich wird mit jeder weiteren Saison Ihrer Spielwelt aussagekräftiger.',
    },
    'teamRanking.json': {
        'table.raceReputation': 'Rennreputation',
    },
    'transfers.json': {
        'common.seasons': '{{count}} Saisons',
        'activity.rejectedByYou': 'Von Ihnen abgelehnt',
        'staffRoles.scoutAnalyst': 'Scout / Analyst',
        'negotiation.signingBonus': 'Unterschriftsbonus',
    },
    'tutorials.json': {
        'training.camps.title': 'Trainingslager',
        'racePreparation.acceptedRaces.title': 'Angenommene Rennen',
        'statistics.teamsHistory.body': 'Der Bereich Verlauf zeigt frühere Saisons. Dort sehen Sie vergangene Sieger, Saison-Snapshots, historische Platzierungen und die Entwicklung der Teams in früheren Saisons. Dieser Bereich wird mit jeder weiteren Saison Ihrer Spielwelt aussagekräftiger.',
    },
    'infrastructure.json': {
        'assetModal.levelAsset': 'Stufe {{level}} · {{asset}}',
    },
}

TOKEN_RX = re.compile(r'([^\.\[\]]+)|\[(\d+)\]')


def path_tokens(path: str) -> list[str | int]:
    return [int(m.group(2)) if m.group(2) is not None else m.group(1) for m in TOKEN_RX.finditer(path)]


def set_path(data: object, path: str, value: str) -> None:
    tokens = path_tokens(path)
    if not tokens:
        raise RuntimeError(f'Invalid path: {path}')
    current = data
    for token in tokens[:-1]:
        if isinstance(token, int):
            if not isinstance(current, list) or token >= len(current):
                raise RuntimeError(f'Invalid list path: {path}')
            current = current[token]
        else:
            if not isinstance(current, dict) or token not in current:
                raise RuntimeError(f'Invalid key path: {path}')
            current = current[token]
    last = tokens[-1]
    if isinstance(last, int):
        if not isinstance(current, list) or last >= len(current):
            raise RuntimeError(f'Invalid terminal list path: {path}')
        current[last] = value
    else:
        if not isinstance(current, dict) or last not in current:
            raise RuntimeError(f'Invalid terminal key path: {path}')
        current[last] = value


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


for filename, edits in DE_PATCHES.items():
    path = LOCALES / 'de' / filename
    data = load_json(path)
    for dotted, value in edits.items():
        set_path(data, dotted, value)
    save_json(path, data)

# Add missing translatable Kit Designer strings to all supported languages.
KIT_DESIGNER = {
    'en': {
        'tableNotReady': 'Team kits are not ready yet. You can still preview the kit and try saving it.',
        'saved': 'Kit saved.',
        'saveFailed': 'The kit could not be saved.',
        'name': 'Kit name',
        'namePlaceholder': 'Home',
        'pattern': 'Pattern',
        'solid': 'Solid',
        'stripes': 'Stripes',
        'hoops': 'Hoops',
        'sash': 'Sash',
        'primary': 'Primary',
        'secondary': 'Secondary',
        'sleeves': 'Sleeves',
        'collar': 'Collar',
        'trim': 'Trim',
        'numberColor': 'Number',
        'sponsorText': 'Sponsor text',
        'defaultSponsor': 'YOUR CLUB',
        'shirtNumber': 'Shirt number',
        'saving': 'Saving…',
        'loading': 'Loading…',
        'save': 'Save kit',
        'livePreview': 'Live preview',
        'previewDescription': 'How your kit will appear in-game',
        'nameValue': 'Name: {{name}}',
        'previewAria': 'Team jersey preview',
    },
    'sr-Latn': {
        'tableNotReady': 'Dresovi tima još nisu spremni. I dalje možete pregledati dres i pokušati da ga sačuvate.',
        'saved': 'Dres je sačuvan.',
        'saveFailed': 'Dres nije mogao da se sačuva.',
        'name': 'Naziv dresa',
        'namePlaceholder': 'Domaći',
        'pattern': 'Šara',
        'solid': 'Jednobojno',
        'stripes': 'Vertikalne pruge',
        'hoops': 'Horizontalne pruge',
        'sash': 'Dijagonalna traka',
        'primary': 'Primarna',
        'secondary': 'Sekundarna',
        'sleeves': 'Rukavi',
        'collar': 'Kragnа',
        'trim': 'Detalji',
        'numberColor': 'Broj',
        'sponsorText': 'Tekst sponzora',
        'defaultSponsor': 'VAŠ KLUB',
        'shirtNumber': 'Broj na dresu',
        'saving': 'Čuvanje…',
        'loading': 'Učitavanje…',
        'save': 'Sačuvaj dres',
        'livePreview': 'Pregled uživo',
        'previewDescription': 'Ovako će vaš dres izgledati u igri',
        'nameValue': 'Naziv: {{name}}',
        'previewAria': 'Pregled dresa tima',
    },
    'de': {
        'tableNotReady': 'Die Teamtrikots sind noch nicht verfügbar. Sie können das Trikot trotzdem ansehen und versuchen, es zu speichern.',
        'saved': 'Trikot gespeichert.',
        'saveFailed': 'Das Trikot konnte nicht gespeichert werden.',
        'name': 'Trikotname',
        'namePlaceholder': 'Heim',
        'pattern': 'Muster',
        'solid': 'Einfarbig',
        'stripes': 'Längsstreifen',
        'hoops': 'Querstreifen',
        'sash': 'Diagonaler Balken',
        'primary': 'Primärfarbe',
        'secondary': 'Sekundärfarbe',
        'sleeves': 'Ärmel',
        'collar': 'Kragen',
        'trim': 'Besatz',
        'numberColor': 'Nummer',
        'sponsorText': 'Sponsorentext',
        'defaultSponsor': 'IHR CLUB',
        'shirtNumber': 'Trikotnummer',
        'saving': 'Wird gespeichert…',
        'loading': 'Wird geladen…',
        'save': 'Trikot speichern',
        'livePreview': 'Live-Vorschau',
        'previewDescription': 'So wird Ihr Trikot im Spiel angezeigt',
        'nameValue': 'Name: {{name}}',
        'previewAria': 'Vorschau des Teamtrikots',
    },
}

for language, values in KIT_DESIGNER.items():
    path = LOCALES / language / 'customizeTeam.json'
    data = load_json(path)
    data['kitDesigner'] = values
    save_json(path, data)

# Add the Developing Team lock tooltip to all supported languages.
DEV_UNLOCK = {
    'en': 'Unlock Developing Team in Preferences first.',
    'sr-Latn': 'Prvo omogućite razvojni tim u Podešavanjima.',
    'de': 'Aktivieren Sie zuerst das Entwicklungsteam in den Einstellungen.',
}
for language, value in DEV_UNLOCK.items():
    path = LOCALES / language / 'developingTeam.json'
    data = load_json(path)
    data['page']['unlockInPreferences'] = value
    save_json(path, data)


def patch_text(path: Path, replacements: list[tuple[str, str]]) -> None:
    text = path.read_text(encoding='utf-8')
    for old, new in replacements:
        if old not in text:
            if new in text:
                continue
            raise RuntimeError(f'Missing source anchor in {path}: {old[:100]!r}')
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')


# Inactivity warning already has appShell translation keys; wire the component to them.
main_layout = ROOT / 'src/components/layout/MainLayout.tsx'
patch_text(main_layout, [
    ("import { Outlet, useNavigate, useLocation } from 'react-router'\n", "import { Outlet, useNavigate, useLocation } from 'react-router'\nimport { useTranslation } from 'react-i18next'\n"),
    ("export default function MainLayout({ children }: MainLayoutProps) {\n  const [collapsed, setCollapsed] = useState(false)\n", "export default function MainLayout({ children }: MainLayoutProps) {\n  const { t } = useTranslation('appShell')\n  const [collapsed, setCollapsed] = useState(false)\n"),
    ("                You will be logged out soon\n", "                {t('inactivity.title')}\n"),
    ("                Your game has been inactive for almost 30 minutes.\n                You will be logged out automatically in approximately\n                one minute.\n", "                {t('inactivity.body')}\n"),
    ("            Stay logged in\n", "            {t('inactivity.stay')}\n"),
])

# Restart modal already has a complete appShell.restartModal resource; wire every visible string.
restart_modal = ROOT / 'src/components/team/RestartTeamModal.tsx'
patch_text(restart_modal, [
    ("import { useNavigate } from 'react-router'\n", "import { useNavigate } from 'react-router'\nimport { useTranslation } from 'react-i18next'\n"),
    ("  const navigate = useNavigate()\n\n  const [confirmText", "  const navigate = useNavigate()\n  const { t } = useTranslation('appShell')\n\n  const [confirmText"),
    ("      setError('You must type RESTART exactly to confirm this action.')", "      setError(t('restartModal.confirmExact'))"),
    ("        setError(rpcError.message || 'Failed to restart team.')", "        console.error('Failed to restart team', rpcError)\n        setError(t('restartModal.failed'))"),
    ("      setError(e?.message ?? 'Failed to restart team due to an unexpected error.')", "      console.error('Unexpected restart team error', e)\n      setError(t('restartModal.unexpected'))"),
    ('aria-label="Close restart team confirmation"', "aria-label={t('restartModal.close')}"),
    ("                Confirm Team Restart\n", "                {t('restartModal.title')}\n"),
    ("                This will reset your club back to a fresh starter state.\n", "                {t('restartModal.subtitle')}\n"),
    ("              Restart Team keeps your club identity and competition slot, but it resets the sporting\n              and gameplay state of the team.\n", "              {t('restartModal.intro')}\n"),
    ("<div className=\"font-semibold text-gray-900\">You will keep</div>", "<div className=\"font-semibold text-gray-900\">{t('restartModal.keep')}</div>"),
    ('<li>User account and coins</li>', "<li>{t('restartModal.keepAccount')}</li>"),
    ('<li>Club ID</li>', "<li>{t('restartModal.keepClubId')}</li>"),
    ('<li>Club name</li>', "<li>{t('restartModal.keepName')}</li>"),
    ('<li>Logo and badge</li>', "<li>{t('restartModal.keepLogo')}</li>"),
    ('<li>Jersey</li>', "<li>{t('restartModal.keepJersey')}</li>"),
    ('<li>Country</li>', "<li>{t('restartModal.keepCountry')}</li>"),
    ('<li>Current tier/division/competition slot</li>', "<li>{t('restartModal.keepCompetition')}</li>"),
    ("<div className=\"font-semibold text-gray-900\">You will lose/reset</div>", "<div className=\"font-semibold text-gray-900\">{t('restartModal.lose')}</div>"),
    ('<li>All current season points</li>', "<li>{t('restartModal.losePoints')}</li>"),
    ('<li>Current ranking/standings position</li>', "<li>{t('restartModal.loseRanking')}</li>"),
    ('<li>Current riders, who become free agents</li>', "<li>{t('restartModal.loseRiders')}</li>"),
    ('<li>Staff</li>', "<li>{t('restartModal.loseStaff')}</li>"),
    ('<li>Sponsors and naming-rights sponsor</li>', "<li>{t('restartModal.loseSponsors')}</li>"),
    ('<li>Equipment progress, assets, and supplies</li>', "<li>{t('restartModal.loseEquipment')}</li>"),
    ('<li>Infrastructure upgrades</li>', "<li>{t('restartModal.loseInfrastructure')}</li>"),
    ('<li>Training, scouting, transfer, and race-preparation state</li>', "<li>{t('restartModal.loseGameplay')}</li>"),
    ('<li>Notifications and visible history</li>', "<li>{t('restartModal.loseNotifications')}</li>"),
    ('<li>Liquidation/insolvency status</li>', "<li>{t('restartModal.loseLiquidation')}</li>"),
    ("              After restart, your team receives a new starter squad based on its current competition\n              tier, starter equipment, starter infrastructure, and zero season points.\n", "              {t('restartModal.after')}\n"),
    ("            Type <span className=\"font-semibold text-amber-700\">RESTART</span> to confirm\n", "            {t('restartModal.typeConfirm')}\n"),
    ("            Cancel\n", "            {t('restartModal.cancel')}\n"),
    ("            {isRestarting ? 'Restarting...' : 'Restart Team'}\n", "            {isRestarting ? t('restartModal.restarting') : t('restartModal.restart')}\n"),
])

# Kit Designer: add namespace wiring and remove all user-facing hardcoded copy.
kit = ROOT / 'src/components/ui/KitDesigner.tsx'
patch_text(kit, [
    ("import React, { useEffect, useMemo, useState } from 'react'\n", "import React, { useEffect, useMemo, useState } from 'react'\nimport { useTranslation } from 'react-i18next'\n"),
    ("const makeDefaultConfig = (primary: string, secondary: string): JerseyConfig => ({", "const makeDefaultConfig = (primary: string, secondary: string, sponsorText: string): JerseyConfig => ({"),
    ("  sponsorText: 'YOUR CLUB',", "  sponsorText,"),
    ("}): JSX.Element {\n  const [name, setName] = useState('Home')", "}): JSX.Element {\n  const { t } = useTranslation('customizeTeam')\n  const [name, setName] = useState('Home')"),
    ("    makeDefaultConfig(primaryColor, secondaryColor),", "    makeDefaultConfig(primaryColor, secondaryColor, t('kitDesigner.defaultSponsor')),"),
    ("        setMessage('Team kits table not ready yet. You can still preview and try saving.')", "        setMessage(t('kitDesigner.tableNotReady'))"),
    ("  }, [supabase, teamId])", "  }, [supabase, teamId, t])"),
    ("    setSaving(false)\n    setMessage(error ? error.message : 'Kit saved.')", "    setSaving(false)\n    if (error) {\n      console.error('Failed to save kit', error)\n      setMessage(t('kitDesigner.saveFailed'))\n    } else {\n      setMessage(t('kitDesigner.saved'))\n    }"),
    ('>Kit name</label>', ">{t('kitDesigner.name')}</label>"),
    ('placeholder="Home"', "placeholder={t('kitDesigner.namePlaceholder')}"),
    ('>Pattern</label>', ">{t('kitDesigner.pattern')}</label>"),
    ('<option value="solid">Solid</option>', "<option value=\"solid\">{t('kitDesigner.solid')}</option>"),
    ('<option value="stripes">Stripes</option>', "<option value=\"stripes\">{t('kitDesigner.stripes')}</option>"),
    ('<option value="hoops">Hoops</option>', "<option value=\"hoops\">{t('kitDesigner.hoops')}</option>"),
    ('<option value="sash">Sash</option>', "<option value=\"sash\">{t('kitDesigner.sash')}</option>"),
    ("            Primary\n", "            {t('kitDesigner.primary')}\n"),
    ("            Secondary\n", "            {t('kitDesigner.secondary')}\n"),
    ("            Sleeves\n", "            {t('kitDesigner.sleeves')}\n"),
    ("            Collar\n", "            {t('kitDesigner.collar')}\n"),
    ("            Trim\n", "            {t('kitDesigner.trim')}\n"),
    ("            Number\n", "            {t('kitDesigner.numberColor')}\n"),
    ('>Sponsor text</label>', ">{t('kitDesigner.sponsorText')}</label>"),
    ('placeholder="YOUR CLUB"', "placeholder={t('kitDesigner.defaultSponsor')}"),
    ('>Shirt number</label>', ">{t('kitDesigner.shirtNumber')}</label>"),
    ("          {saving ? 'Saving…' : loading ? 'Loading…' : 'Save kit'}", "          {saving ? t('kitDesigner.saving') : loading ? t('kitDesigner.loading') : t('kitDesigner.save')}"),
    ('<div className="text-sm font-medium text-slate-700">Live preview</div>', "<div className=\"text-sm font-medium text-slate-700\">{t('kitDesigner.livePreview')}</div>"),
    ('<div className="text-xs text-slate-500">How your kit will appear in-game</div>', "<div className=\"text-xs text-slate-500\">{t('kitDesigner.previewDescription')}</div>"),
    ('<div className="text-xs text-slate-400">Name: {name}</div>', "<div className=\"text-xs text-slate-400\">{t('kitDesigner.nameValue', { name })}</div>"),
])

# JerseyPreview accessibility label is user-facing for assistive technology.
jersey = ROOT / 'src/components/ui/JerseyPreview.tsx'
patch_text(jersey, [
    ("import React, { useId } from 'react'\n", "import React, { useId } from 'react'\nimport { useTranslation } from 'react-i18next'\n"),
    ("export function JerseyPreview({ config, className = '' }: JerseyPreviewProps): JSX.Element {\n  const idBase", "export function JerseyPreview({ config, className = '' }: JerseyPreviewProps): JSX.Element {\n  const { t } = useTranslation('customizeTeam')\n  const idBase"),
    ('aria-label="Team jersey preview"', "aria-label={t('kitDesigner.previewAria')}"),
])

# Developing Team already uses the developingTeam namespace.
dev = ROOT / 'src/pages/dashboard/DevelopingTeam.tsx'
text = dev.read_text(encoding='utf-8')
if 'title="Unlock Developing Team in Preferences first."' in text:
    text = text.replace('title="Unlock Developing Team in Preferences first."', "title={t('page.unlockInPreferences')}", 1)
elif "title={t('page.unlockInPreferences')}" not in text:
    raise RuntimeError('Developing Team tooltip anchor not found')
dev.write_text(text, encoding='utf-8')

print('Final German residual locale and source fixes prepared.')
