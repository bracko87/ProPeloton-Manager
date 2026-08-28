from pathlib import Path
import json


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# SponsorsTab.tsx
# -----------------------------------------------------------------------------
path = Path('src/pages/dashboard/finance/SponsorsTab.tsx')
text = path.read_text(encoding='utf-8')

text = replace_once(
    text,
    "function formatCashAmount(value: number | null | undefined): string {\n  return `${new Intl.NumberFormat('en-US').format(value ?? 0)} cash`\n}",
    "function formatCashAmount(value: number | null | undefined): string {\n  return formatMoney(value ?? 0)\n}",
    'formatCashAmount',
)

old_description = """function getSponsorDescription(\n  metadata: Record<string, unknown> | null | undefined\n): string | null {\n  return getMetadataValue(metadata, 'description')\n}\n"""
new_description = """function getSponsorDescription(\n  metadata: Record<string, unknown> | null | undefined\n): string | null {\n  const description = getMetadataValue(metadata, 'description')\n  if (!description) return null\n\n  // Newer sponsor economics store TOTAL VALUE as a backend metadata headline.\n  // Render it as a localized UI field instead of leaking backend English copy.\n  if (/^\\s*TOTAL VALUE\\s*:/i.test(description)) return null\n\n  return description\n}\n\nfunction getSponsorTotalValue(\n  metadata: Record<string, unknown> | null | undefined\n): number | null {\n  const candidates = [\n    metadata?.contract_total_value,\n    metadata?.full_season_contract_total_value,\n  ]\n\n  for (const value of candidates) {\n    const parsed = Number(value)\n    if (Number.isFinite(parsed) && parsed > 0) return parsed\n  }\n\n  const description = getMetadataValue(metadata, 'description')\n  const match = description?.match(/TOTAL VALUE\\s*:\\s*\\$?([0-9,]+)/i)\n  if (!match) return null\n\n  const parsed = Number(match[1].replace(/,/g, ''))\n  return Number.isFinite(parsed) && parsed > 0 ? parsed : null\n}\n"""
text = replace_once(text, old_description, new_description, 'getSponsorDescription')

start_marker = "function getMainSponsorPreviewObjectives(\n"
end_marker = "function countryCodeToEmoji(countryCode: string | null | undefined): string {\n"
start = text.find(start_marker)
end = text.find(end_marker)
if start < 0 or end < 0 or end <= start:
    raise RuntimeError('Could not locate main sponsor preview objective helper block')

new_objective_block = r'''function getMainSponsorPreviewObjectives(
  metadata: Record<string, unknown> | null | undefined,
  t: FinanceT
): MainSponsorObjectiveExplanation[] {
  const raw = metadata?.preview_objectives
  if (!Array.isArray(raw)) return []

  return raw
    .map((item): MainSponsorObjectiveExplanation | null => {
      if (!item || typeof item !== 'object') return null

      const record = item as Record<string, unknown>
      const objectiveCode = String(
        record.objective_code ?? record.required_result ?? ''
      ).trim()
      const raceName = String(record.target_race_name ?? '').trim()
      const rewardAmount = toNumber(record.estimated_reward_amount ?? record.reward_amount)
      const rewardLabel =
        typeof record.reward_label === 'string' && record.reward_label.trim().length > 0
          ? record.reward_label.trim()
          : rewardAmount > 0
            ? formatCashAmount(rewardAmount)
            : undefined

      const titleKeyByCode: Record<string, string> = {
        race_start: 'sponsors.previewRaceStartTitle',
        classification_visibility: 'sponsors.previewClassificationTitle',
        stage_top_5: 'sponsors.previewStageTop5Title',
        stage_win: 'sponsors.previewStageWinTitle',
        race_podium: 'sponsors.previewRacePodiumTitle',
        race_win: 'sponsors.previewRaceWinTitle',
        race_top_5: 'sponsors.previewRaceTop5Title',
        race_top_10: 'sponsors.previewRaceTop10Title',
        gc_top_5: 'sponsors.previewGcTop5Title',
        gc_top_10: 'sponsors.previewGcTop10Title',
      }

      const descriptionKeyByCode: Record<string, string> = {
        race_start: 'sponsors.previewRaceStartDescription',
        classification_visibility: 'sponsors.previewClassificationDescription',
        stage_top_5: 'sponsors.previewStageTop5Description',
        stage_win: 'sponsors.previewStageWinDescription',
        race_podium: 'sponsors.previewRacePodiumDescription',
        race_win: 'sponsors.previewRaceWinDescription',
        race_top_5: 'sponsors.previewRaceTop5Description',
        race_top_10: 'sponsors.previewRaceTop10Description',
        gc_top_5: 'sponsors.previewGcTop5Description',
        gc_top_10: 'sponsors.previewGcTop10Description',
      }

      const titleKey = titleKeyByCode[objectiveCode]
      const descriptionKey = descriptionKeyByCode[objectiveCode]

      const title = titleKey
        ? t(titleKey, { race: raceName || t('sponsors.objective') })
        : t('sponsors.previewGenericTitle', {
            race: raceName || t('sponsors.objective'),
          })

      const description = descriptionKey
        ? t(descriptionKey, { race: raceName || t('sponsors.objective') })
        : t('sponsors.previewGenericDescription', {
            race: raceName || t('sponsors.objective'),
          })

      return {
        title,
        description,
        rewardLabel,
      }
    })
    .filter((item): item is MainSponsorObjectiveExplanation => item !== null)
}

function explainMainSponsorObjective(
  goal: string,
  t: FinanceT
): MainSponsorObjectiveExplanation {
  const normalizedGoal = goal.toLowerCase()

  if (normalizedGoal.includes('start')) {
    return {
      title: t('sponsors.previewMarketStartsTitle'),
      description: t('sponsors.previewMarketStartsDescription'),
    }
  }

  if (normalizedGoal.includes('podium') || normalizedGoal.includes('win')) {
    return {
      title: t('sponsors.previewHighProfileTitle'),
      description: t('sponsors.previewHighProfileDescription'),
    }
  }

  if (normalizedGoal.includes('top-5') || normalizedGoal.includes('top 5')) {
    return {
      title: t('sponsors.previewMultipleTop5Title'),
      description: t('sponsors.previewMultipleTop5Description'),
    }
  }

  if (normalizedGoal.includes('top 10') || normalizedGoal.includes('top-10')) {
    return {
      title: t('sponsors.previewTop10Title'),
      description: t('sponsors.previewTop10Description'),
    }
  }

  if (normalizedGoal.includes('visibility')) {
    return {
      title: t('sponsors.previewVisibilityTitle'),
      description: t('sponsors.previewVisibilityDescription'),
    }
  }

  return {
    title: t('sponsors.previewGenericFocusTitle'),
    description: t('sponsors.previewGenericFocusDescription'),
  }
}

function getMainSponsorObjectiveExplanations(
  metadata: Record<string, unknown> | null | undefined,
  t: FinanceT
): MainSponsorObjectiveExplanation[] {
  const structuredObjectives = getMainSponsorPreviewObjectives(metadata, t)
  if (structuredObjectives.length > 0) return structuredObjectives

  const goals = getSponsorPreviewGoals(metadata)

  if (goals.length === 0) {
    return [
      {
        title: t('sponsors.previewSeasonVisibilityTitle'),
        description: t('sponsors.previewSeasonVisibilityDescription'),
      },
      {
        title: t('sponsors.previewSportingResultsTitle'),
        description: t('sponsors.previewSportingResultsDescription'),
      },
      {
        title: t('sponsors.previewCheckedAfterRacesTitle'),
        description: t('sponsors.previewCheckedAfterRacesDescription'),
      },
    ]
  }

  return goals.map(goal => explainMainSponsorObjective(goal, t))
}

'''
text = text[:start] + new_objective_block + text[end:]

text = replace_once(
    text,
    """            >\n              Close\n            </button>""",
    """            >\n              {t('common.close')}\n            </button>""",
    'offer modal close button',
)

text = replace_once(
    text,
    """                  const description = getSponsorDescription(offer.metadata)\n                  const objectiveExplanations = getMainSponsorObjectiveExplanations(offer.metadata)""",
    """                  const description = getSponsorDescription(offer.metadata)\n                  const totalValue = getSponsorTotalValue(offer.metadata)\n                  const objectiveExplanations = getMainSponsorObjectiveExplanations(offer.metadata, t)""",
    'offer metadata calculations',
)

old_render = """                            {description && offer.sponsor_kind !== 'secondary' && (\n                              <div className=\"text-sm text-gray-500 mt-2\">\n                                {description}\n                              </div>\n                            )}\n\n                            <div className=\"flex flex-wrap gap-2 mt-3\">"""
new_render = """                            {description && offer.sponsor_kind !== 'secondary' && (\n                              <div className=\"text-sm text-gray-500 mt-2\">\n                                {description}\n                              </div>\n                            )}\n\n                            {offer.sponsor_kind === 'main' && totalValue !== null ? (\n                              <div className=\"mt-3 inline-flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 shadow-sm\">\n                                <span className=\"text-xs font-semibold uppercase tracking-wide text-blue-700\">\n                                  {t('sponsors.totalValue')}\n                                </span>\n                                <span className=\"text-sm font-bold text-blue-950\">\n                                  {formatMoney(totalValue, currency)}\n                                </span>\n                              </div>\n                            ) : null}\n\n                            <div className=\"flex flex-wrap gap-2 mt-3\">"""
text = replace_once(text, old_render, new_render, 'main offer total value box')

path.write_text(text, encoding='utf-8')


# -----------------------------------------------------------------------------
# Finance translations
# -----------------------------------------------------------------------------
finance_en_path = Path('src/i18n/locales/en/finance.json')
finance_sr_path = Path('src/i18n/locales/sr-Latn/finance.json')
finance_en = json.loads(finance_en_path.read_text(encoding='utf-8'))
finance_sr = json.loads(finance_sr_path.read_text(encoding='utf-8'))

finance_sr['sponsors']['totalValue'] = 'Ukupna suma'

preview_en = {
    'previewRaceStartTitle': '{{race}}: start the race',
    'previewRaceStartDescription': 'Start {{race}} with your team. The objective is completed when your team appears on the race start list.',
    'previewClassificationTitle': '{{race}}: appear in the final classification',
    'previewClassificationDescription': 'Finish the race with at least one rider listed in the published final classification.',
    'previewStageTop5Title': '{{race}}: stage top 5',
    'previewStageTop5Description': 'Place at least one rider in the top 5 of a stage in {{race}}.',
    'previewStageWinTitle': '{{race}}: stage win',
    'previewStageWinDescription': 'Win at least one stage in {{race}}.',
    'previewRacePodiumTitle': '{{race}}: podium',
    'previewRacePodiumDescription': 'Finish {{race}} with at least one rider on the final podium.',
    'previewRaceWinTitle': '{{race}}: win the race',
    'previewRaceWinDescription': 'Win {{race}} with at least one of your riders.',
    'previewRaceTop5Title': '{{race}}: race top 5',
    'previewRaceTop5Description': 'Finish {{race}} with at least one rider inside the top 5.',
    'previewRaceTop10Title': '{{race}}: race top 10',
    'previewRaceTop10Description': 'Finish {{race}} with at least one rider inside the top 10.',
    'previewGcTop5Title': '{{race}}: final GC top 5',
    'previewGcTop5Description': 'Finish with at least one rider inside the final general-classification top 5 of {{race}}.',
    'previewGcTop10Title': '{{race}}: final GC top 10',
    'previewGcTop10Description': 'Finish with at least one rider inside the final general-classification top 10 of {{race}}.',
    'previewGenericTitle': '{{race}}: sponsor objective',
    'previewGenericDescription': 'This objective will be checked after the relevant result for {{race}} is finalized.',
    'previewMarketStartsTitle': 'Sponsor-market race starts',
    'previewMarketStartsDescription': 'The sponsor wants visible participation in races connected to its country, region, or global market.',
    'previewHighProfileTitle': 'High-profile result target',
    'previewHighProfileDescription': 'The sponsor expects a headline result such as a win, podium, or strong GC finish in a race connected to its market.',
    'previewMultipleTop5Title': 'Multiple top-5 results',
    'previewMultipleTop5Description': 'The sponsor wants repeatable sporting visibility through multiple top-5 stage or race results.',
    'previewTop10Title': 'Top-10 performance target',
    'previewTop10Description': 'The sponsor expects a reliable top-10 result in a race, stage, or general classification tied to its market.',
    'previewVisibilityTitle': 'Market visibility objective',
    'previewVisibilityDescription': 'The sponsor wants exposure in its home market through participation, branding, and competitive presence.',
    'previewGenericFocusTitle': 'Sponsor objective',
    'previewGenericFocusDescription': 'This bonus objective is checked against race participation or final results after the relevant race is completed.',
    'previewSeasonVisibilityTitle': 'Season visibility',
    'previewSeasonVisibilityDescription': 'The sponsor expects your team to appear in races that matter for its market and brand exposure.',
    'previewSportingResultsTitle': 'Sporting results',
    'previewSportingResultsDescription': 'Bonus money is tied to results such as wins, podiums, top-5 finishes, top-10 finishes, or GC targets.',
    'previewCheckedAfterRacesTitle': 'Checked after races',
    'previewCheckedAfterRacesDescription': 'Objectives are evaluated after the target race or stage result is finalized and bonuses are then paid through finance.',
}

preview_sr = {
    'previewRaceStartTitle': '{{race}}: start na trci',
    'previewRaceStartDescription': 'Startujte na trci {{race}} sa svojim timom. Cilj je ostvaren kada se vaš tim pojavi na startnoj listi trke.',
    'previewClassificationTitle': '{{race}}: plasman u završnoj klasifikaciji',
    'previewClassificationDescription': 'Završite trku sa najmanje jednim vozačem u objavljenoj završnoj klasifikaciji.',
    'previewStageTop5Title': '{{race}}: top 5 na etapi',
    'previewStageTop5Description': 'Osvojite najmanje jedno mesto među prvih 5 na etapi trke {{race}}.',
    'previewStageWinTitle': '{{race}}: pobeda na etapi',
    'previewStageWinDescription': 'Osvojite najmanje jednu etapu na trci {{race}}.',
    'previewRacePodiumTitle': '{{race}}: podijum',
    'previewRacePodiumDescription': 'Završite trku {{race}} sa najmanje jednim vozačem na završnom podijumu.',
    'previewRaceWinTitle': '{{race}}: pobeda na trci',
    'previewRaceWinDescription': 'Pobedite na trci {{race}} sa najmanje jednim od svojih vozača.',
    'previewRaceTop5Title': '{{race}}: top 5 na trci',
    'previewRaceTop5Description': 'Završite trku {{race}} sa najmanje jednim vozačem među prvih 5.',
    'previewRaceTop10Title': '{{race}}: top 10 na trci',
    'previewRaceTop10Description': 'Završite trku {{race}} sa najmanje jednim vozačem među prvih 10.',
    'previewGcTop5Title': '{{race}}: top 5 u završnom generalnom plasmanu',
    'previewGcTop5Description': 'Završite trku {{race}} sa najmanje jednim vozačem među prvih 5 u završnom generalnom plasmanu.',
    'previewGcTop10Title': '{{race}}: top 10 u završnom generalnom plasmanu',
    'previewGcTop10Description': 'Završite trku {{race}} sa najmanje jednim vozačem među prvih 10 u završnom generalnom plasmanu.',
    'previewGenericTitle': '{{race}}: sponzorski cilj',
    'previewGenericDescription': 'Ovaj cilj će biti proveren nakon što relevantni rezultat trke {{race}} bude konačan.',
    'previewMarketStartsTitle': 'Startovi na tržištu sponzora',
    'previewMarketStartsDescription': 'Sponzor želi vidljivo učešće na trkama povezanim sa njegovom državom, regionom ili globalnim tržištem.',
    'previewHighProfileTitle': 'Cilj visokog sportskog rezultata',
    'previewHighProfileDescription': 'Sponzor očekuje važan rezultat kao što su pobeda, podijum ili jak završni GC plasman na trci povezanoj sa njegovim tržištem.',
    'previewMultipleTop5Title': 'Više top-5 rezultata',
    'previewMultipleTop5Description': 'Sponzor želi kontinuitet kroz više top-5 rezultata na etapama ili trkama.',
    'previewTop10Title': 'Cilj top-10 rezultata',
    'previewTop10Description': 'Sponzor očekuje pouzdan top-10 rezultat na trci, etapi ili u generalnom plasmanu povezanom sa njegovim tržištem.',
    'previewVisibilityTitle': 'Cilj tržišne vidljivosti',
    'previewVisibilityDescription': 'Sponzor želi vidljivost na svom tržištu kroz učešće, brendiranje i konkurentne rezultate.',
    'previewGenericFocusTitle': 'Sponzorski cilj',
    'previewGenericFocusDescription': 'Ovaj bonus cilj proverava se prema učešću ili završnim rezultatima nakon završetka relevantne trke.',
    'previewSeasonVisibilityTitle': 'Vidljivost tokom sezone',
    'previewSeasonVisibilityDescription': 'Sponzor očekuje da se vaš tim pojavljuje na trkama važnim za njegovo tržište i vidljivost brenda.',
    'previewSportingResultsTitle': 'Sportski rezultati',
    'previewSportingResultsDescription': 'Bonus novac je vezan za rezultate kao što su pobede, podijumi, top-5, top-10 ili ciljevi u generalnom plasmanu.',
    'previewCheckedAfterRacesTitle': 'Provera nakon trka',
    'previewCheckedAfterRacesDescription': 'Ciljevi se proveravaju nakon konačnog rezultata ciljane trke ili etape, a bonus se zatim isplaćuje kroz finansije.',
}

finance_en['sponsors'].update(preview_en)
finance_sr['sponsors'].update(preview_sr)
finance_en_path.write_text(json.dumps(finance_en, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
finance_sr_path.write_text(json.dumps(finance_sr, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


# -----------------------------------------------------------------------------
# languages.ts: add flag country codes so UI can use the same local SVG assets.
# -----------------------------------------------------------------------------
languages_path = Path('src/i18n/languages.ts')
languages = languages_path.read_text(encoding='utf-8')
languages = replace_once(
    languages,
    "    flag: '🇬🇧',\n    htmlLang: 'en',",
    "    flag: '🇬🇧',\n    countryCode: 'GB',\n    htmlLang: 'en',",
    'English countryCode',
)
languages = replace_once(
    languages,
    "    flag: '🇷🇸',\n    htmlLang: 'sr-Latn',",
    "    flag: '🇷🇸',\n    countryCode: 'RS',\n    htmlLang: 'sr-Latn',",
    'Serbian countryCode',
)
languages_path.write_text(languages, encoding='utf-8')


# -----------------------------------------------------------------------------
# MyProfile.tsx: compact language dropdown with local SVG country flags.
# -----------------------------------------------------------------------------
profile_path = Path('src/pages/MyProfile.tsx')
profile = profile_path.read_text(encoding='utf-8')

profile = replace_once(
    profile,
    "  const [savingLanguage, setSavingLanguage] = useState(false)\n",
    "  const [savingLanguage, setSavingLanguage] = useState(false)\n  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)\n",
    'language dropdown state',
)

profile = replace_once(
    profile,
    """  const currentLanguage: SupportedLanguage = isSupportedLanguage(locale)\n    ? locale\n    : getApplicationLanguage()\n\n  const birthdayLabel = useMemo(""",
    """  const currentLanguage: SupportedLanguage = isSupportedLanguage(locale)\n    ? locale\n    : getApplicationLanguage()\n  const activeLanguageDefinition =\n    SUPPORTED_LANGUAGES.find(language => language.code === currentLanguage) ??\n    SUPPORTED_LANGUAGES[0]\n\n  const birthdayLabel = useMemo(""",
    'active language definition',
)

old_language_ui = """          <div className=\"mt-4 flex flex-wrap gap-3\">\n            {SUPPORTED_LANGUAGES.map(language => {\n              const active = currentLanguage === language.code\n\n              return (\n                <button\n                  key={language.code}\n                  type=\"button\"\n                  onClick={() => void handleLanguageChange(language.code)}\n                  disabled={savingLanguage || active}\n                  aria-pressed={active}\n                  className={[\n                    'inline-flex min-w-[150px] items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition',\n                    active\n                      ? 'border-yellow-400 bg-yellow-50 text-gray-950 ring-1 ring-yellow-300'\n                      : 'border-gray-300 bg-white text-gray-800 hover:border-yellow-300 hover:bg-yellow-50',\n                    savingLanguage ? 'cursor-wait opacity-70' : '',\n                  ].join(' ')}\n                >\n                  <span className=\"text-xl\" aria-hidden=\"true\">{language.flag}</span>\n                  <span>{language.label}</span>\n                  {active ? (\n                    <span className=\"ml-auto text-xs font-medium text-green-700\">\n                      {t('profile.languageActive')}\n                    </span>\n                  ) : null}\n                </button>\n              )\n            })}\n          </div>\n"""

new_language_ui = """          <div\n            className=\"relative mt-4 w-full max-w-sm\"\n            onBlur={event => {\n              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {\n                setLanguageMenuOpen(false)\n              }\n            }}\n          >\n            <button\n              type=\"button\"\n              onClick={() => setLanguageMenuOpen(open => !open)}\n              disabled={savingLanguage}\n              aria-haspopup=\"listbox\"\n              aria-expanded={languageMenuOpen}\n              className=\"flex w-full items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm shadow-sm transition hover:border-yellow-400 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200 disabled:cursor-wait disabled:opacity-70\"\n            >\n              <img\n                src={`/flags/${activeLanguageDefinition.countryCode.toLowerCase()}.svg`}\n                alt=\"\"\n                className=\"h-[18px] w-6 shrink-0 rounded-[2px] border border-gray-200 object-cover\"\n                aria-hidden=\"true\"\n              />\n              <span className=\"font-semibold text-gray-900\">\n                {activeLanguageDefinition.label}\n              </span>\n              <span className=\"ml-auto rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700\">\n                {t('profile.languageActive')}\n              </span>\n              <span\n                aria-hidden=\"true\"\n                className={`text-gray-500 transition-transform ${languageMenuOpen ? 'rotate-180' : ''}`}\n              >\n                ▾\n              </span>\n            </button>\n\n            {languageMenuOpen ? (\n              <div\n                role=\"listbox\"\n                aria-label={t('profile.languageSelect')}\n                className=\"absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg\"\n              >\n                {SUPPORTED_LANGUAGES.map(language => {\n                  const active = currentLanguage === language.code\n\n                  return (\n                    <button\n                      key={language.code}\n                      type=\"button\"\n                      role=\"option\"\n                      aria-selected={active}\n                      disabled={savingLanguage}\n                      onClick={() => {\n                        setLanguageMenuOpen(false)\n                        if (!active) void handleLanguageChange(language.code)\n                      }}\n                      className={[\n                        'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition',\n                        active\n                          ? 'bg-yellow-50 text-gray-950'\n                          : 'text-gray-800 hover:bg-gray-50',\n                      ].join(' ')}\n                    >\n                      <img\n                        src={`/flags/${language.countryCode.toLowerCase()}.svg`}\n                        alt=\"\"\n                        className=\"h-[18px] w-6 shrink-0 rounded-[2px] border border-gray-200 object-cover\"\n                        aria-hidden=\"true\"\n                      />\n                      <span className=\"font-medium\">{language.label}</span>\n                      {active ? (\n                        <span className=\"ml-auto text-xs font-medium text-green-700\">\n                          {t('profile.languageActive')}\n                        </span>\n                      ) : null}\n                    </button>\n                  )\n                })}\n              </div>\n            ) : null}\n          </div>\n"""
profile = replace_once(profile, old_language_ui, new_language_ui, 'profile language buttons')
profile_path.write_text(profile, encoding='utf-8')


# -----------------------------------------------------------------------------
# Account-page translations for dropdown accessibility.
# -----------------------------------------------------------------------------
for locale, label in [('en', 'Choose language'), ('sr-Latn', 'Izaberite jezik')]:
    p = Path(f'src/i18n/locales/{locale}/accountPages.json')
    data = json.loads(p.read_text(encoding='utf-8'))
    data['profile']['languageSelect'] = label
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Sponsor localization and profile language dropdown updates applied.')
