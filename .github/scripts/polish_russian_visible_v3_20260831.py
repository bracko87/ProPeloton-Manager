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
    # Authentication
    ('auth.json', ('signInTitle',)): 'Войдите в ProPeloton Manager',
    ('auth.json', ('signInSubtitle',)): 'Введите данные для входа, чтобы продолжить.',
    ('auth.json', ('signingIn',)): 'Вход...',
    ('auth.json', ('forgotPassword',)): 'Забыли пароль?',
    ('auth.json', ('createAccount',)): 'Создать аккаунт',
    ('auth.json', ('checkingSession',)): 'Проверяем сеанс...',
    ('auth.json', ('errors','missingCredentials')): 'Введите адрес электронной почты и пароль.',
    ('auth.json', ('errors','signInFailed')): 'Не удалось войти.',
    ('auth.json', ('errors','clubStatus')): 'Вы вошли в систему, но нам не удалось проверить статус вашего клуба.',
    ('auth.json', ('info','passwordResetSuccess')): 'Пароль успешно обновлён. Войдите с новым паролем.',
    ('auth.json', ('info','accountUnconfirmed')): 'Аккаунт существует, но ещё не подтверждён. Проверьте электронную почту.',
    ('auth.json', ('register','title')): 'Создайте аккаунт менеджера',
    ('auth.json', ('register','subtitle')): 'Присоединяйтесь к многопользовательскому миру ProPeloton Manager.',
    ('auth.json', ('register','managerHandle')): 'Имя менеджера',
    ('auth.json', ('register','emailPlaceholder')): 'you@example.com',
    ('auth.json', ('register','checkingEmail')): 'Проверяем доступность адреса...',
    ('auth.json', ('register','resendActivation')): 'Отправить письмо активации повторно',
    ('auth.json', ('register','resendingActivation')): 'Повторно отправляем письмо активации...',
    ('auth.json', ('register','resendHelp')): 'Используйте эту функцию, если вы уже зарегистрировались, но не получили или потеряли письмо активации.',
    ('auth.json', ('register','strongPassword')): 'Выберите надёжный пароль',
    ('auth.json', ('register','birthdayHelp')): 'Дата рождения используется для бонуса ко дню рождения в Coins. Её можно указать только один раз при регистрации и позже изменить в игре нельзя.',
    ('auth.json', ('register','yearOptional')): 'Год (необязательно)',
    ('auth.json', ('register','creating')): 'Создаём аккаунт...',
    ('auth.json', ('register','checking')): 'Проверяем...',
    ('auth.json', ('register','createAccount')): 'Создать аккаунт',
    ('auth.json', ('register','alreadyHave')): 'Уже есть аккаунт?',
    ('auth.json', ('register','usernameRequired')): 'Введите имя пользователя.',
    ('auth.json', ('register','emailRequired')): 'Введите адрес электронной почты.',
    ('auth.json', ('register','validEmail')): 'Введите корректный адрес электронной почты.',
    ('auth.json', ('register','passwordLength')): 'Пароль должен содержать не менее 8 символов.',
    ('auth.json', ('register','confirmRequired')): 'Подтвердите пароль.',
    ('auth.json', ('register','birthdayMonthRequired')): 'Выберите месяц рождения.',
    ('auth.json', ('register','birthdayDayRequired')): 'Выберите день рождения.',
    ('auth.json', ('register','validYear')): 'Введите корректный год или оставьте поле пустым.',
    ('auth.json', ('register','invalidBirthdayDay')): 'Такого дня в выбранном месяце нет.',
    ('auth.json', ('register','enterEmailFirst')): 'Сначала введите адрес электронной почты.',
    ('auth.json', ('register','emailInUse')): 'Этот адрес электронной почты уже используется. Войдите в существующий аккаунт или укажите другой адрес.',
    ('auth.json', ('register','emailAlreadyRegistered')): 'Этот адрес электронной почты уже зарегистрирован.',
    ('auth.json', ('register','signupFailed')): 'Не удалось создать аккаунт.',
    ('auth.json', ('register','verifyEmailFailed')): 'Не удалось проверить, используется ли этот адрес электронной почты. Попробуйте ещё раз.',
    ('auth.json', ('register','alreadyConfirmed')): 'Этот адрес электронной почты уже подтверждён. Войдите и продолжите создание команды.',
    ('auth.json', ('register','rateLimit')): 'Подождите минуту перед повторной отправкой письма активации.',
    ('auth.json', ('register','activationSent')): 'Новое письмо активации отправлено. Откройте последнее письмо и перейдите по ссылке, чтобы продолжить.',
    ('auth.json', ('register','activationFailed')): 'Не удалось повторно отправить письмо активации.',
    ('auth.json', ('register','accountCreatedConfirm')): 'Аккаунт создан. Подтвердите адрес электронной почты перед входом. Если письмо активации не пришло, воспользуйтесь кнопкой повторной отправки.',
    ('auth.json', ('register','clubStatusFailed')): 'Аккаунт создан, и вы вошли в систему, но нам не удалось проверить статус клуба. Попробуйте ещё раз.',
    ('auth.json', ('months','march')): 'Март',
    ('auth.json', ('months','april')): 'Апрель',
    ('auth.json', ('months','september')): 'Сентябрь',
    ('auth.json', ('months','november')): 'Ноябрь',
    ('auth.json', ('months','december')): 'Декабрь',
    ('auth.json', ('forgot','title')): 'Забыли пароль?',
    ('auth.json', ('forgot','subtitle')): 'Введите адрес электронной почты, и мы отправим инструкции по сбросу пароля.',
    ('auth.json', ('forgot','sent')): 'Если аккаунт с таким адресом существует, мы отправили инструкции по сбросу пароля. Проверьте входящие и папку «Спам».',
    ('auth.json', ('forgot','sending')): 'Отправляем ссылку для сброса...',
    ('auth.json', ('forgot','send')): 'Отправить ссылку для сброса',
    ('auth.json', ('forgot','backToSignIn')): 'Вернуться ко входу',
    ('auth.json', ('reset','title')): 'Задайте новый пароль',
    ('auth.json', ('reset','verifying')): 'Проверяем ссылку для сброса...',
    ('auth.json', ('reset','inactiveSession')): 'Сеанс сброса пароля неактивен. Откройте эту страницу по последней ссылке из письма. Если ссылка истекла, запросите новую.',
    ('auth.json', ('reset','passwordHelp')): 'Не менее 8 символов.',
    ('auth.json', ('reset','missingSession')): 'Сеанс восстановления пароля не найден.',
    ('auth.json', ('reset','invalidLink')): 'Не удалось проверить ссылку. Возможно, она недействительна или истекла. Запросите новое письмо для сброса пароля.',
    ('auth.json', ('reset','updateFailed')): 'Не удалось обновить пароль. Возможно, ссылка недействительна или истекла. Запросите новую ссылку и попробуйте снова.',
    ('auth.json', ('reset','requestNew')): 'Запросить новую ссылку',
    ('auth.json', ('reset','backToSignIn')): 'Вернуться ко входу',

    # Navigation and reports
    ('navigation.json', ('customizeTeam',)): 'Настроить команду',
    ('navigation.json', ('contactUs',)): 'Связаться с нами',
    ('navigation.json', ('proPackages',)): 'Пакеты Coins',
    ('navigation.json', ('inviteFriends',)): 'Пригласить друзей',
    ('navigation.json', ('descriptions','teamRanking')): 'Позиции, дивизионы и рейтинги',
    ('navigation.json', ('descriptions','training')): 'Тренировки и развитие гонщиков',
    ('navigation.json', ('descriptions','equipment')): 'Велосипеды, колёса и другое снаряжение',
    ('navigation.json', ('descriptions','statistics')): 'Результаты и аналитика',
    ('navigation.json', ('header','toggleSidebar')): 'Открыть или закрыть боковое меню',
    ('navigation.json', ('header','namingRights')): 'Права на название',
    ('navigation.json', ('header','premiumAccountMember')): 'Аккаунт с Premium',
    ('navigation.json', ('header','freeAccountMember')): 'Бесплатный аккаунт · доступен Premium',
    ('navigation.json', ('header','premiumAccount')): 'Аккаунт Premium',
    ('navigation.json', ('header','freeAccount')): 'Бесплатный аккаунт · посмотреть Premium',
    ('navigation.json', ('header','account')): 'Аккаунт',
    ('navigation.json', ('header','free')): 'Бесплатный',
    ('navigation.json', ('header','coin')): 'Coin',
    ('navigation.json', ('header','profileMenu')): 'Меню профиля',
    ('navigation.json', ('header','team')): 'Команда:',
    ('navigation.json', ('header','originalClub')): 'Исходное название клуба:',
    ('navigation.json', ('header','ranking')): '{{positionOrdinal}} место в рейтинге {{competition}}',
    ('navigation.json', ('footer','description')): 'ProPeloton Manager — многопользовательская игра о менеджменте велокоманды, которая активно развивается.',
    ('navigation.json', ('footer','navigation')): 'Навигация',
    ('navigation.json', ('footer','about')): 'Об игре',
    ('navigation.json', ('footer','privacyPolicy')): 'Политика конфиденциальности',
    ('navigation.json', ('footer','terms')): 'Условия использования',
    ('navigation.json', ('footer','contact')): 'Контакты',
    ('navigation.json', ('footer','dashboard')): 'Панель управления',
    ('navigation.json', ('bugReport','button')): 'Сообщить об ошибке',
    ('navigation.json', ('bugReport','sent')): 'Отчёт об ошибке отправлен.',
    ('navigation.json', ('bugReport','title')): 'Сообщить об ошибке',
    ('navigation.json', ('bugReport','bugType')): 'Тип ошибки',
    ('navigation.json', ('bugReport','uiLayout')): 'Интерфейс / макет',
    ('navigation.json', ('bugReport','gameplayLogic')): 'Игровая логика',
    ('navigation.json', ('bugReport','performance')): 'Производительность',
    ('navigation.json', ('bugReport','other')): 'Другое',
    ('navigation.json', ('bugReport','severity')): 'Серьёзность',
    ('navigation.json', ('bugReport','medium')): 'Средняя',
    ('navigation.json', ('bugReport','screenshot')): 'Скриншот (необязательно)',
    ('navigation.json', ('bugReport','chooseImage')): 'Выберите изображение (максимум {{size}} МБ)',
    ('navigation.json', ('bugReport','sending')): 'Отправляем...',
    ('navigation.json', ('bugReport','send')): 'Отправить отчёт',
    ('navigation.json', ('bugReport','describeRequired')): 'Опишите проблему.',
    ('navigation.json', ('playerReport','reportPlayer')): 'Пожаловаться на игрока',
    ('navigation.json', ('playerReport','checking')): 'Проверяем...',
    ('navigation.json', ('playerReport','alreadyReported')): 'Уже отправлено',
    ('navigation.json', ('playerReport','alreadyPending')): 'Жалоба на этого пользователя уже отправлена и ожидает рассмотрения.',
    ('navigation.json', ('playerReport','sent')): 'Жалоба отправлена.',
    ('navigation.json', ('playerReport','title')): 'Пожаловаться на игрока или команду',
    ('navigation.json', ('playerReport','subtitle')): 'Укажите подробности, чтобы помочь нашей команде модерации.',
    ('navigation.json', ('playerReport','reason')): 'Причина',
    ('navigation.json', ('playerReport','abuse')): 'Оскорбления / преследование',
    ('navigation.json', ('playerReport','cheating')): 'Читерство / использование уязвимостей',
    ('navigation.json', ('playerReport','spam')): 'Спам / реклама',
    ('navigation.json', ('playerReport','other')): 'Другое',
    ('navigation.json', ('playerReport','severity')): 'Серьёзность',
    ('navigation.json', ('playerReport','medium')): 'Средняя',
    ('navigation.json', ('playerReport','proofScreenshot')): 'Скриншот-доказательство',
    ('navigation.json', ('playerReport','proofHelp')): 'Загрузите один скриншот в качестве доказательства. Максимум {{size}} МБ.',
    ('navigation.json', ('playerReport','sending')): 'Отправляем...',
    ('navigation.json', ('playerReport','send')): 'Отправить жалобу',
    ('navigation.json', ('playerReport','loginRequired')): 'Чтобы отправить жалобу, необходимо войти в систему.',
    ('navigation.json', ('premiumFeature','unlock')): 'Разблокировать с Premium',

    # Public homepage
    ('home.json', ('header','registrationUnavailable')): 'Временно недоступно, пока игра находится в разработке',
    ('home.json', ('beta','badge')): 'Бета',
    ('home.json', ('beta','title')): 'ProPeloton Manager находится на этапе бета-тестирования.',
    ('home.json', ('beta','continue')): 'Продолжить на сайте',
    ('home.json', ('beta','closeLabel')): 'Закрыть уведомление о бета-версии',
    ('home.json', ('hero','seasonalMultiplayer')): 'Сезонный мультиплеер',
    ('home.json', ('hero','description')): 'ProPeloton Manager — онлайн-игра о менеджменте велокоманды. Создавайте клуб, развивайте гонщиков, планируйте календарь, ведите трансферные переговоры и соревнуйтесь с реальными менеджерами в живом сезонном мире велоспорта.',
    ('home.json', ('hero','progression')): 'Развитие',
    ('home.json', ('hero','progressionValue')): 'Турниры, рейтинги и награды',
    ('home.json', ('hero','imageAlt')): 'Велогонщики поднимаются в гору',
    ('home.json', ('hero','loadingGameTime')): 'Загрузка игрового времени...',
    ('home.json', ('raceSchedule','title')): 'Календарь гонок',
    ('home.json', ('raceSchedule','subtitle')): 'Вчера, сегодня и завтра в мире ProPeloton.',
    ('home.json', ('raceSchedule','loading')): 'Загрузка гонок...',
    ('home.json', ('raceSchedule','yesterday')): 'Вчера',
    ('home.json', ('raceSchedule','tomorrow')): 'Завтра',
    ('home.json', ('raceSchedule','emptyYesterday')): 'Вчера этапов не было.',
    ('home.json', ('raceSchedule','emptyToday')): 'Сегодня этапов не запланировано.',
    ('home.json', ('raceSchedule','emptyTomorrow')): 'На завтра этапов не запланировано.',
    ('home.json', ('raceSchedule','flagAlt')): 'Флаг страны {{country}}',
    ('home.json', ('stats','title')): 'Краткая статистика',
    ('home.json', ('stats','subtitle')): 'Актуальный снимок мира ProPeloton.',
    ('home.json', ('stats','totalTeams')): 'Всего команд',
    ('home.json', ('stats','totalRacesTours')): 'Всего гонок и туров',
    ('home.json', ('features','title')): 'Основные возможности',
    ('home.json', ('features','subtitle')): 'Всё необходимое для управления велоклубом мирового уровня.',
    ('home.json', ('features','racesTitle')): 'Тактические гонки',
    ('home.json', ('features','marketDescription')): 'Ищите гонщиков, делайте предложения и ведите переговоры на динамичном трансферном рынке.',
    ('home.json', ('guide','eyebrow')): 'Руководство по игре',
    ('home.json', ('guide','headline')): 'Узнайте, что предлагает ProPeloton Manager, прежде чем начать игру.',
    ('home.json', ('guide','intro')): 'Публичные страницы ProPeloton Manager знакомят с игрой и её основными системами: созданием команды, развитием гонщиков, подготовкой к гонкам, тактикой, финансами, персоналом и сезонными рейтингами.',
    ('home.json', ('guide','title')): 'Как работает ProPeloton Manager',
    ('home.json', ('guide','subtitle')): 'Создайте клуб с нуля и принимайте решения, которые формируют каждый сезон.',
    ('home.json', ('guide','whatTitle')): 'Что такое ProPeloton Manager?',
    ('home.json', ('guide','whatText')): 'ProPeloton Manager — онлайн-игра о менеджменте велокоманды. Вы не управляете гонщиком напрямую, а руководите всем клубом: составом, тренировками, Race Plans, персоналом, снаряжением, финансами, спонсорами, трансферами и долгосрочным развитием в рейтингах.',
    ('home.json', ('guide','howTitle')): 'Как играть?',
    ('home.json', ('guide','preparationTitle')): 'Почему важна подготовка?',
    ('home.json', ('guide','preparationText')): 'Одной заявки на гонку недостаточно. Подготовка объединяет гонщиков, персонал, транспорт, снаряжение, запасы и тактику. Грамотное планирование помогает команде подготовиться к спринтам, горам, гонкам с раздельным стартом, брусчатке и сложной погоде.',
    ('home.json', ('screenshots','title')): 'Скриншоты игры',
    ('home.json', ('screenshots','subtitle')): 'Посмотрите на управление командой, подготовку к гонкам, тактику и мир ProPeloton Manager.',
    ('home.json', ('screenshots','previous')): 'Предыдущий скриншот',
    ('home.json', ('screenshots','next')): 'Следующий скриншот',
    ('home.json', ('screenshots','openPage')): 'Открыть страницу со скриншотом {{page}}',
    ('home.json', ('screenshots','page')): '{{current}} из {{total}}',
    ('home.json', ('reviews','subtitle')): 'Поделитесь впечатлениями о ProPeloton Manager и помогите новым игрокам лучше понять игру.',
    ('home.json', ('reviews','unavailable')): 'Отзывы временно недоступны.',
    ('home.json', ('reviews','leaveReview')): 'Оставить отзыв',
    ('home.json', ('reviews','addReview')): 'Добавить отзыв',
    ('home.json', ('reviews','closeForm')): 'Закрыть форму отзыва',
    ('home.json', ('reviews','emailPlaceholder')): 'you@example.com',
    ('home.json', ('reviews','reviewPlaceholder')): 'Расскажите другим игрокам, что вы думаете о ProPeloton Manager...',
    ('home.json', ('reviews','privacyNote')): 'Отзывы проходят модерацию перед публикацией. Не указывайте пароли, данные банковских карт или другую конфиденциальную информацию.',
    ('home.json', ('reviews','submit')): 'Отправить отзыв',
    ('home.json', ('reviews','submitting')): 'Отправляем...',
    ('home.json', ('reviews','reviewPosition')): '{{current}} из {{total}}',
    ('home.json', ('reviews','messageMax')): 'Отзыв должен содержать не более 1200 символов.',
    ('home.json', ('reviews','submitFailed')): 'Не удалось отправить отзыв.',
    ('home.json', ('reviews','submitSuccess')): 'Отзыв отправлен и будет опубликован после одобрения.',
    ('home.json', ('cta','title')): 'Готовы построить свою династию?',
    ('home.json', ('cta','body')): 'Создайте клуб, набирайте гонщиков и соревнуйтесь в сезонных лигах.',
    ('home.json', ('footer','gameAria')): 'Информация об игре',
    ('home.json', ('footer','legal')): 'Правовая информация',
    ('home.json', ('footer','legalAria')): 'Правовая информация',
    ('home.json', ('footer','connect')): 'Связаться',
    ('home.json', ('footer','connectText')): 'Вопросы, запросы в поддержку и отзывы можно отправить через страницу контактов или по электронной почте.',
    ('home.json', ('footer','about')): 'Об игре',
    ('home.json', ('footer','gameGuide')): 'Руководство по игре',
    ('home.json', ('footer','contact')): 'Контакты',
    ('home.json', ('footer','privacyPolicy')): 'Политика конфиденциальности',
    ('home.json', ('footer','terms')): 'Условия использования',
    ('home.json', ('status','preparingAccount')): 'Подготавливаем ваш аккаунт менеджера...',
    ('home.json', ('status','loadingGameTime')): 'Загрузка игрового времени...',
    ('home.json', ('status','homepageDataUnavailable')): 'Данные главной страницы временно недоступны.',
    ('home.json', ('status','homepageDataUnexpected')): 'Сервис данных главной страницы вернул неожиданный формат.',
    ('home.json', ('status','clubStatusError')): 'Вы вошли в систему, но нам не удалось загрузить статус вашего клуба.',
    ('home.json', ('status','clubCreationDisabled')): 'Создание новых клубов временно отключено в ProPeloton Manager. Существующие менеджеры могут продолжать играть.',
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
        en_path = EN_DIR / filename
        ru_path = RU_DIR / filename
        source = json.loads(en_path.read_text(encoding='utf-8'))
        target = json.loads(ru_path.read_text(encoding='utf-8'))
        file_changed = False
        for path, value in entries:
            source_value = get_value(source, path)
            if sorted(PH.findall(source_value)) != sorted(PH.findall(value)):
                raise RuntimeError(f'Placeholder mismatch: {filename}:{path}')
            if get_value(target, path) != value:
                set_value(target, path, value)
                changed += 1
                file_changed = True
        if file_changed:
            ru_path.write_text(json.dumps(target, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'Core Russian visible polish applied {changed} reviewed fixes.')


if __name__ == '__main__':
    main()
