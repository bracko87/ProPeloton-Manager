from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import polish_russian_baseline_20260831 as base

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
RU_DIR = ROOT / 'src/i18n/locales/ru'
PH = re.compile(r'\{\{[^{}]+\}\}')

# Run the first source-aware pass, then repair additional Russian morphology that the
# generic translation model commonly produces in a cycling-management context.

RIDER_FORMS = {
    'водитель': 'гонщик', 'водителя': 'гонщика', 'водителю': 'гонщику',
    'водителем': 'гонщиком', 'водителе': 'гонщике', 'водители': 'гонщики',
    'водителей': 'гонщиков', 'водителям': 'гонщикам', 'водителями': 'гонщиками',
    'водителях': 'гонщиках',
    'всадник': 'гонщик', 'всадника': 'гонщика', 'всаднику': 'гонщику',
    'всадником': 'гонщиком', 'всаднике': 'гонщике', 'всадники': 'гонщики',
    'всадников': 'гонщиков', 'всадникам': 'гонщикам', 'всадниками': 'гонщиками',
    'всадниках': 'гонщиках',
    'райдер': 'гонщик', 'райдера': 'гонщика', 'райдеру': 'гонщику',
    'райдером': 'гонщиком', 'райдеры': 'гонщики', 'райдеров': 'гонщиков',
    'райдерам': 'гонщикам', 'райдерами': 'гонщиками', 'райдерах': 'гонщиках',
    'мотоциклист': 'гонщик', 'мотоциклиста': 'гонщика', 'мотоциклисту': 'гонщику',
    'мотоциклистом': 'гонщиком', 'мотоциклисты': 'гонщики', 'мотоциклистов': 'гонщиков',
    'мотоциклистам': 'гонщикам', 'мотоциклистами': 'гонщиками', 'мотоциклистах': 'гонщиках',
}

STAGE_FORMS = {
    'сцена': 'этап', 'сцены': 'этапа', 'сцене': 'этапе', 'сцену': 'этап',
    'сценой': 'этапом', 'сценами': 'этапами', 'сценах': 'этапах',
    'стадия': 'этап', 'стадии': 'этапа', 'стадию': 'этап', 'стадией': 'этапом',
    'стадиями': 'этапами', 'стадиях': 'этапах',
}

RACE_FORMS = {
    'раса': 'гонка', 'расы': 'гонки', 'расе': 'гонке', 'расу': 'гонку',
    'расой': 'гонкой', 'расами': 'гонками', 'расах': 'гонках',
    'расовый': 'гоночный', 'расовая': 'гоночная', 'расовое': 'гоночное',
    'расовые': 'гоночные', 'расового': 'гоночного', 'расовой': 'гоночной',
    'расовых': 'гоночных', 'расовому': 'гоночному', 'расовым': 'гоночным',
    'расовую': 'гоночную', 'расовом': 'гоночном',
}

MANAGER_FORMS = {
    'управляющий': 'менеджер', 'управляющего': 'менеджера', 'управляющему': 'менеджеру',
    'управляющим': 'менеджером', 'управляющие': 'менеджеры', 'управляющих': 'менеджеров',
    'руководители': 'менеджеры', 'руководитель': 'менеджер',
}

FREE_AGENT_PATTERNS = [
    (r'свободный агент', 'свободный гонщик'),
    (r'свободного агента', 'свободного гонщика'),
    (r'свободному агенту', 'свободному гонщику'),
    (r'свободным агентом', 'свободным гонщиком'),
    (r'свободные агенты', 'свободные гонщики'),
    (r'свободных агентов', 'свободных гонщиков'),
    (r'свободным агентам', 'свободным гонщикам'),
    (r'свободными агентами', 'свободными гонщиками'),
]

GENERAL_REPLACEMENTS = [
    (r'управление велосипедом', 'управление велокомандой'),
    (r'управления велосипедом', 'управления велокомандой'),
    (r'велосипедное управление', 'веломенеджмент'),
    (r'велосипедный менеджмент', 'веломенеджмент'),
    (r'тренировочный лагерь', 'тренировочный сбор'),
    (r'тренировочного лагеря', 'тренировочного сбора'),
    (r'тренировочные лагеря', 'тренировочные сборы'),
    (r'тренировочных лагерей', 'тренировочных сборов'),
    (r'премиальные', 'Premium'),
    (r'премиальный', 'Premium'),
    (r'премиального', 'Premium'),
    (r'монеты', 'Coins'),
    (r'монетами', 'Coins'),
    (r'монетах', 'Coins'),
    (r'монет', 'Coins'),
]

PATH_OVERRIDES = {
    'appShell.json.rollover.title': 'Подготовка сезона {{season}}',
    'calendarPage.json.races.raceCount': '{{count}} гонок в этом сезоне',
    'calendarPage.json.races.raceCountOne': '{{count}} гонка в этом сезоне',
    'home.json.beta.title': 'ProPeloton Manager сейчас находится на этапе бета-тестирования.',
    'home.json.beta.discord': 'Связаться с нами в Discord',
    'home.json.features.racesDescription': 'Выбирайте моменты для атак, контролируйте отрывы и реализуйте тактику, способную принести победу на этапе.',
    'home.json.guide.headline': 'Узнайте, что предлагает ProPeloton Manager, прежде чем присоединиться.',
    'home.json.footer.description': 'Premium онлайн-веломенеджер от Next Quest Studio. Создавайте команду, управляйте гонщиками, готовьтесь к гонкам, следите за рейтингами и развивайте клуб на протяжении живого велосипедного сезона.',
    'finance.json.sponsors.stageWin': 'Победа на этапе',
    'finance.json.sponsors.previewStageWinTitle': '{{race}}: победа на этапе',
    'notifications.json.categories.stagePlanReminders': 'Напоминания Stage Plan',
    'notifications.json.sportDirector.missingStagePlans': 'Отсутствующие Stage Plans',
    'notifications.json.sportDirector.incompleteStagePlans': 'Неполные Stage Plans',
    'notifications.json.sportDirector.missingPlans': 'Отсутствующие или неполные Stage Plans',
    'notifications.json.reportVariants.stage_plans_missing': 'Отсутствующие Stage Plans',
    'preferences.json.groups.stagePlanReminders.label': 'Напоминания Stage Plan',
    'racePreparation.json.errors.quote': 'Не удалось рассчитать Race Plan.',
    'racePreparation.json.errors.save': 'Не удалось сохранить Race Plan.',
    'racePreparation.json.errors.submit': 'Не удалось отправить Race Plan.',
    'racePreparation.json.stagePlans.selectStage': 'Выберите этап для подготовки Stage Plan.',
    'training.json.campTags.premium': 'Premium',
    'transfers.json.history.freeAgentMarket': 'Рынок свободных гонщиков',
    'manual.json.sections.race-plan-deep.title': 'Подробное руководство по Race Plan',
    'manual.json.sections.stage-plan-deep.title': 'Подробное руководство по Stage Plans',
}


def _replace_forms(text: str, forms: dict[str, str]) -> str:
    # Longest first prevents a shorter form from corrupting a longer inflection.
    for old, new in sorted(forms.items(), key=lambda item: len(item[0]), reverse=True):
        text = re.sub(rf'(?<!\w){re.escape(old)}(?!\w)', new, text, flags=re.I)
    return text


def improve(source: str, target: str, path: str) -> str:
    if path in PATH_OVERRIDES:
        return PATH_OVERRIDES[path]
    out = target
    low = source.lower()
    if re.search(r'\briders?\b', low):
        out = _replace_forms(out, RIDER_FORMS)
    if re.search(r'\bstages?\b', low):
        out = _replace_forms(out, STAGE_FORMS)
    if re.search(r'\braces?\b', low):
        out = _replace_forms(out, RACE_FORMS)
    if re.search(r'\bmanagers?\b', low) and not re.search(r'\badmins?|administrators?\b', low):
        out = _replace_forms(out, MANAGER_FORMS)
    if re.search(r'\bfree agents?\b', low):
        for old, new in FREE_AGENT_PATTERNS:
            out = re.sub(rf'(?<!\w){old}(?!\w)', new, out, flags=re.I)
    for old, new in GENERAL_REPLACEMENTS:
        out = re.sub(old, new, out, flags=re.I)
    out = re.sub(r'\s+([,.;:!?])', r'\1', out)
    out = re.sub(r' {2,}', ' ', out)
    return out


def transform(source: Any, target: Any, path: str, stats: dict[str, int]) -> Any:
    if isinstance(source, dict) and isinstance(target, dict):
        return {key: transform(source[key], target[key], f'{path}.{key}' if path else key, stats) for key in source}
    if isinstance(source, list) and isinstance(target, list):
        return [transform(a, b, f'{path}[{i}]', stats) for i, (a, b) in enumerate(zip(source, target))]
    if isinstance(source, str) and isinstance(target, str):
        new = improve(source, target, path)
        if sorted(PH.findall(source)) != sorted(PH.findall(new)):
            return target
        if new != target:
            stats['strings'] += 1
        return new
    return target


def main() -> None:
    base.main()
    stats = {'strings': 0}
    changed_files = 0
    for en_path in sorted(EN_DIR.glob('*.json')):
        ru_path = RU_DIR / en_path.name
        if not ru_path.exists():
            continue
        source = json.loads(en_path.read_text(encoding='utf-8'))
        target = json.loads(ru_path.read_text(encoding='utf-8'))
        before = json.dumps(target, ensure_ascii=False)
        polished = transform(source, target, en_path.name, stats)
        after = json.dumps(polished, ensure_ascii=False)
        if before != after:
            ru_path.write_text(json.dumps(polished, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed_files += 1
    print(f'Russian quality v2 changed {stats["strings"]} additional strings across {changed_files} files.')


if __name__ == '__main__':
    main()
