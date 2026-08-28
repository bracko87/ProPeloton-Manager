from pathlib import Path

script_path = Path('.github/scripts/chatgpt_localization_followup_20260828.py')
source = script_path.read_text(encoding='utf-8')

old_anchor = '"  const { t } = useTranslation(\'training\')\\n  const navigate = useNavigate()"'
new_anchor = '"  const { t, i18n } = useTranslation(\'training\')\\n  const isSerbianUi = (i18n.resolvedLanguage ?? i18n.language ?? \'en\').startsWith(\'sr\')\\n  const navigate = useNavigate()"'

old_output = '"  const { t } = useTranslation(\'training\')\\n  const translateCampSystemMessage = (message: string): string => {'
new_output = '"  const { t, i18n } = useTranslation(\'training\')\\n  const isSerbianUi = (i18n.resolvedLanguage ?? i18n.language ?? \'en\').startsWith(\'sr\')\\n  const translateCampSystemMessage = (message: string): string => {'

if old_anchor not in source:
    raise SystemExit('Could not patch TrainingPage input anchor in follow-up script')
if old_output not in source:
    raise SystemExit('Could not patch TrainingPage output anchor in follow-up script')

source = source.replace(old_anchor, new_anchor, 1)
source = source.replace(old_output, new_output, 1)

# Python re.sub replacement parsing must not consume backslashes contained in
# TypeScript replacement text such as /\s+/g.
old_re_sub = "next_text, hits = re.subn(pattern, replacement, text, count=count, flags=re.MULTILINE)"
new_re_sub = "next_text, hits = re.subn(pattern, lambda _match: replacement, text, count=count, flags=re.MULTILINE)"
if old_re_sub not in source:
    raise SystemExit('Could not patch literal-safe regex replacement helper')
source = source.replace(old_re_sub, new_re_sub, 1)

# The English sentence is intentionally retained as an input value in
# translateCampSystemMessage(), so a whole-file search is a false positive.
false_positive_assertion = "    'No staff selected. The camp can still be booked, but there will be no coach, doctor, mechanic, or director boost.',\n"
if false_positive_assertion not in source:
    raise SystemExit('Could not remove Training comparison-string false-positive assertion')
source = source.replace(false_positive_assertion, '', 1)

# Generic asset panels already use the translated modal title, so the base
# codemod's older acquireModalTitle anchor does not match. Ensure the newly
# required assetKey prop is passed to this modal too.
generic_modal_patch_anchor = "replace(assets_path, \"        <AssetAcquireModal\\n          title={acquireModalTitle}\", \"        <AssetAcquireModal\\n          assetKey={assetKey}\\n          title={t(assetCopy.acquire)}\", required=False)\n"
generic_modal_patch = generic_modal_patch_anchor + "replace(assets_path, \"        <AssetAcquireModal\\n          title={t(assetCopy.acquire)}\", \"        <AssetAcquireModal\\n          assetKey={assetKey}\\n          title={t(assetCopy.acquire)}\", required=False)\n"
if generic_modal_patch_anchor not in source:
    raise SystemExit('Could not augment GenericAssetGaragePanel acquire modal patch')
source = source.replace(generic_modal_patch_anchor, generic_modal_patch, 1)

compiled = compile(source, str(script_path), 'exec')
exec(compiled, {'__name__': '__main__', '__file__': str(script_path)})
