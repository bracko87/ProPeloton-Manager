from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NOTIFICATION_FILE = ROOT / "src/features/notifications/notificationLocalization.ts"
LOCALES_ROOT = ROOT / "src/i18n/locales"

STATISTICS_COMMON = {
    "en": {
        "current": "Current", "history": "History", "rankings": "Rankings", "breakdown": "Breakdown",
        "team": "Team", "rider": "Rider", "country": "Country", "tier": "Tier", "division": "Division",
        "type": "Type", "status": "Status", "season": "Season", "position": "Pos", "role": "Role",
        "age": "Age", "internationalPoints": "International points", "previous": "Previous", "next": "Next",
        "user": "User", "ai": "AI", "active": "Active", "inactive": "Inactive",
    },
    "sr-Latn": {
        "current": "Trenutno", "history": "Istorija", "rankings": "Rangiranje", "breakdown": "Pregled",
        "team": "Tim", "rider": "Vozač", "country": "Zemlja", "tier": "Nivo", "division": "Divizija",
        "type": "Tip", "status": "Status", "season": "Sezona", "position": "Poz.", "role": "Uloga",
        "age": "Godine", "internationalPoints": "Međunarodni bodovi", "previous": "Prethodna", "next": "Sledeća",
        "user": "Korisnik", "ai": "AI", "active": "Aktivan", "inactive": "Neaktivan",
    },
    "de": {
        "current": "Aktuell", "history": "Historie", "rankings": "Ranglisten", "breakdown": "Übersicht",
        "team": "Team", "rider": "Fahrer", "country": "Land", "tier": "Kategorie", "division": "Division",
        "type": "Typ", "status": "Status", "season": "Saison", "position": "Pos.", "role": "Rolle",
        "age": "Alter", "internationalPoints": "Internationale Punkte", "previous": "Zurück", "next": "Weiter",
        "user": "Benutzer", "ai": "KI", "active": "Aktiv", "inactive": "Inaktiv",
    },
    "hr": {
        "current": "Trenutno", "history": "Povijest", "rankings": "Poredak", "breakdown": "Pregled",
        "team": "Tim", "rider": "Vozač", "country": "Država", "tier": "Rang", "division": "Divizija",
        "type": "Tip", "status": "Status", "season": "Sezona", "position": "Poz.", "role": "Uloga",
        "age": "Dob", "internationalPoints": "Međunarodni bodovi", "previous": "Prethodno", "next": "Sljedeće",
        "user": "Korisnik", "ai": "AI", "active": "Aktivan", "inactive": "Neaktivan",
    },
    "es": {
        "current": "Actual", "history": "Historial", "rankings": "Clasificación", "breakdown": "Desglose",
        "team": "Equipo", "rider": "Ciclista", "country": "País", "tier": "Nivel", "division": "División",
        "type": "Tipo", "status": "Estado", "season": "Temporada", "position": "Pos.", "role": "Rol",
        "age": "Edad", "internationalPoints": "Puntos internacionales", "previous": "Anterior", "next": "Siguiente",
        "user": "Usuario", "ai": "IA", "active": "Activo", "inactive": "Inactivo",
    },
    "it": {
        "current": "Attuale", "history": "Storico", "rankings": "Classifiche", "breakdown": "Dettaglio",
        "team": "Squadra", "rider": "Ciclista", "country": "Paese", "tier": "Livello", "division": "Divisione",
        "type": "Tipo", "status": "Stato", "season": "Stagione", "position": "Pos.", "role": "Ruolo",
        "age": "Età", "internationalPoints": "Punti internazionali", "previous": "Precedente", "next": "Successivo",
        "user": "Utente", "ai": "IA", "active": "Attivo", "inactive": "Inattivo",
    },
    "fr": {
        "current": "Actuel", "history": "Historique", "rankings": "Classements", "breakdown": "Détail",
        "team": "Équipe", "rider": "Coureur", "country": "Pays", "tier": "Niveau", "division": "Division",
        "type": "Type", "status": "Statut", "season": "Saison", "position": "Pos.", "role": "Rôle",
        "age": "Âge", "internationalPoints": "Points internationaux", "previous": "Précédent", "next": "Suivant",
        "user": "Utilisateur", "ai": "IA", "active": "Actif", "inactive": "Inactif",
    },
    "ru": {
        "current": "Текущие", "history": "История", "rankings": "Рейтинги", "breakdown": "Обзор",
        "team": "Команда", "rider": "Гонщик", "country": "Страна", "tier": "Уровень", "division": "Дивизион",
        "type": "Тип", "status": "Статус", "season": "Сезон", "position": "Поз.", "role": "Роль",
        "age": "Возраст", "internationalPoints": "Международные очки", "previous": "Назад", "next": "Далее",
        "user": "Пользователь", "ai": "ИИ", "active": "Активен", "inactive": "Неактивен",
    },
}

PAGE_POLISH = {
    "de": {
        "subtitle": "Team- und Fahrerstatistiken aus deiner gesamten Radsportwelt. Die Fahrer-Ranglisten sind global und vergleichen die besten Fahrer aller Teams im Spiel.",
        "loading": "Statistiken werden geladen",
        "fetching": "Daten werden geladen...",
    },
    "fr": {
        "subtitle": "Statistiques des équipes et des coureurs dans tout votre monde cycliste. Les classements des coureurs sont mondiaux et comparent les meilleurs coureurs de toutes les équipes du jeu.",
        "fetching": "Chargement des données...",
    },
}


def fix_notifications() -> None:
    text = NOTIFICATION_FILE.read_text(encoding="utf-8")

    old_header = """function isSerbian(): boolean {\n  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en'\n  return String(language).toLowerCase().startsWith('sr')\n}\n\nexport function isSerbianNotificationLocale(): boolean {\n  return isSerbian()\n}\n"""
    new_header = """function shouldLocalizeNotifications(): boolean {\n  const language = String(i18n.resolvedLanguage ?? i18n.language ?? 'en').toLowerCase()\n  return language !== 'en' && !language.startsWith('en-')\n}\n\n// Kept for backwards compatibility with notificationHelpers. The helper uses\n// this as a switch for whether hardcoded English expanded copy should render.\nexport function isSerbianNotificationLocale(): boolean {\n  return shouldLocalizeNotifications()\n}\n"""
    if old_header not in text:
        raise SystemExit("notification locale header did not match expected source")
    text = text.replace(old_header, new_header, 1)
    text = text.replace("!isSerbian()", "!shouldLocalizeNotifications()")

    old_entity_keys = """    'rider_full_name',\n    'rider_name',\n    'staff_full_name',\n    'staff_name',\n    'employee_name',\n    'company_name',\n    'sponsor_name',\n    'race_name',\n    'stage_name',\n    'facility_name',\n    'asset_name',\n    'club_name',\n    'team_name',\n    'name',\n"""
    new_entity_keys = """    'rider_full_name',\n    'rider_name',\n    'riderName',\n    'staff_full_name',\n    'staff_name',\n    'staffName',\n    'employee_name',\n    'company_name',\n    'companyName',\n    'sponsor_name',\n    'sponsorName',\n    'race_name',\n    'raceName',\n    'stage_name',\n    'stageName',\n    'facility_name',\n    'facilityName',\n    'asset_name',\n    'assetName',\n    'club_name',\n    'clubName',\n    'team_name',\n    'teamName',\n    'name',\n"""
    if old_entity_keys not in text:
        raise SystemExit("notification entity key block did not match expected source")
    text = text.replace(old_entity_keys, new_entity_keys, 1)

    old_generic = """  // Preserve already-localized/non-English admin or backend copy. Otherwise do\n  // not leak English template prose: show a localized, type-aware fallback.\n  const topic = getTopic(item)\n  const localizedTitle = item.title && !looksEnglish(item.title)\n"""
    new_generic = """  // Unknown/legacy notification types must remain readable. If the type code\n  // cannot be localized from our template-word dictionary, keep the persisted\n  // backend title/message unchanged instead of inventing a misleading label.\n  const localizedType = localizeTypeCode(item.type_code)\n  if (typeCode && !localizedType) return item\n\n  // Preserve already-localized/non-English admin or backend copy. Otherwise do\n  // not leak English template prose: show a localized, type-aware fallback.\n  // Dynamic rider/team/race/sponsor/company names come from payload_json and\n  // are interpolated verbatim; only the surrounding UI prose is translated.\n  const topic = localizedType || getTopic(item)\n  const localizedTitle = item.title && !looksEnglish(item.title)\n"""
    if old_generic not in text:
        raise SystemExit("notification generic localization block did not match expected source")
    text = text.replace(old_generic, new_generic, 1)

    if "isSerbian()" in text:
        raise SystemExit("Serbian-only notification guard remains")
    NOTIFICATION_FILE.write_text(text, encoding="utf-8")


def fix_statistics() -> None:
    for locale, replacements in STATISTICS_COMMON.items():
        path = LOCALES_ROOT / locale / "statistics.json"
        if not path.exists():
            raise SystemExit(f"missing statistics locale: {locale}")
        data = json.loads(path.read_text(encoding="utf-8"))
        common = data.get("common")
        if not isinstance(common, dict):
            raise SystemExit(f"missing statistics.common in {locale}")
        common.update(replacements)
        page_patch = PAGE_POLISH.get(locale)
        if page_patch:
            page = data.get("page")
            if not isinstance(page, dict):
                raise SystemExit(f"missing statistics.page in {locale}")
            page.update(page_patch)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate() -> None:
    expected_locales = set(STATISTICS_COMMON)
    for locale in expected_locales:
        data = json.loads((LOCALES_ROOT / locale / "statistics.json").read_text(encoding="utf-8"))
        common = data["common"]
        for key, value in STATISTICS_COMMON[locale].items():
            if common.get(key) != value:
                raise SystemExit(f"statistics validation failed: {locale}.common.{key}")

    text = NOTIFICATION_FILE.read_text(encoding="utf-8")
    required = [
        "function shouldLocalizeNotifications(): boolean",
        "return language !== 'en' && !language.startsWith('en-')",
        "const localizedType = localizeTypeCode(item.type_code)",
        "if (typeCode && !localizedType) return item",
        "'sponsorName'",
        "'teamName'",
        "'riderName'",
        "'raceName'",
    ]
    for snippet in required:
        if snippet not in text:
            raise SystemExit(f"notification validation failed: missing {snippet}")


if __name__ == "__main__":
    fix_notifications()
    fix_statistics()
    validate()
    print("Statistics and notification localization fixes applied and validated.")
