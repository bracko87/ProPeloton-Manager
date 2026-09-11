from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('.')
changed: set[str] = set()


def replace_text(path_s: str, old: str, new: str) -> None:
    path = ROOT / path_s
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count < 1:
        raise RuntimeError(f'{path_s}: expected source text not found: {old[:120]!r}')
    path.write_text(text.replace(old, new), encoding='utf-8')
    changed.add(path_s)
    print(f'{path_s}: replaced {count} occurrence(s)')


# Race Preparation / Stage Plans: jersey shortage is a penalty, never a blocker.
rp = 'src/pages/dashboard/RacePreparation.tsx'
replace_text(
    rp,
    '    mandatory: true,\n    durabilityText:\n      "Mandatory durable kit. One jersey kit is needed per rider and each kit has 10 stage uses.",',
    '    mandatory: false,\n    durabilityText:\n      "Recommended durable kit. Ideally one usable jersey kit is available per rider; each kit has 10 stage uses.",',
)
replace_text(
    rp,
    '    negativeEffects: ["Missing jersey kit: blocks stage setup"],',
    '    negativeEffects: [\n      "Missing jersey kits do not block participation; the team races with a proportional performance penalty",\n      "At a full jersey shortage: -30% positive preparation bonuses, +8% in-stage energy use and +15% post-stage fatigue",\n    ],',
)
replace_text(
    rp,
    '            rider; Race Jersey Kit is mandatory and Rain Jackets are a team-wide\n            yes/no choice.',
    '            rider; Race Jersey Kits are strongly recommended but a shortage does\n            not block participation. Rain Jackets are a team-wide yes/no choice.',
)
replace_text(
    rp,
    '            disabled={saveDisabled || jerseyMissing || suppliesDisabledForTT}',
    '            disabled={saveDisabled || suppliesDisabledForTT}',
)
replace_text(
    rp,
    '        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">\n          Race Jersey Kit is mandatory. You need{" "}\n          {displayNeeds.race_jersey_complete}, but only {jerseyAvailable} are\n          available. This blocks saving/starting the stage.\n        </div>',
    '        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">\n          Race Jersey shortage: you need{" "}\n          {displayNeeds.race_jersey_complete}, but only {jerseyAvailable} are\n          available. The team can still save the plan and race. Riders without a\n          usable kit compete in normal team clothing. The performance penalty\n          scales with the shortage; a full shortage means -30% positive\n          preparation bonuses, +8% in-stage energy use and +15% post-stage\n          fatigue.\n        </div>',
)
replace_text(
    rp,
    '              jerseyMissing ? "border-red-200" : "border-slate-200",',
    '              jerseyMissing ? "border-amber-200" : "border-slate-200",',
)
replace_text(
    rp,
    '                  Mandatory for all selected riders. Missing jersey kits block\n                  the stage setup.',
    '                  Strongly recommended for all selected riders. A shortage does not\n                  block the stage; riders without a kit race with the team penalty.',
)
replace_text(
    rp,
    '                  jerseyMissing\n                    ? "bg-red-100 text-red-700"',
    '                  jerseyMissing\n                    ? "bg-amber-100 text-amber-800"',
)
replace_text(
    rp,
    '            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">\n              Missing mandatory Race Jersey Kit units: {missingJerseys}. This\n              should block the final stage setup.\n            </div>',
    '            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">\n              Race Jersey shortage: {missingJerseys} rider{missingJerseys === 1 ? "" : "s"} will race without a usable kit.\n              The stage remains playable; the engine applies the proportional\n              preparation, energy-use and post-stage fatigue penalty.\n            </div>',
)

# Manual source.
manual = 'src/pages/dashboard/Manual.tsx'
replace_text(
    manual,
    "{ label: 'Race Jersey Complete', value: 'Mandatory; 10 stage uses per unit' }",
    "{ label: 'Race Jersey Complete', value: 'Recommended; 10 stage uses per unit' }",
)
replace_text(
    manual,
    "'Race Jersey Complete is mandatory in Stage Plans. Missing jersey kits can block stage setup.'",
    "'Race Jersey Complete is strongly recommended in Stage Plans. A shortage never blocks participation: riders without a usable kit race in normal team clothing and the team receives a proportional performance penalty (up to -30% positive preparation bonuses, +8% energy use and +15% post-stage fatigue at a full shortage).'",
)
replace_text(
    manual,
    '{ "label": "Race Jersey Complete", "value": "Mandatory durable item; 10 stage uses per unit" }',
    '{ "label": "Race Jersey Complete", "value": "Recommended durable item; 10 stage uses per unit" }',
)
replace_text(
    manual,
    '"Race Jersey Complete is mandatory. A team without enough usable jersey stage-uses can be blocked from having a complete stage setup."',
    '"Race Jersey Complete is strongly recommended. A shortage does not block a stage or remove the team from the race; riders without a kit compete in normal team clothing and the team receives the proportional jersey-shortage performance penalty."',
)
replace_text(
    manual,
    "return 'Durable race supplies are tracked differently from one-use consumables. Their remaining stage-use capacity matters. Mandatory jersey shortages can block readiness; rain-jacket shortages mainly reduce weather flexibility. Replace worn-out units before an important race block.'",
    "return 'Durable race supplies are tracked differently from one-use consumables. Their remaining stage-use capacity matters. Jersey shortages reduce race performance instead of blocking participation; rain-jacket shortages mainly reduce weather flexibility. Replace worn-out units before an important race block.'",
)

# Equipment source comment.
replace_text(
    'src/pages/dashboard/equipment/components/EquipmentRaceSuppliesTab.tsx',
    ' * - Race Jersey Complete = mandatory durable kit, 10 stage uses per unit.',
    ' * - Race Jersey Complete = recommended durable kit; shortages apply a proportional performance penalty, 10 stage uses per unit.',
)

# Tutorials.
tutorials = 'src/lib/tutorials.ts'
replace_text(
    tutorials,
    "      'Without the right race supplies, riders may receive negative effects in very hot, cold, or demanding weather conditions.\\n\\n' +\n      'After Equipment, the next recommended page is Infrastructure.',",
    "      'Without the right race supplies, riders may receive negative effects in very hot, cold, or demanding weather conditions.\\n\\n' +\n      'Race Jersey Kits are strongly recommended, but a shortage does not remove your team or block a Stage Plan. Riders without a usable kit race in normal team clothing and the team receives a proportional performance penalty. A complete shortage means -30% positive preparation bonuses, +8% in-stage energy use and +15% post-stage fatigue.\\n\\n' +\n      'After Equipment, the next recommended page is Infrastructure.',",
)
replace_text(
    tutorials,
    "      'Here you prepare the tactics for each stage. You can define rider roles, equipment, supplies, team tactics, and individual tactics for every stage.\\n\\n' +\n      'Stage Plans are important because different stages need different plans.",
    "      'Here you prepare the tactics for each stage. You can define rider roles, equipment, supplies, team tactics, and individual tactics for every stage. A Race Jersey Kit shortage is a performance warning, not a participation blocker: the plan can still be saved and the team still races.\\n\\n' +\n      'Stage Plans are important because different stages need different plans.",
)

# Current notification template.
nt = 'src/features/notifications/notificationTemplatesBase.tsx'
replace_text(nt, "    defaultTitle: 'Mandatory Race Jersey Kits missing',", "    defaultTitle: 'Race jersey shortage — performance penalty',")
replace_text(
    nt,
    "      'Your team does not have enough usable Race Jersey Kits for an upcoming stage. Resupply before the stage eligibility check to avoid race removal.',",
    "      'Your team has fewer usable Race Jersey Kits than selected riders for an upcoming stage. The team will still race; riders without a kit use normal team clothing and the shortage applies a proportional performance penalty.',",
)
replace_text(
    nt,
    "        return `Critical supply shortage for ${raceName} — ${stageLabel}. You currently have ${available} usable Race Jersey Kit${available === 1 ? '' : 's'}, but ${required} are required. Buy ${missing} additional kit${missing === 1 ? '' : 's'} before the eligibility check.`",
    "        return `Race jersey shortage for ${raceName} — ${stageLabel}. You have ${available} usable Race Jersey Kit${available === 1 ? '' : 's'} for ${required} selected rider${required === 1 ? '' : 's'}, so ${missing} rider${missing === 1 ? '' : 's'} will race without a kit. The team remains eligible and receives a proportional performance penalty.`",
)
replace_text(
    nt,
    "        'Your team does not have enough usable Race Jersey Kits for the upcoming stage. Resupply before the eligibility check.'",
    "        'Your team has a Race Jersey Kit shortage for the upcoming stage. The team still races; the shortage applies a proportional performance penalty.'",
)
replace_text(nt, "          missing !== null && missing > 0 ? 'Critical shortage' : 'Ready'", "          missing !== null && missing > 0 ? 'Shortage — penalty active' : 'Ready'")
replace_text(
    nt,
    "          'If unresolved',\n          'Team removed from this stage and all remaining stages'",
    "          'Race effect',\n          'Team remains eligible; performance penalty scales with missing kits'",
)
replace_text(
    nt,
    "        return `Immediate action required: purchase at least ${missing} additional usable Race Jersey Kit${missing === 1 ? '' : 's'}. The eligibility guard checks usable supply, so worn-out or unavailable kits do not satisfy the requirement.`",
    "        return `You can reduce or remove the performance penalty by adding ${missing} usable Race Jersey Kit${missing === 1 ? '' : 's'}. A full shortage means -30% positive preparation bonuses, +8% in-stage energy use and +15% post-stage fatigue.`",
)
replace_text(
    nt,
    "      return 'Open Race Supplies to verify your usable Race Jersey Kit stock before the stage eligibility check.'",
    "      return 'Open Race Supplies to review usable Race Jersey Kit stock. A shortage does not block participation.'",
)

# Historical DQ code remains supported for old notifications, but do not show a current 'team removed' image.
legacy = 'src/features/notifications/notificationTemplatesLegacy.tsx'
replace_text(
    legacy,
    "  RACE_TEAM_DISQUALIFIED_JERSEYS:\n    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20removed%20from%20race.png',",
    "  RACE_TEAM_DISQUALIFIED_JERSEYS:\n    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png',",
)


# Localization helpers.
locale_root = ROOT / 'src/i18n/locales'
locale_dirs = [p for p in locale_root.iterdir() if p.is_dir()]


def walk_set_key(node, key: str, value: str) -> int:
    count = 0
    if isinstance(node, dict):
        for k in list(node.keys()):
            if k == key:
                node[k] = value
                count += 1
            else:
                count += walk_set_key(node[k], key, value)
    elif isinstance(node, list):
        for item in node:
            count += walk_set_key(item, key, value)
    return count


def set_path(data, path, value) -> bool:
    cur = data
    for key in path[:-1]:
        if not isinstance(cur, dict) or key not in cur:
            return False
        cur = cur[key]
    if not isinstance(cur, dict) or path[-1] not in cur:
        return False
    cur[path[-1]] = value
    return True


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    changed.add(str(path))


for lang_dir in locale_dirs:
    p = lang_dir / 'racePreparation.json'
    if p.exists():
        data = json.loads(p.read_text(encoding='utf-8'))
        c1 = walk_set_key(data, 'stageSupplyDesc', 'Team-level supply setup for this stage. Consumables are applied per rider; Race Jersey Kits are strongly recommended but a shortage does not block participation. Rain Jackets are a team-wide yes/no choice.')
        c2 = walk_set_key(data, 'mandatoryJersey', 'Recommended for all selected riders. Riders without a usable jersey kit race in normal team clothing and the team receives a proportional performance penalty.')
        if not (c1 and c2):
            raise RuntimeError(f'{p}: race jersey localization keys missing')
        write_json(p, data)

    p = lang_dir / 'equipment.json'
    if p.exists():
        data = json.loads(p.read_text(encoding='utf-8'))
        c1 = walk_set_key(data, 'jerseyStage', 'Strongly recommended in Stage Plans. One usable race jersey kit per selected rider avoids the shortage penalty.')
        c2 = walk_set_key(data, 'jerseyNegative1', 'Missing jersey kit: rider races in normal team clothing and the team receives a proportional performance penalty')
        if not (c1 and c2):
            raise RuntimeError(f'{p}: race jersey equipment keys missing')
        write_json(p, data)

    p = lang_dir / 'notifications.json'
    if p.exists():
        data = json.loads(p.read_text(encoding='utf-8'))
        walk_set_key(data, 'RACE_JERSEYS_MANDATORY_WARNING', 'Race jersey shortage — performance penalty')
        values = {
            ('templateLocalization', 'feed', 'raceJerseysRemoval', 'title'): 'Legacy jersey-shortage event — {{raceName}}',
            ('templateLocalization', 'feed', 'raceJerseysRemoval', 'message'): '{{teamName}} had a Race Jersey Kit shortage for Stage {{stage}} under the previous rule. This historical notification is kept for the record. Under the current rule, the team remains in {{raceName}} and receives a proportional performance penalty instead of removal.',
            ('templateLocalization', 'feed', 'raceJerseysRemoval', 'genericMessage'): 'This is a historical jersey-shortage notification from the previous rule. Current jersey shortages do not remove a team from {{raceName}}; they apply a proportional performance penalty.',
            ('semanticTypeTitles', 'RACE_TEAM_DISQUALIFIED_JERSEYS'): 'Legacy jersey-shortage event',
            ('richReports', 'race', 'teamRemoved'): '{{team}} had a Race Jersey Kit shortage in {{race}} under the previous rule{{stagePart}}.{{stockPart}} This notification is historical. Under the current rule, a shortage does not remove the team; riders without kits race in normal team clothing and a proportional performance penalty applies.',
            ('richReports', 'race', 'prestart'): '{{team}} had a Race Jersey Kit shortage before {{race}} under the previous rule.{{stockPart}} This historical notification no longer describes current eligibility: the team now remains in the race and receives a proportional performance penalty.',
            ('richReports', 'race', 'extraRemoved'): 'Open Race Supplies to review usable Race Jersey Kits. Under the current rule, a shortage reduces performance but does not remove the team.',
            ('richReports', 'race', 'extraPrestart'): 'Open Race Supplies to review usable Race Jersey Kits. Current jersey shortages do not cause missed-start/no-show consequences; they apply the proportional performance penalty.',
            ('richReports', 'race', 'removedRemaining'): 'Legacy event — current rule keeps the team in the race',
            ('richReports', 'race', 'outcomeRemoved'): 'Legacy event — current rule applies performance penalty',
            ('richReports', 'race', 'problemJerseys'): 'Race Jersey shortage — performance penalty',
        }
        for key_path, value in values.items():
            set_path(data, key_path, value)
        write_json(p, data)


# Use the English manual structure to replace the same old rule positions in all supported locales.
manual_replacements = {
    'Durable race supplies are tracked differently from one-use consumables. Their remaining stage-use capacity matters. Mandatory jersey shortages can block readiness; rain-jacket shortages mainly reduce weather flexibility. Replace worn-out units before an important race block.':
        'Durable race supplies are tracked differently from one-use consumables. Their remaining stage-use capacity matters. Jersey shortages reduce race performance instead of blocking participation; rain-jacket shortages mainly reduce weather flexibility. Replace worn-out units before an important race block.',
    'Race Jersey Complete is mandatory in Stage Plans. Missing jersey kits can block stage setup.':
        'Race Jersey Complete is strongly recommended in Stage Plans. A shortage never blocks participation: riders without a usable kit race in normal team clothing and the team receives a proportional performance penalty.',
    'Race Jersey Complete is mandatory. A team without enough usable jersey stage-uses can be blocked from having a complete stage setup.':
        'Race Jersey Complete is strongly recommended. A shortage does not block a stage or remove the team from the race; riders without a kit compete in normal team clothing and the team receives the proportional jersey-shortage performance penalty.',
    'Mandatory; 10 stage uses per unit': 'Recommended; 10 stage uses per unit',
    'Race jerseys: mandatory durable kit; 10 stage uses per unit.':
        'Race jerseys: recommended durable kit; 10 stage uses per unit. Shortages apply a performance penalty but do not block participation.',
}


def collect_paths(node, targets, prefix=()):
    found = []
    if isinstance(node, dict):
        for k, v in node.items():
            found += collect_paths(v, targets, prefix + (k,))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            found += collect_paths(v, targets, prefix + (i,))
    elif isinstance(node, str) and node in targets:
        found.append((prefix, node))
    return found


def set_any_path(node, path, value):
    cur = node
    for token in path[:-1]:
        cur = cur[token]
    cur[path[-1]] = value


for en_file in sorted((locale_root / 'en').glob('manual*.json')):
    en_data = json.loads(en_file.read_text(encoding='utf-8'))
    source_paths = collect_paths(en_data, set(manual_replacements))
    for lang_dir in locale_dirs:
        target = lang_dir / en_file.name
        if not target.exists() or not source_paths:
            continue
        data = json.loads(target.read_text(encoding='utf-8'))
        applied = 0
        for key_path, old_value in source_paths:
            try:
                set_any_path(data, key_path, manual_replacements[old_value])
                applied += 1
            except (KeyError, IndexError, TypeError):
                pass
        if applied:
            write_json(target, data)


# Exact active-source audit. Negative statements such as "does not block" are intentionally valid.
forbidden = [
    'Missing jersey kit: blocks stage setup',
    'Missing jersey kits block the stage setup',
    'This blocks saving/starting the stage',
    'should block the final stage setup',
    'Race Jersey Kit is mandatory',
    'Race Jersey Complete is mandatory',
    'Mandatory Race Jersey Kits missing',
    'Resupply before the stage eligibility check to avoid race removal',
    'Team removed from this stage and all remaining stages',
    'Immediate action required: purchase at least',
]
allowed = {
    'src/features/notifications/notificationLocalization.ts',
    'src/features/notifications/notificationTemplatesLegacy.tsx',
}
hits = []
for path in (ROOT / 'src').rglob('*'):
    if not path.is_file() or path.suffix.lower() not in {'.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt'}:
        continue
    rel = str(path)
    if rel in allowed:
        continue
    text = path.read_text(encoding='utf-8').lower()
    for needle in forbidden:
        if needle.lower() in text:
            hits.append(f'{rel}: {needle}')

report = ROOT / '.github/race_jersey_shortage_audit.txt'
report.write_text(
    '# Active race jersey rule audit\n\n' + ('\n'.join(hits) if hits else 'PASS — no obsolete active player-facing jersey-shortage blockers found.') + '\n',
    encoding='utf-8',
)
if hits:
    raise RuntimeError('Obsolete jersey blocker strings remain:\n' + '\n'.join(hits))

print(f'Changed {len(changed)} files.')
print('PASS — no obsolete active player-facing jersey-shortage blockers found.')
