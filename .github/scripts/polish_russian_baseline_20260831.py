from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
RU_DIR = ROOT / 'src/i18n/locales/ru'
PH = re.compile(r'\{\{[^{}]+\}\}')

SOURCE_OVERRIDES: dict[str, str] = {
    '{{race}} · Stage {{stage}}': '{{race}} · Этап {{stage}}',
    'Stage results – Stage {{stage}}': 'Результаты этапа — этап {{stage}}',
    'Startlist & Stage Plans': 'Startlist и Stage Plans',
    'Activate Developing Team — {{cost}} Coins': 'Активировать Developing Team — {{cost}} Coins',
    'You need {{cost}} coins to activate Developing Team access. Current balance: {{balance}} coins.': 'Для активации Developing Team требуется {{cost}} Coins. Текущий баланс: {{balance}} Coins.',
    'Free and Premium players can purchase additional coins for optional features and expansions. Buying coins does not activate Premium membership.': 'Игроки с бесплатным аккаунтом и Premium могут покупать дополнительные Coins для необязательных функций и расширений. Покупка Coins не активирует Premium.',
    'Team-level stage setup: 1–4 bidons per rider.': 'Настройка этапа для команды: 1–4 фляги на гонщика.',
    'Team-level stage setup: 0–4 gels per rider.': 'Настройка этапа для команды: 0–4 энергетических геля на гонщика.',
    'Team-level stage setup: 0–2 nutrition packs per rider.': 'Настройка этапа для команды: 0–2 набора питания на гонщика.',
    'Durable reusable item. Each jacket has 25 stage uses. One use is counted whenever the jacket is assigned/used for a stage.': 'Многоразовый предмет. Каждая куртка рассчитана на 25 этапов. Одно использование списывается каждый раз, когда куртка назначена или используется на этапе.',
    'Missing jersey kit: blocks stage setup': 'Нет гоночной формы: настройка этапа заблокирована',
    '{{name}} stage plan rule': 'Правило Stage Plan для {{name}}',
    'Bidons use 1–4 per rider in stage setup. They are one-use consumables and support hydration and fatigue control. Below minimum can increase fatigue risk.': 'На этапе используется 1–4 фляги на гонщика. Это одноразовый расходник, который помогает поддерживать гидратацию и контролировать усталость. Количество ниже минимума повышает риск усталости.',
    'Energy Gels use 0–4 per rider. They support stamina and final effort efficiency. There is no extra benefit after four gels per rider.': 'На гонщика можно использовать 0–4 энергетических геля. Они поддерживают выносливость и эффективность финального усилия. Более четырёх гелей на гонщика дополнительного эффекта не дают.',
    'Nutrition Packs use 0–2 per rider. They support stamina stability and post-stage recovery. Long stages without nutrition can increase fatigue pressure.': 'На гонщика можно использовать 0–2 набора питания. Они помогают сохранять выносливость и восстанавливаться после этапа. Длинные этапы без питания могут усиливать усталость.',
    'Open Finance → Transactions.': 'Откройте Финансы → Транзакции.',
    'Stage Race': 'Многодневная гонка',
    'Accepted Races': 'Принятые гонки',
    'All Races': 'Все гонки',
    'Last 5 Races': 'Последние 5 гонок',
    'Races used': 'Учитываемые гонки',
    'Rider / Team': 'Гонщик / Команда',
    'Best young rider': 'Лучший молодой гонщик',
    'Race Supplies': 'Гоночное питание и расходники',
    'Race day updates': 'Обновления в день гонки',
}

PATH_OVERRIDES: dict[str, str] = {
    'common.json.language.applicationLanguage': 'Язык приложения',
    'common.json.language.description': 'Выберите язык интерфейса ProPeloton Manager.',
    'common.json.actions.skipTutorial': 'Пропустить обучение',
    'profile.json.dropdown.signedInAs': 'Вы вошли как',
    'home.json.hero.titleLine1': 'Создайте свою велосипедную легенду.',
    'home.json.hero.titleLine2': 'Управляйте командой.',
    'home.json.hero.titleLine3': 'Доминируйте в сезоне.',
    'home.json.hero.description': 'ProPeloton Manager — это онлайн-игра о менеджменте велокоманды: создавайте клуб, развивайте гонщиков, планируйте календарь гонок, ведите трансферные переговоры и соревнуйтесь с реальными менеджерами в сезонном велосипедном мире.',
    'home.json.stats.activeManagers': 'Активные менеджеры',
    'home.json.features.squadTitle': 'Глубокое управление составом',
    'home.json.features.racesTitle': 'Тактические гонки',
    'home.json.features.marketTitle': 'Рынок и трансферы',
    'home.json.guide.howTitle': 'Как играть?',
    'home.json.guide.preparationTitle': 'Почему подготовка важна?',
    'home.json.reviews.title': 'Отзывы игроков',
    'home.json.cta.title': 'Готовы построить свою династию?',
    'navigation.json.subtitle': 'Многопользовательский веломенеджер',
    'navigation.json.descriptions.overview': 'Сводка клуба и последние обновления',
    'navigation.json.descriptions.squad': 'Управление гонщиками и составом',
    'navigation.json.descriptions.racePreparation': 'Startlist, логистика и Stage Plans',
    'navigation.json.header.manager': 'Менеджер',
    'accountPages.json.profile.languageTitle': 'Язык игры',
    'accountPages.json.profile.languageSelect': 'Выберите язык',
    'accountPages.json.profile.languageActive': 'Активен',
    'accountPages.json.inbox.title': 'Сообщения',
    'equipment.json.presets.description': 'Сохраните до четырёх предпочитаемых комплектов снаряжения. Вместимость показывает, сколько гонщиков могут использовать именно этот комплект на одном этапе.',
    'raceDetail.json.report.ridersUnknown': 'Неизвестные гонщики',
    'preferences.json.advisorCategories.startlistStagePlans.label': 'Startlist и Stage Plans',
}


def has(source: str, value: str) -> bool:
    return re.search(rf'(?<!\w){re.escape(value)}(?!\w)', source, re.I) is not None


def canonicalize_protected(source: str, target: str) -> str:
    groups = [
        ('Race Plans', [r'планы?\s+гонок?', r'гоночные\s+планы?']),
        ('Race Plan', [r'план\s+гонки', r'гоночный\s+план']),
        ('Stage Plans', [r'планы?\s+этапов?', r'этапные\s+планы?']),
        ('Stage Plan', [r'план\s+этапа', r'этапный\s+план']),
        ('Startlist', [r'старт[- ]?лист', r'стартовый\s+список', r'список\s+участников']),
        ('Race Engine', [r'движок\s+гонки', r'гоночный\s+движок', r'механизм\s+гонки']),
        ('Replay Engine', [r'движок\s+повтора', r'движок\s+реплея', r'механизм\s+повтора']),
        ('Team Policy', [r'политика\s+команды', r'командная\s+политика']),
        ('Race Sharpness', [r'гоночная\s+резкость', r'резкость\s+гонки', r'гоночная\s+готовность']),
    ]
    for protected, patterns in groups:
        if has(source, protected) and not has(target, protected):
            for pattern in patterns:
                if re.search(pattern, target, re.I):
                    target = re.sub(pattern, protected, target, count=1, flags=re.I)
                    break
    return target


def lexical_repair(source: str, target: str) -> str:
    low = source.lower()
    if re.search(r'\briders?\b', low):
        pairs = [
            (r'\bвсадники\b', 'гонщики'), (r'\bвсадник\b', 'гонщик'),
            (r'\bрайдеры\b', 'гонщики'), (r'\bрайдер\b', 'гонщик'),
            (r'\bводители\b', 'гонщики'), (r'\bводитель\b', 'гонщик'),
        ]
        for pat, repl in pairs: target = re.sub(pat, repl, target, flags=re.I)
    if re.search(r'\braces?\b', low):
        target = re.sub(r'\bрасы\b', 'гонки', target, flags=re.I)
        target = re.sub(r'\bраса\b', 'гонка', target, flags=re.I)
    if re.search(r'\bstages?\b', low):
        target = re.sub(r'\bсцены\b', 'этапы', target, flags=re.I)
        target = re.sub(r'\bсцена\b', 'этап', target, flags=re.I)
        target = re.sub(r'\bстадии\b', 'этапы', target, flags=re.I)
        target = re.sub(r'\bстадия\b', 'этап', target, flags=re.I)
    if re.search(r'\bfree agents?\b', low):
        target = re.sub(r'\bсвободные\s+агенты\b', 'свободные гонщики', target, flags=re.I)
        target = re.sub(r'\bсвободный\s+агент\b', 'свободный гонщик', target, flags=re.I)
    if re.search(r'\bsav(?:e|es|ed|ing)\b', low):
        target = re.sub(r'\bэкономить\b', 'сохранить', target, flags=re.I)
        target = re.sub(r'\bсэкономить\b', 'сохранить', target, flags=re.I)
    if re.search(r'\btime trial\b', low):
        target = re.sub(r'\bиспытани[ея]\s+временем\b', 'гонка с раздельным стартом', target, flags=re.I)
        target = re.sub(r'\bгонка\s+на\s+время\b', 'гонка с раздельным стартом', target, flags=re.I)
    if re.search(r'\bmanagers?\b', low) and not re.search(r'\badmins?|administrators?\b', low):
        target = re.sub(r'\bуправляющие\b', 'менеджеры', target, flags=re.I)
        target = re.sub(r'\bуправляющий\b', 'менеджер', target, flags=re.I)
    return target


def polish_string(source: str, target: str, path: str) -> str:
    if path in PATH_OVERRIDES: return PATH_OVERRIDES[path]
    if source in SOURCE_OVERRIDES: return SOURCE_OVERRIDES[source]
    out = canonicalize_protected(source, target)
    out = lexical_repair(source, out)
    out = re.sub(r'\s+([,.;!?])', r'\1', out)
    out = re.sub(r' {2,}', ' ', out)
    return out


def transform(source: Any, target: Any, path: str, stats: dict[str, int]) -> Any:
    if isinstance(source, dict) and isinstance(target, dict):
        return {key: transform(source[key], target[key], f'{path}.{key}' if path else key, stats) for key in source}
    if isinstance(source, list) and isinstance(target, list):
        return [transform(a, b, f'{path}[{i}]', stats) for i, (a, b) in enumerate(zip(source, target))]
    if isinstance(source, str) and isinstance(target, str):
        new = polish_string(source, target, path)
        if sorted(PH.findall(source)) != sorted(PH.findall(new)): return target
        if new != target: stats['strings'] += 1
        return new
    return target


def main() -> None:
    changed_files = 0
    stats = {'strings': 0}
    for en_path in sorted(EN_DIR.glob('*.json')):
        ru_path = RU_DIR / en_path.name
        if not ru_path.exists(): continue
        source = json.loads(en_path.read_text(encoding='utf-8'))
        target = json.loads(ru_path.read_text(encoding='utf-8'))
        before = json.dumps(target, ensure_ascii=False, sort_keys=False)
        polished = transform(source, target, en_path.name, stats)
        after = json.dumps(polished, ensure_ascii=False, sort_keys=False)
        if before != after:
            ru_path.write_text(json.dumps(polished, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed_files += 1
    print(f'Russian terminology polish changed {stats["strings"]} strings across {changed_files} files.')


if __name__ == '__main__':
    main()
