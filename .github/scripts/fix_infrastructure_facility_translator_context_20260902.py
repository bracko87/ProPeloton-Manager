from pathlib import Path

facilities_path = Path('src/pages/dashboard/infrastructure/FacilitiesSection.tsx')
infra_path = Path('src/pages/dashboard/Infrastructure.tsx')

src = facilities_path.read_text(encoding='utf-8')

# Nested facility cards/modals were resolving some newer infrastructure keys through
# fallback English even while the parent Infrastructure page was already Serbian.
# Make every nested facility component consume the translator supplied by the parent.
original_hook = "const { t } = useTranslation('infrastructure')"
count = src.count(original_hook)
if count < 4:
    raise SystemExit(f'Expected at least 4 nested infrastructure translation hooks, found {count}')
src = src.replace(original_hook, 'const t = useInfrastructureT()')

marker = "type InfrastructureT = TFunction<'infrastructure'>\n"
if marker not in src:
    raise SystemExit('InfrastructureT marker not found')
helper = marker + "\nconst InfrastructureTranslationContext = React.createContext<InfrastructureT | null>(null)\n\nfunction useInfrastructureT(): InfrastructureT {\n  const contextualT = React.useContext(InfrastructureTranslationContext)\n  const translation = useTranslation('infrastructure')\n  return contextualT ?? translation.t\n}\n"
src = src.replace(marker, helper, 1)

export_marker = 'export function FacilitiesSection({\n'
if export_marker not in src:
    raise SystemExit('FacilitiesSection export marker not found')
src = src.replace(export_marker, export_marker + '  translate,\n', 1)

type_marker = '}: {\n  activeJobs: ActiveJobView[]\n'
if type_marker not in src:
    raise SystemExit('FacilitiesSection props type marker not found')
src = src.replace(type_marker, '}: {\n  translate: InfrastructureT\n  activeJobs: ActiveJobView[]\n', 1)

head, tail = src.split('export function FacilitiesSection', 1)
open_fragment = '  return (\n    <>\n'
if open_fragment not in tail:
    raise SystemExit('FacilitiesSection return fragment not found')
tail = tail.replace(
    open_fragment,
    '  return (\n    <InfrastructureTranslationContext.Provider value={translate}>\n      <>\n',
    1,
)

close_fragment = '    </>\n  )\n}'
idx = tail.rfind(close_fragment)
if idx < 0:
    raise SystemExit('FacilitiesSection closing fragment not found')
tail = tail[:idx] + '      </>\n    </InfrastructureTranslationContext.Provider>\n  )\n}' + tail[idx + len(close_fragment):]
src = head + 'export function FacilitiesSection' + tail

facilities_path.write_text(src, encoding='utf-8')

infra = infra_path.read_text(encoding='utf-8')
call_marker = '          <FacilitiesSection\n'
if call_marker not in infra:
    raise SystemExit('FacilitiesSection call marker not found')
if '          translate={t}\n' not in infra:
    infra = infra.replace(call_marker, call_marker + '          translate={t}\n', 1)

hardcoded_context_error = '          Infrastructure loaded, but staff impact context could not be loaded: {staffContextError}'
if hardcoded_context_error in infra:
    infra = infra.replace(
        hardcoded_context_error,
        "          {t('page.staffContextError')} {staffContextError}",
        1,
    )

infra_path.write_text(infra, encoding='utf-8')
print(f'Patched FacilitiesSection translator context; replaced {count} nested translation hooks')
