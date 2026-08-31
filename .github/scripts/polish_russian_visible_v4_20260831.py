from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
RU_DIR = ROOT / 'src/i18n/locales/ru'
PH = re.compile(r'\{\{[^{}]+\}\}')

OVERRIDES: dict[tuple[str, tuple[str, ...]], str] = {
    # Common / forum
    ('common.json', ('forum','movingTitle')): 'Обсуждения сообщества в Discord',
    ('common.json', ('forum','movingText')): 'Внутриигрового форума на этой странице не будет. Для общения используйте наш канал Discord.',
    ('common.json', ('forum','joinHint')): 'Присоединяйтесь к нашему серверу Discord с помощью кнопки ниже.',
    ('common.json', ('forum','community')): 'Сообщество Discord',
    ('common.json', ('forum','joinTitle')): 'Присоединяйтесь к нашему серверу Discord',
    ('common.json', ('forum','joinText')): 'Общайтесь с другими игроками, задавайте вопросы, получайте помощь по игре и следите за последними новостями.',
    ('common.json', ('forum','join')): 'Присоединиться к Discord',

    # Profile dropdown
    ('profile.json', ('preferences','languageSectionDescription')): 'Выберите язык интерфейса ProPeloton Manager.',
    ('profile.json', ('dropdown','menu')): 'Меню профиля',

    # Inbox
    ('accountPages.json', ('inbox','subtitle')): 'Личные беседы и сообщения.',
    ('accountPages.json', ('inbox','unreadMessages')): 'Непрочитанные сообщения',
    ('accountPages.json', ('inbox','conversations')): 'Диалоги',
    ('accountPages.json', ('inbox','readConversations')): 'Прочитанные диалоги',
    ('accountPages.json', ('inbox','search')): 'Поиск диалогов...',
    ('accountPages.json', ('inbox','loadingConversations')): 'Загрузка диалогов...',
    ('accountPages.json', ('inbox','noAuth')): 'Для этой страницы не найден авторизованный пользователь.',
    ('accountPages.json', ('inbox','noFound')): 'Диалоги не найдены.',
    ('accountPages.json', ('inbox','noAccount')): 'Для этого аккаунта пока нет диалогов.',
    ('accountPages.json', ('inbox','noneSelected')): 'Диалог не выбран',
    ('accountPages.json', ('inbox','chooseThread')): 'Выберите диалог слева.',
    ('accountPages.json', ('inbox','openHere')): 'Когда диалог появится слева, откройте его здесь.',
    ('accountPages.json', ('inbox','directConversation')): 'Личный диалог',
    ('accountPages.json', ('inbox','adminThread')): 'Сообщение администрации',
    ('accountPages.json', ('inbox','readOnly')): 'Только для чтения',
    ('accountPages.json', ('inbox','newDirect')): 'Новый личный диалог',
    ('accountPages.json', ('inbox','newDirectTeam')): 'Новый личный диалог • Команда: {{team}}',
    ('accountPages.json', ('inbox','newConversation')): 'Новый диалог',
    ('accountPages.json', ('inbox','firstMessage')): 'Первое сообщение начнёт личный диалог с',
    ('accountPages.json', ('inbox','write')): 'Напишите сообщение...',
    ('accountPages.json', ('inbox','writeTo')): 'Написать {{name}}...',
    ('accountPages.json', ('inbox','sending')): 'Отправляем...',
    ('accountPages.json', ('inbox','adminNoReplies')): 'Это сообщение администрации. Ответы отключены.',
    ('accountPages.json', ('inbox','loadConversationsFailed')): 'Не удалось загрузить диалоги.',
    ('accountPages.json', ('inbox','signInRequired')): 'Войдите в систему, чтобы открыть сообщения.',
    ('accountPages.json', ('inbox','initializeFailed')): 'Не удалось открыть сообщения.',

    # My Profile
    ('accountPages.json', ('profile','displayName')): 'Имя пользователя',
    ('accountPages.json', ('profile','displayNamePlaceholder')): 'Имя пользователя',
    ('accountPages.json', ('profile','displayNameHelp')): 'От 3 до 24 символов: буквы, цифры и подчёркивания. Пробелы будут заменены подчёркиваниями.',
    ('accountPages.json', ('profile','birthdayHelp')): 'Дата рождения задаётся при регистрации и позже изменить её нельзя. В день рождения вы получаете 10 Coins.',
    ('accountPages.json', ('profile','notSet')): 'Не указано',
    ('accountPages.json', ('profile','saving')): 'Сохраняем...',
    ('accountPages.json', ('profile','passwordDescription')): 'Для безопасности смена пароля подтверждается по электронной почте. Мы отправим ссылку для сброса пароля на ваш текущий адрес.',
    ('accountPages.json', ('profile','noEmail')): 'Адрес электронной почты не найден',
    ('accountPages.json', ('profile','sendingEmail')): 'Отправляем письмо...',
    ('accountPages.json', ('profile','sendPasswordEmail')): 'Отправить письмо для смены пароля',
    ('accountPages.json', ('profile','passwordHelp')): 'Откройте ссылку из письма, чтобы задать новый пароль на странице сброса.',
    ('accountPages.json', ('profile','displayNameLength')): 'Имя пользователя должно содержать от 3 до 24 символов.',
    ('accountPages.json', ('profile','saved')): 'Профиль успешно сохранён.',
    ('accountPages.json', ('profile','savedEmail')): 'Профиль сохранён. Если подтверждение электронной почты включено, подтвердите новый адрес.',
    ('accountPages.json', ('profile','resetEmailMissing')): 'Не найден адрес электронной почты для сброса пароля.',
    ('accountPages.json', ('profile','resetSent')): 'Письмо для сброса пароля отправлено на {{email}}. Проверьте входящие и папку «Спам», затем перейдите по ссылке и задайте новый пароль.',
    ('accountPages.json', ('profile','resetFailed')): 'Не удалось отправить письмо для сброса пароля. Попробуйте ещё раз.',
    ('accountPages.json', ('profile','languageDescription')): 'Выберите язык интерфейса игры и уведомлений для этого аккаунта.',
    ('accountPages.json', ('profile','languageSaving')): 'Сохраняем язык...',
    ('accountPages.json', ('profile','languageAccountHelp')): 'Настройка сохраняется в аккаунте и будет использоваться на других устройствах и при следующих входах.',
    ('accountPages.json', ('profile','languageSaved')): 'Язык игры изменён на {{language}}.',
    ('accountPages.json', ('profile','languageSaveFailed')): 'Не удалось сохранить язык игры. Попробуйте ещё раз.',

    # Invite Friends
    ('accountPages.json', ('invite','title')): 'Пригласить друзей',
    ('accountPages.json', ('invite','subtitle')): 'Приглашайте друзей и получите 40 Coins, когда они создадут клуб и купят свой первый пакет Coins.',
    ('accountPages.json', ('invite','linkDescription')): 'Когда друг создаст клуб и купит первый пакет Coins, вы получите 40 Coins.',
    ('accountPages.json', ('invite','referralAria')): 'Реферальная ссылка',
    ('accountPages.json', ('invite','copied')): 'Скопировано!',
    ('accountPages.json', ('invite','share')): 'Поделиться',
    ('accountPages.json', ('invite','copySuccess')): 'Ссылка-приглашение скопирована.',
    ('accountPages.json', ('invite','copyFailed')): 'Не удалось скопировать ссылку. Скопируйте её вручную.',
    ('accountPages.json', ('invite','shareTitle')): 'Присоединяйтесь ко мне в ProPeloton Manager',
    ('accountPages.json', ('invite','shareText')): 'Используйте мою ссылку-приглашение, чтобы присоединиться к игре:',
    ('accountPages.json', ('invite','shareFallback')): 'На этом устройстве функция «Поделиться» недоступна, поэтому ссылка скопирована.',
    ('accountPages.json', ('invite','activityTitle')): 'Реферальная активность',
    ('accountPages.json', ('invite','activityDescription')): 'Здесь отображается статус приглашённых друзей и получение награды 40 Coins после их первой покупки пакета Coins.',
    ('accountPages.json', ('invite','loadingActivity')): 'Загрузка реферальной активности...',
    ('accountPages.json', ('invite','noActivity')): 'Приглашённых друзей пока нет. Поделитесь своей ссылкой, чтобы получить награду 40 Coins.',
    ('accountPages.json', ('invite','pending')): 'ожидает',
    ('accountPages.json', ('invite','completed')): 'завершено',
    ('accountPages.json', ('invite','pendingDescription')): 'Друг создал клуб; ожидается первая покупка пакета Coins.',
    ('accountPages.json', ('invite','completedDescription')): 'Друг купил первый пакет Coins. Награда начислена.',
    ('accountPages.json', ('invite','rejectedDescription')): 'Реферальное приглашение не удалось завершить.',
    ('accountPages.json', ('invite','referredUser')): 'Приглашённый пользователь',
    ('accountPages.json', ('invite','referredClub')): 'Приглашённый клуб',
    ('accountPages.json', ('invite','notLinked')): 'Ещё не привязан',
    ('accountPages.json', ('invite','how')): 'Как это работает',
    ('accountPages.json', ('invite','step1')): 'Скопируйте или поделитесь своей личной ссылкой-приглашением.',
    ('accountPages.json', ('invite','step2')): 'Друг открывает ссылку, регистрируется и создаёт клуб.',
    ('accountPages.json', ('invite','step3')): 'Когда друг покупает первый пакет Coins, вы получаете 40 Coins.',
    ('accountPages.json', ('invite','signIn')): 'Войдите в систему, чтобы увидеть свою ссылку-приглашение.',
    ('accountPages.json', ('invite','loadCodeFailed')): 'Не удалось загрузить реферальный код.',
    ('accountPages.json', ('invite','missingCode')): 'Реферальный код отсутствует.',
    ('accountPages.json', ('invite','loadLinkFailed')): 'Сейчас не удалось загрузить ссылку-приглашение.',
    ('accountPages.json', ('invite','loadActivityFailed')): 'Сейчас не удалось загрузить реферальную активность.',

    # Account forum duplicate
    ('accountPages.json', ('forum','noticeTitle')): 'Обсуждения сообщества в Discord',
    ('accountPages.json', ('forum','notice')): 'Внутриигрового форума на этой странице не будет. Для общения используйте наш канал Discord.',
    ('accountPages.json', ('forum','noticeHelp')): 'Присоединяйтесь к нашему серверу Discord с помощью кнопки ниже.',
    ('accountPages.json', ('forum','discordCommunity')): 'Сообщество Discord',
    ('accountPages.json', ('forum','discordTitle')): 'Присоединяйтесь к нашему серверу Discord',
    ('accountPages.json', ('forum','discordDescription')): 'Общайтесь с другими игроками, задавайте вопросы, получайте помощь по игре и следите за последними новостями.',
    ('accountPages.json', ('forum','joinDiscord')): 'Присоединиться к Discord',

    # Create Team
    ('createClub.json', ('page','subtitle')): 'Оформите свою команду и войдите в мир ProPeloton Manager.',
    ('createClub.json', ('page','teamNamePlaceholder')): 'Например, Horizon Racing',
    ('createClub.json', ('page','mottoPlaceholder')): 'Например, Вместе к победе',
    ('createClub.json', ('page','creating')): 'Создаём...',
    ('createClub.json', ('page','chooseJerseyFirst')): 'Сначала выберите форму команды.',
    ('createClub.json', ('page','backgroundAlt')): 'Фон с велогонщиками',
    ('createClub.json', ('jersey','title')): 'Форма команды',
    ('createClub.json', ('jersey','description')): 'Выберите комплект формы, чтобы продолжить создание команды. Позже его можно изменить в настройках команды.',
    ('createClub.json', ('jersey','scrollLeft')): 'Прокрутить комплекты влево',
    ('createClub.json', ('jersey','scrollRight')): 'Прокрутить комплекты вправо',
    ('createClub.json', ('jersey','select')): 'Выбрать комплект {{index}}',
    ('createClub.json', ('jersey','alt')): 'Вариант формы команды {{index}}',
    ('createClub.json', ('jersey','required')): 'Для создания команды необходимо выбрать форму.',
    ('createClub.json', ('preview','description')): 'Предпросмотр эмблемы и цветов обновляется сразу.',
    ('createClub.json', ('patterns','title')): 'Стиль эмблемы',
    ('createClub.json', ('patterns','description')): 'Выберите расположение основного и дополнительного цветов.',
    ('createClub.json', ('patterns','customDescription')): 'Эти стили применяются только к сгенерированной эмблеме команды.',
    ('createClub.json', ('patterns','select')): 'Выбрать стиль {{pattern}}',
    ('createClub.json', ('patterns','solid')): 'Однотонный',
    ('createClub.json', ('patterns','band')): 'Полоса',
    ('createClub.json', ('patterns','doubleBand')): 'Двойная полоса',
    ('createClub.json', ('patterns','verticalSplit')): 'Вертикальное разделение',
    ('createClub.json', ('patterns','horizontalSplit')): 'Горизонтальное разделение',
    ('createClub.json', ('patterns','diagonalSash')): 'Диагональная лента',
    ('createClub.json', ('patterns','diagonalSplit')): 'Диагональное разделение',
    ('createClub.json', ('patterns','centerStripe')): 'Центральная полоса',
    ('createClub.json', ('patterns','quartered')): 'Четыре секции',
    ('createClub.json', ('logo','title')): 'Логотип',
    ('createClub.json', ('logo','description')): 'Необязательно. Загрузите логотип или укажите URL изображения. Если ничего не выбрано, будет использована сгенерированная эмблема выше.',
    ('createClub.json', ('logo','fileHelp')): 'PNG, JPEG/JPG или BMP · максимум 2 МБ.',
    ('createClub.json', ('logo','orUrl')): 'или укажите URL',
    ('createClub.json', ('logo','applying')): 'Применяем...',
    ('createClub.json', ('logo','uploaded')): 'Выбран файл логотипа: {{name}}',
    ('createClub.json', ('logo','urlApplied')): 'Логотип по URL применён.',
    ('createClub.json', ('errors','invalidType')): 'Логотип должен быть изображением PNG, JPEG/JPG или BMP.',
    ('createClub.json', ('errors','pasteUrl')): 'Сначала вставьте URL логотипа.',
    ('createClub.json', ('errors','invalidUrl')): 'Введите корректный URL.',
    ('createClub.json', ('errors','httpUrl')): 'URL логотипа должен начинаться с http:// или https://.',
    ('createClub.json', ('errors','loadUrl')): 'Не удалось загрузить логотип по этому URL.',
    ('createClub.json', ('errors','nameRequired')): 'Введите название команды.',
    ('createClub.json', ('errors','countryRequired')): 'Выберите страну команды.',
    ('createClub.json', ('errors','jerseyRequired')): 'Перед созданием команды выберите форму.',
    ('createClub.json', ('errors','signIn')): 'Войдите в систему, чтобы создать команду.',
    ('createClub.json', ('errors','bucketMissing')): 'Хранилище «club-logos» не найдено. Сначала создайте его в Supabase Storage.',
    ('createClub.json', ('errors','uploadLogo')): 'Не удалось загрузить логотип команды.',
    ('createClub.json', ('errors','saveBadge')): 'Не удалось сохранить эмблему команды.',
    ('createClub.json', ('errors','create')): 'Не удалось создать команду.',
    ('createClub.json', ('errors','unexpected')): 'Произошла непредвиденная ошибка.',
}


def get_value(data: Any, path: tuple[str, ...]) -> Any:
    cur = data
    for part in path:
        cur = cur[part]
    return cur


def set_value(data: Any, path: tuple[str, ...], value: str) -> None:
    cur = data
    for part in path[:-1]:
        cur = cur[part]
    cur[path[-1]] = value


def main() -> None:
    grouped: dict[str, list[tuple[tuple[str, ...], str]]] = {}
    for (filename, path), value in OVERRIDES.items():
        grouped.setdefault(filename, []).append((path, value))

    changed = 0
    for filename, entries in sorted(grouped.items()):
        source = json.loads((EN_DIR / filename).read_text(encoding='utf-8'))
        target_path = RU_DIR / filename
        target = json.loads(target_path.read_text(encoding='utf-8'))
        dirty = False
        for path, value in entries:
            source_value = get_value(source, path)
            if sorted(PH.findall(source_value)) != sorted(PH.findall(value)):
                raise RuntimeError(f'Placeholder mismatch: {filename}:{path}: {source_value!r} -> {value!r}')
            if get_value(target, path) != value:
                set_value(target, path, value)
                changed += 1
                dirty = True
        if dirty:
            target_path.write_text(json.dumps(target, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'Additional Russian core-page polish applied {changed} reviewed fixes.')


if __name__ == '__main__':
    main()
