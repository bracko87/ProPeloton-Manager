from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
RU_DIR = ROOT / 'src/i18n/locales/ru'
PH = re.compile(r'\{\{[^{}]+\}\}')

# Exact human-reviewed fixes for the final blocker set reported by the strict Russian
# completion audit. These run after the broad terminology passes, so machine output
# cannot overwrite them later in the same workflow.
OVERRIDES: dict[tuple[str, tuple[str | int, ...]], str] = {
    ('customizeTeam.json', ('logo', 'fileHelp')):
        'JPG, PNG или WEBP. Загруженные логотипы сохраняются в формате PNG. Максимальный размер файла: 2 МБ.',
    ('customizeTeam.json', ('logo', 'invalidType')):
        'Разрешены только изображения JPG, PNG или WEBP.',
    ('customizeTeam.json', ('jersey', 'fileRules')):
        'Изображения по URL могут иметь любой размер и настраиваются в области предпросмотра. Для загрузки разрешены JPG, PNG или WEBP: максимум 2 МБ и 512 × 512 пикселей.',
    ('customizeTeam.json', ('jersey', 'invalidType')):
        'Для формы разрешены только изображения JPG, PNG или WEBP.',
    ('equipment.json', ('inventory', 'reminderSaved')):
        'Напоминание о техобслуживании сохранено для состояния {{threshold}}%.',
    ('equipment.json', ('supplies', 'jerseyStage')):
        'Обязательно в Stage Plans. Для каждого выбранного гонщика требуется один комплект гоночной формы.',
    ('help.json', ('manual', 'menuText')):
        'Используйте меню в правом верхнем углу для настроек профиля, помощи, предпочтений, Discord, страницы связи с нами, пакетов Coins и приглашения друзей. Уведомления показывают важные сроки и игровые действия.',
    ('help.json', ('faq', 'a10')):
        'Команды получают международные очки за результаты в гонках. Уровни WorldTeam, ProTeam и Continental определяют путь клуба, а итоговый рейтинг может привести к повышению или понижению.',
    ('home.json', ('beta', 'body')):
        'Игра всё ещё тестируется и улучшается. Если вы хотите стать бета-тестером и помочь нам проверить ProPeloton Manager, сначала свяжитесь с нами в Discord — мы сообщим следующие шаги.',
    ('home.json', ('guide', 'howText')):
        'Менеджеры формируют состав, изучают календарь, подают заявки на подходящие гонки, готовят Race Plans, выбирают гонщиков, назначают роли, управляют запасами и следят за результатами. Хорошие решения учитывают навыки гонщиков, усталость, мораль, Race Sharpness, погоду, бюджет и этап сезона.',
    ('home.json', ('footer', 'copyright')):
        '© ProPeloton Manager. Все права защищены Next Quest Studio.',
    ('infrastructure.json', ('facilityUpgrades', 'youth_academy', 'level1', 'effect')):
        'Открывает специализированную поддержку подготовки гонщиков U23.',
    ('manual.json', ('sections', 'race-supplies', 'details', 3)):
        'Комплект гоночной формы обязателен в Stage Plans. Если комплект формы отсутствует, подготовка этапа может быть заблокирована.',
    ('manual.json', ('sections', 'team-ranking', 'facts', 0, 'value')):
        'WorldTeam, ProTeam, Continental, любительский уровень',
    ('manual.json', ('sections', 'stage-roles-deep', 'details', 5)):
        'При назначении ролей учитывайте также усталость, мораль, здоровье и Race Sharpness, а не только базовые навыки.',
    ('manual.json', ('sections', 'stage-roles-deep', 'facts', 0, 'value')):
        'Защищённый гонщик для цели GC или победы на этапе',
    ('manualCore.json', ('sections', 'raceSupplies', 'details', 3)):
        'Комплект гоночной формы обязателен в Stage Plans. Если комплект формы отсутствует, подготовка этапа может быть заблокирована.',
    ('manualCore.json', ('sections', 'teamRanking', 'facts', 1)):
        'WorldTeam, ProTeam, Continental, любительский уровень',
    ('manualDeepB1.json', ('sections', 'facilitiesOverviewDeep', 'details', 3)):
        'Молодёжная академия поддерживает развитие гонщиков U23.',
    ('manualDeepB2.json', ('sections', 'rankingTiersDeep', 'facts', 1)):
        'WorldTeam, ProTeam, Continental, любительский уровень',
    ('manualLegacyDynamic.json', ('category', 'default')):
        '{{title}} — связанная часть ProPeloton Manager. Сначала прочитайте обзор страницы, затем проверьте её состояние, требования, расходы, сроки и связанные разделы, прежде чем принимать решение.',
    ('publicInfo.json', ('about', 'what2')):
        'Игровой мир включает календари, рейтинги команд, подготовку к гонкам, Stage Plans, финансы, трансферы, тренировки и развитие клуба. Каждый клуб должен сочетать спортивные амбиции с долгосрочной стабильностью.',
    ('publicInfo.json', ('privacy', 's3Title')):
        '3. Платежи, Premium и Coins',
    ('publicInfo.json', ('privacy', 's3p1')):
        'ProPeloton Manager может предлагать Premium и покупки Coins. Платежи обрабатываются внешними платёжными провайдерами, например Stripe. Мы не храним полные номера банковских карт или коды безопасности на собственных серверах.',
    ('publicInfo.json', ('privacy', 's9p1')):
        'Мы применяем технические и организационные меры для защиты данных аккаунта, игры, Premium и транзакций. Ни один онлайн-сервис не может гарантировать абсолютную безопасность, но мы работаем над тем, чтобы игра оставалась надёжной и безопасной.',
    ('publicInfo.json', ('terms', 's1p1')):
        'Создавая аккаунт, используя ProPeloton Manager, покупая Coins или оформляя Premium, вы соглашаетесь с настоящими условиями. Если вы не согласны с ними, не используйте игру.',
    ('publicInfo.json', ('terms', 's5p2')):
        'Пакеты Coins — это необязательные разовые покупки через внешнего платёжного провайдера, например Stripe. Покупка Coins не активирует Premium.',
    ('racePreparation.json', ('racePlan', 'u23PlanHelp')):
        'Главный тренер U23 автоматически подготавливает Stage Plans. Эти планы доступны только для просмотра, пока вы не переключите тактическое планирование обратно на спортивного директора.',
    ('transfers.json', ('intelligence', 'premiumLimit')):
        'Premium: до {{limit}} сохранённых поисков',
    ('transfers.json', ('negotiationIntelligence', 'availablePremium')):
        'Доступно только с Premium. Базовые принципы переговоров по-прежнему доступны всем пользователям.',
    ('tutorials.json', ('overview', 'welcomeGame', 'body')):
        'Добро пожаловать в ProPeloton Manager!\n\nТеперь вы менеджер собственной велокоманды. Ваша задача — строить клуб, развивать гонщиков, готовиться к гонкам, управлять финансами, усиливать команду и вести клуб через весь сезон.',
    ('tutorials.json', ('racePreparation', 'welcome', 'body')):
        'Здесь мы покажем, как работают принятые гонки, Race Plans и Stage Plans. Это одна из самых важных страниц в течение сезона.',
    ('tutorials.json', ('menu', 'coins', 'body')):
        'Здесь отображается текущий баланс Coins.\n\nCoins используются для отдельных игровых функций, разблокировок и удобных опций внутри ProPeloton Manager.\n\nБаланс можно проверить в любое время, а дополнительные Coins приобрести через Меню → Pro Packages.\n\nНизкий баланс Coins не блокирует аккаунт. Вы можете продолжать играть, но некоторые необязательные функции или возможности Premium будут недоступны, пока баланс не будет пополнен.',
}


def get_value(data: Any, path: tuple[str | int, ...]) -> Any:
    node = data
    for part in path:
        node = node[part]
    return node


def set_value(data: Any, path: tuple[str | int, ...], value: str) -> None:
    node = data
    for part in path[:-1]:
        node = node[part]
    node[path[-1]] = value


def main() -> None:
    by_file: dict[str, list[tuple[tuple[str | int, ...], str]]] = {}
    for (filename, path), value in OVERRIDES.items():
        by_file.setdefault(filename, []).append((path, value))

    changed = 0
    for filename, entries in sorted(by_file.items()):
        en_path = EN_DIR / filename
        ru_path = RU_DIR / filename
        if not en_path.exists() or not ru_path.exists():
            raise RuntimeError(f'Missing locale file for final Russian polish: {filename}')

        source = json.loads(en_path.read_text(encoding='utf-8'))
        target = json.loads(ru_path.read_text(encoding='utf-8'))
        file_changed = False

        for path, value in entries:
            source_value = get_value(source, path)
            if not isinstance(source_value, str):
                raise RuntimeError(f'Expected English string at {filename}:{path}')
            if sorted(PH.findall(source_value)) != sorted(PH.findall(value)):
                raise RuntimeError(
                    f'Placeholder mismatch in final Russian override {filename}:{path}: '
                    f'{PH.findall(source_value)} != {PH.findall(value)}'
                )
            current = get_value(target, path)
            if current != value:
                set_value(target, path, value)
                changed += 1
                file_changed = True

        if file_changed:
            ru_path.write_text(json.dumps(target, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'Final Russian blocker polish applied {changed} reviewed string fixes.')


if __name__ == '__main__':
    main()
