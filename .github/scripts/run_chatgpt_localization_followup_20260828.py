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

compiled = compile(source, str(script_path), 'exec')
exec(compiled, {'__name__': '__main__', '__file__': str(script_path)})
