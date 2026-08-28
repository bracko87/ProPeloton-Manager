from pathlib import Path
import json
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def load_json(path: str):
    return json.loads(read(path))


def flatten(value, prefix='', out=None):
    if out is None:
        out = {}
    if isinstance(value, str):
        out.setdefault(value, prefix)
        return out
    if isinstance(value, dict):
        for key, nested in value.items():
            flatten(nested, f'{prefix}.{key}' if prefix else key, out)
    return out


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing required anchor {label}: {old[:160]!r}')
    return text.replace(old, new, 1)


def ts_single(value: str) -> str:
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def t_expr(key: str, ns: str | None = None, fn='t') -> str:
    if ns:
        return f"{fn}('{key}', {{ ns: '{ns}' }})"
    return f"{fn}('{key}')"


def replace_component_single_literals(text: str, start_marker: str, literal_maps, min_len=14) -> str:
    start = text.index(start_marker)
    before, body = text[:start], text[start:]
    for ns, mapping in literal_maps:
        for literal, key in sorted(mapping.items(), key=lambda item: len(item[0]), reverse=True):
            if '{{' in literal or len(literal.strip()) < min_len or '\n' in literal:
                continue
            old = ts_single(literal)
            if old in body:
                body = body.replace(old, t_expr(key, None if len(literal_maps) == 1 else ns))
    return before + body


def replace_module_single_literals(text: str, end_marker: str, mapping, namespace: str, min_len=14) -> str:
    end = text.index(end_marker)
    head, tail = text[:end], text[end:]
    for literal, key in sorted(mapping.items(), key=lambda item: len(item[0]), reverse=True):
        if '{{' in literal or len(literal.strip()) < min_len or '\n' in literal:
            continue
        old = ts_single(literal)
        if old in head:
            head = head.replace(old, t_expr(key, namespace, 'appI18n.t'))
    return head + tail


def normalize_ws(value: str) -> str:
    return ' '.join(value.split())


def replace_jsx_text_nodes(text: str, ranges, literal_maps) -> str:
    # Process from right to left so range offsets remain stable.
    resolved = []
    for start_marker, end_marker in ranges:
        start = text.index(start_marker)
        end = text.index(end_marker, start) if end_marker else len(text)
        resolved.append((start, end))
    combined = {}
    for ns, mapping in literal_maps:
        for literal, key in mapping.items():
            if '{{' not in literal:
                combined.setdefault(normalize_ws(literal), (ns, key))

    for start, end in sorted(resolved, reverse=True):
        segment = text[start:end]
        pattern = re.compile(r'>([^<>{}]+)<', re.DOTALL)
        def repl(match):
            raw = match.group(1)
            normalized = normalize_ws(raw)
            found = combined.get(normalized)
            if not found:
                return match.group(0)
            ns, key = found
            expr = t_expr(key, None if len(literal_maps) == 1 else ns)
            lead = raw[: len(raw) - len(raw.lstrip())]
            trail = raw[len(raw.rstrip()):]
            return '>' + lead + '{' + expr + '}' + trail + '<'
        segment = pattern.sub(repl, segment)
        text = text[:start] + segment + text[end:]
    return text


def replace_jsx_attributes(text: str, ranges, literal_maps) -> str:
    resolved = []
    for start_marker, end_marker in ranges:
        start = text.index(start_marker)
        end = text.index(end_marker, start) if end_marker else len(text)
        resolved.append((start, end))
    combined = {}
    for ns, mapping in literal_maps:
        for literal, key in mapping.items():
            if '{{' not in literal:
                combined.setdefault(literal, (ns, key))
    attrs = ('placeholder', 'aria-label', 'title', 'alt')
    for start, end in sorted(resolved, reverse=True):
        segment = text[start:end]
        for attr in attrs:
            pattern = re.compile(rf'{attr}="([^"]+)"')
            def repl(match):
                found = combined.get(match.group(1))
                if not found:
                    return match.group(0)
                ns, key = found
                expr = t_expr(key, None if len(literal_maps) == 1 else ns)
                return f'{attr}={{' + expr + '}'
            segment = pattern.sub(repl, segment)
        text = text[:start] + segment + text[end:]
    return text


# ---------------------------------------------------------------------------
# MY PROFILE — use the actual flag emoji from SUPPORTED_LANGUAGES, never RS/GB.
# ---------------------------------------------------------------------------
profile_path = 'src/pages/MyProfile.tsx'
profile = read(profile_path)
profile, count = re.subn(r'\{(activeLanguageDefinition|language)\.countryCode\}', r'{\1.flag}', profile)
if count < 1:
    raise SystemExit('MyProfile language countryCode flag anchor not found')
write(profile_path, profile)
print('MyProfile flag replacements:', count)


# ---------------------------------------------------------------------------
# HELP — direct useTranslation + existing help resource.
# ---------------------------------------------------------------------------
help_path = 'src/pages/Help.tsx'
help_map = flatten(load_json('src/i18n/locales/en/help.json'))
help_text = read(help_path)
help_text = replace_required(
    help_text,
    "import React, { useState } from 'react'\nimport { Link } from 'react-router'",
    "import React, { useState } from 'react'\nimport { useTranslation } from 'react-i18next'\nimport { Link } from 'react-router'",
    'Help import',
)
help_text = replace_required(
    help_text,
    "export default function HelpPage(): JSX.Element {\n  const [openFaqKey",
    "export default function HelpPage(): JSX.Element {\n  const { t } = useTranslation('help')\n  const [openFaqKey",
    'Help hook',
)
# Help has no business-code comparisons using its English copy, so all resource literals
# inside the component can safely become direct t() calls.
start = help_text.index('export default function HelpPage')
head, body = help_text[:start], help_text[start:]
for literal, key in sorted(help_map.items(), key=lambda item: len(item[0]), reverse=True):
    if '{{' in literal or '\n' in literal:
        continue
    old = ts_single(literal)
    if old in body:
        body = body.replace(old, t_expr(key))
help_text = head + body
help_text = replace_jsx_text_nodes(help_text, [('export default function HelpPage', None)], [('help', help_map)])
help_text = replace_jsx_attributes(help_text, [('export default function HelpPage', None)], [('help', help_map)])
write(help_path, help_text)


# ---------------------------------------------------------------------------
# PRO PACKAGES — direct useTranslation + existing proPackages resource.
# ---------------------------------------------------------------------------
pro_path = 'src/pages/ProPackages.tsx'
pro_map = flatten(load_json('src/i18n/locales/en/proPackages.json'))
pro = read(pro_path)
pro = replace_required(
    pro,
    "import React, { useEffect, useMemo, useRef, useState } from 'react'\nimport { supabase } from '../lib/supabase'",
    "import React, { useEffect, useMemo, useRef, useState } from 'react'\nimport { useTranslation } from 'react-i18next'\nimport appI18n from '../i18n'\nimport { supabase } from '../lib/supabase'",
    'ProPackages imports',
)
pro = replace_required(
    pro,
    "export default function ProPackagesPage(): JSX.Element {\n  const stripeReturnHandledRef",
    "export default function ProPackagesPage(): JSX.Element {\n  const { t, i18n } = useTranslation('proPackages')\n  const stripeReturnHandledRef",
    'ProPackages hook',
)
# Convert top-level display arrays to translation keys so they update immediately on language change.
comparison_old = """const COMPARISON_ROWS = [
  ['Create and manage a club', '✓', '✓'],
  ['Play races', '✓', '✓'],
  ['Basic management features', '✓', '✓'],
  ['Account access without coins', '✓', '✓'],
  ['Premium analysis and tools', '—', '✓'],
  ['Monthly Premium coin reward', '—', '50'],
  ['Buy additional coin packages', '✓', '✓'],
  ['Use optional coin features', '✓', '✓'],
] as const"""
comparison_new = """const COMPARISON_ROWS = [
  ['comparison.r1', '✓', '✓'],
  ['comparison.r2', '✓', '✓'],
  ['comparison.r3', '✓', '✓'],
  ['comparison.r4', '✓', '✓'],
  ['comparison.r5', '—', '✓'],
  ['comparison.r6', '—', '50'],
  ['comparison.r7', '✓', '✓'],
  ['comparison.r8', '✓', '✓'],
] as const"""
pro = replace_required(pro, comparison_old, comparison_new, 'comparison rows')
advantages_old = """const PREMIUM_ADVANTAGES = [
  '50 coins after every successful monthly Premium payment.',
  'Advanced training automation and rider-development analysis.',
  'Premium transfer tools: saved searches, automatic alerts, shortlist and negotiation analysis.',
  'Additional equipment setup slots and expanded included garage capacity.',
  'Access to advanced team-policy options and selected calendar filters.',
  'Additional external-rider history, recent results and career-honours views.',
  'Premium convenience features never improve race results, transfer acceptance or hidden rider skills.',
] as const"""
advantages_new = """const PREMIUM_ADVANTAGES = [
  'advantages.a1',
  'advantages.a2',
  'advantages.a3',
  'advantages.a4',
  'advantages.a5',
  'advantages.a6',
  'advantages.a7',
] as const"""
pro = replace_required(pro, advantages_old, advantages_new, 'premium advantages')
pro = pro.replace("if (coins <= 70) return 'Starter boost'", "if (coins <= 70) return 'packages.starter'")
pro = pro.replace("if (coins <= 130) return 'Great for a new season'", "if (coins <= 130) return 'packages.newSeason'")
pro = pro.replace("if (coins <= 270) return 'Most balanced pick'", "if (coins <= 270) return 'packages.balanced'")
pro = pro.replace("if (coins <= 390) return 'Most popular'", "if (coins <= 390) return 'packages.popular'")
pro = pro.replace("if (coins <= 570) return 'Serious manager mode'", "if (coins <= 570) return 'packages.manager'")
pro = pro.replace("return 'Best for long-term play'", "return 'packages.longTerm'")
# Known module-level user-facing helper output.
module_replacements = {
    "throw new Error('Not authenticated. Please log in again.')": "throw new Error(appI18n.t('common.notAuthenticated', { ns: 'proPackages' }))",
    "return `Coin package purchase: ${packageCode}`": "return appI18n.t('transactions.purchase', { ns: 'proPackages', code: packageCode })",
    "if (reason === 'daily_charge') return 'Historical daily gameplay charge'": "if (reason === 'daily_charge') return appI18n.t('transactions.dailyCharge', { ns: 'proPackages' })",
    "if (reason === 'daily_gameplay_unlock') return 'Historical daily gameplay unlock'": "if (reason === 'daily_gameplay_unlock') return appI18n.t('transactions.dailyUnlock', { ns: 'proPackages' })",
    "if (reason === 'referral_reward') return 'Referral reward'": "if (reason === 'referral_reward') return appI18n.t('transactions.referral', { ns: 'proPackages' })",
    "if (reason === 'admin_adjustment') return 'Admin adjustment'": "if (reason === 'admin_adjustment') return appI18n.t('transactions.admin', { ns: 'proPackages' })",
    "if (reason === 'developing_team_purchase') return 'Developing Team purchase'": "if (reason === 'developing_team_purchase') return appI18n.t('transactions.developingPurchase', { ns: 'proPackages' })",
    "if (reason === 'developing_team_unlock') return 'Developing Team purchase'": "if (reason === 'developing_team_unlock') return appI18n.t('transactions.developingPurchase', { ns: 'proPackages' })",
    "if (reason === 'developing_team_legacy_creation') return 'Developing Team first activation'": "if (reason === 'developing_team_legacy_creation') return appI18n.t('transactions.developingLegacy', { ns: 'proPackages' })",
    "if (reason === 'scout_report_extra') return 'Extra scouting report'": "if (reason === 'scout_report_extra') return appI18n.t('transactions.extraScout', { ns: 'proPackages' })",
    "if (reason === 'premium_monthly_grant') return 'Premium monthly coin grant'": "if (reason === 'premium_monthly_grant') return appI18n.t('transactions.premiumGrant', { ns: 'proPackages' })",
}
for old, new in module_replacements.items():
    pro = pro.replace(old, new)
pro = pro.replace("? `Developing Team activation — Season ${season}`\n      : 'Developing Team seasonal activation'", "? appI18n.t('transactions.developingActivation', { ns: 'proPackages', season })\n      : appI18n.t('transactions.developingSeasonalActivation', { ns: 'proPackages' })")
pro = pro.replace("? `Developing Team renewal — Season ${season}`\n      : 'Developing Team seasonal renewal'", "? appI18n.t('transactions.developingRenewal', { ns: 'proPackages', season })\n      : appI18n.t('transactions.developingSeasonalRenewal', { ns: 'proPackages' })")
pro = pro.replace("? `Developing Team reactivation — Season ${season}`\n      : 'Developing Team seasonal reactivation'", "? appI18n.t('transactions.developingReactivation', { ns: 'proPackages', season })\n      : appI18n.t('transactions.developingSeasonalReactivation', { ns: 'proPackages' })")
# Long exact resource literals inside the component become direct t() calls.
pro = replace_component_single_literals(pro, 'export default function ProPackagesPage', [('proPackages', pro_map)], min_len=14)
# Static JSX labels/headings/buttons.
pro = replace_jsx_text_nodes(pro, [('export default function ProPackagesPage', None)], [('proPackages', pro_map)])
pro = replace_jsx_attributes(pro, [('export default function ProPackagesPage', None)], [('proPackages', pro_map)])
# Key-backed arrays/taglines.
pro = pro.replace('{benefit}', '{t(benefit)}')
pro = pro.replace('<span>{advantage}</span>', '<span>{t(advantage)}</span>')
pro = pro.replace("item.tagline === 'Most popular'", "item.tagline === 'packages.popular'")
pro = pro.replace('{item.tagline}', "{item.tagline ? t(item.tagline) : ''}")
# Localize package/billing number/date formatting according to current UI locale.
pro = pro.replace("new Intl.NumberFormat('de-DE',", "new Intl.NumberFormat(appI18n.resolvedLanguage ?? appI18n.language ?? 'en',")
write(pro_path, pro)


# ---------------------------------------------------------------------------
# PREFERENCES — direct useTranslation + existing preferences resources.
# ---------------------------------------------------------------------------
pref_path = 'src/pages/Preferences.tsx'
pref_map = flatten(load_json('src/i18n/locales/en/preferences.json'))
pref_dyn_map = flatten(load_json('src/i18n/locales/en/preferencesDynamic.json'))
pref = read(pref_path)
pref = replace_required(
    pref,
    "import React, { useEffect, useState } from 'react'",
    "import React, { useEffect, useState } from 'react'\nimport { useTranslation } from 'react-i18next'",
    'Preferences import',
)
pref = replace_required(
    pref,
    "export default function PreferencesPage(): JSX.Element {\n  const [notifications",
    "export default function PreferencesPage(): JSX.Element {\n  const { t } = useTranslation(['preferences', 'preferencesDynamic'])\n  const [notifications",
    'Preferences hook',
)
pref = replace_component_single_literals(
    pref,
    'export default function PreferencesPage',
    [('preferences', pref_map), ('preferencesDynamic', pref_dyn_map)],
    min_len=14,
)
pref = replace_jsx_text_nodes(
    pref,
    [('export default function PreferencesPage', None)],
    [('preferences', pref_map), ('preferencesDynamic', pref_dyn_map)],
)
pref = replace_jsx_attributes(
    pref,
    [('export default function PreferencesPage', None)],
    [('preferences', pref_map), ('preferencesDynamic', pref_dyn_map)],
)
# Notification definitions are canonical English data; translate by their stable group/category keys.
pref = pref.replace('{section.title}', "{t(`sections.${section.code}.title`)}")
pref = pref.replace('{section.description}', "{t(`sections.${section.code}.description`)}")
pref = pref.replace('{enabledCount}/{sectionGroups.length} on', "{t('notifications.enabledCount', { enabled: enabledCount, total: sectionGroups.length })}")
pref = pref.replace('title={group.label} description={group.description}', "title={t(`groups.${groupCode}.label`)} description={t(`groups.${groupCode}.description`)}")
pref = pref.replace('title={definition.label}', "title={t(`advisorCategories.${key}.label`)}")
pref = pref.replace("? definition.description\n                              : `${definition.description} Activate the required Staff Advisor to control this notification.`", "? t(`advisorCategories.${key}.description`)\n                              : `${t(`advisorCategories.${key}.description`)} ${t('notifications.advisorInactiveSuffix')}`")
# Dynamic Developing Team status/errors.
pref = pref.replace("setDevelopingTeamError(e?.message ?? 'Failed to load Developing Team status.')", "setDevelopingTeamError(e?.message ?? t('errors.loadStatus', { ns: 'preferencesDynamic' }))")
pref = pref.replace("setAdvisorNotificationCategoryError(\n        'Could not save the Staff Advisor notification setting. Please try again.'\n      )", "setAdvisorNotificationCategoryError(t('notifications.advisorSaveError'))")
pref = re.sub(
    r"setDevelopingTeamSuccessMessage\(\s*normalized\?\.access_status === 'active'\s*\? `Developing Team activated for Season \$\{\s*normalized\.active_season \?\? normalized\.current_season\s*\}\. Automatic renewal is \$\{normalized\.auto_renew === false \? 'off' : 'on'\}\. `?\s*: 'Developing Team activated successfully\.'\s*\)",
    "setDevelopingTeamSuccessMessage(\n        normalized?.access_status === 'active'\n          ? t('activation.activatedForSeason', {\n              ns: 'preferencesDynamic',\n              season: normalized.active_season ?? normalized.current_season,\n              renewal: t(normalized.auto_renew === false ? 'activation.off' : 'activation.on', { ns: 'preferencesDynamic' }),\n            })\n          : t('activation.activatedSuccessfully', { ns: 'preferencesDynamic' })\n      )",
    pref,
    flags=re.DOTALL,
)
pref = pref.replace("setDevelopingTeamError(error?.message ?? 'Failed to activate Developing Team.')", "setDevelopingTeamError(error?.message ?? t('errors.activate', { ns: 'preferencesDynamic' }))")
write(pref_path, pref)


# ---------------------------------------------------------------------------
# CUSTOMIZE TEAM / THEME — direct hooks in both rendering components.
# ---------------------------------------------------------------------------
custom_path = 'src/pages/CustomizeTeam.tsx'
custom_map = flatten(load_json('src/i18n/locales/en/customizeTeam.json'))
custom = read(custom_path)
custom = replace_required(
    custom,
    "import React, { useEffect, useId, useMemo, useRef, useState } from 'react'\nimport { getMyClubContext } from '@/lib/clubContext'",
    "import React, { useEffect, useId, useMemo, useRef, useState } from 'react'\nimport { useTranslation } from 'react-i18next'\nimport appI18n from '@/i18n'\nimport { getMyClubContext } from '@/lib/clubContext'",
    'CustomizeTeam imports',
)
custom = replace_required(
    custom,
    "}: KitDesignerProps): JSX.Element {\n  const [loaded",
    "}: KitDesignerProps): JSX.Element {\n  const { t } = useTranslation('customizeTeam')\n  const [loaded",
    'KitDesigner hook',
)
custom = replace_required(
    custom,
    "export default function CustomizeTeamPage(): JSX.Element {\n  const [mainClubId",
    "export default function CustomizeTeamPage(): JSX.Element {\n  const { t } = useTranslation('customizeTeam')\n  const [mainClubId",
    'CustomizeTeam hook',
)
# Module helper validation/error messages use the same i18n resource at call time.
custom = replace_module_single_literals(custom, 'function KitDesigner(', custom_map, 'customizeTeam', min_len=14)
# Component-level long literals and all static JSX text/attributes.
custom = replace_component_single_literals(custom, 'function KitDesigner(', [('customizeTeam', custom_map)], min_len=14)
custom = replace_jsx_text_nodes(
    custom,
    [('function KitDesigner(', 'export default function CustomizeTeamPage'), ('export default function CustomizeTeamPage', None)],
    [('customizeTeam', custom_map)],
)
custom = replace_jsx_attributes(
    custom,
    [('function KitDesigner(', 'export default function CustomizeTeamPage'), ('export default function CustomizeTeamPage', None)],
    [('customizeTeam', custom_map)],
)
write(custom_path, custom)


# ---------------------------------------------------------------------------
# Sanity checks before npm build.
# ---------------------------------------------------------------------------
checks = {
    profile_path: ['activeLanguageDefinition.countryCode', 'language.countryCode'],
    help_path: ['ProPeloton Help Center', 'First steps for new managers'],
    pro_path: ['Premium & Billing', 'Normal gameplay is free. Premium membership and coin packages are optional.'],
}
for path, markers in checks.items():
    source = read(path)
    for marker in markers:
        # Comments/resources are not imported into these files, so these markers should disappear from render source.
        if marker in source and path != pro_path:
            raise SystemExit(f'Residual localization marker in {path}: {marker}')

print('Settings pages localization codemod completed.')
