from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "src/pages/dashboard/NotificationsPage.tsx"
LOCALE_ROOT = ROOT / "src/i18n/locales"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]

COPY = {
    "en": {
        "title": "Head Coach Advisory — High Fatigue Alert",
        "summaryOne": "1 rider is at high fatigue. Highest current fatigue: {{fatigue}}. Immediate workload review is recommended.",
        "summaryMany": "{{count}} riders are at high fatigue. Highest current fatigue: {{fatigue}}. Immediate workload review is recommended.",
        "reason": "High fatigue",
        "recommendation": "Review the affected riders before the next demanding training session.",
        "variant": "High Fatigue",
    },
    "sr-Latn": {
        "title": "Savet glavnog trenera — upozorenje na visok umor",
        "summaryOne": "1 vozač ima visok nivo umora. Najveći trenutni umor: {{fatigue}}. Preporučuje se hitna procena opterećenja.",
        "summaryMany": "{{count}} vozača imaju visok nivo umora. Najveći trenutni umor: {{fatigue}}. Preporučuje se hitna procena opterećenja.",
        "reason": "Visok umor",
        "recommendation": "Pregledajte pogođene vozače pre sledećeg zahtevnog treninga.",
        "variant": "Visok umor",
    },
    "de": {
        "title": "Hinweis des Cheftrainers — Warnung vor hoher Ermüdung",
        "summaryOne": "1 Fahrer weist eine hohe Ermüdung auf. Höchste aktuelle Ermüdung: {{fatigue}}. Eine sofortige Überprüfung der Belastung wird empfohlen.",
        "summaryMany": "{{count}} Fahrer weisen eine hohe Ermüdung auf. Höchste aktuelle Ermüdung: {{fatigue}}. Eine sofortige Überprüfung der Belastung wird empfohlen.",
        "reason": "Hohe Ermüdung",
        "recommendation": "Überprüfe die betroffenen Fahrer vor der nächsten anspruchsvollen Trainingseinheit.",
        "variant": "Hohe Ermüdung",
    },
    "hr": {
        "title": "Savjet glavnog trenera — upozorenje na visok umor",
        "summaryOne": "1 vozač ima visoku razinu umora. Najviša trenutačna vrijednost umora: {{fatigue}}. Preporučuje se odmah pregledati opterećenje.",
        "summaryMany": "{{count}} vozača imaju visoku razinu umora. Najviša trenutačna vrijednost umora: {{fatigue}}. Preporučuje se odmah pregledati opterećenje.",
        "reason": "Visok umor",
        "recommendation": "Pregledajte pogođene vozače prije sljedećeg zahtjevnog treninga.",
        "variant": "Visok umor",
    },
    "es": {
        "title": "Aviso del entrenador jefe — Alerta de fatiga alta",
        "summaryOne": "1 corredor presenta fatiga alta. Fatiga máxima actual: {{fatigue}}. Se recomienda revisar de inmediato la carga de entrenamiento.",
        "summaryMany": "{{count}} corredores presentan fatiga alta. Fatiga máxima actual: {{fatigue}}. Se recomienda revisar de inmediato la carga de entrenamiento.",
        "reason": "Fatiga alta",
        "recommendation": "Revisa a los corredores afectados antes de la próxima sesión de entrenamiento exigente.",
        "variant": "Fatiga alta",
    },
    "it": {
        "title": "Avviso dell'allenatore capo — Allerta per fatica elevata",
        "summaryOne": "1 corridore presenta una fatica elevata. Fatica massima attuale: {{fatigue}}. Si raccomanda una revisione immediata del carico di lavoro.",
        "summaryMany": "{{count}} corridori presentano una fatica elevata. Fatica massima attuale: {{fatigue}}. Si raccomanda una revisione immediata del carico di lavoro.",
        "reason": "Fatica elevata",
        "recommendation": "Controlla i corridori interessati prima della prossima sessione di allenamento impegnativa.",
        "variant": "Fatica elevata",
    },
    "fr": {
        "title": "Conseil de l’entraîneur principal — Alerte de fatigue élevée",
        "summaryOne": "1 coureur présente une fatigue élevée. Fatigue maximale actuelle : {{fatigue}}. Un examen immédiat de la charge de travail est recommandé.",
        "summaryMany": "{{count}} coureurs présentent une fatigue élevée. Fatigue maximale actuelle : {{fatigue}}. Un examen immédiat de la charge de travail est recommandé.",
        "reason": "Fatigue élevée",
        "recommendation": "Vérifiez les coureurs concernés avant la prochaine séance d’entraînement exigeante.",
        "variant": "Fatigue élevée",
    },
    "ru": {
        "title": "Совет главного тренера — предупреждение о высокой усталости",
        "summaryOne": "У 1 гонщика высокий уровень усталости. Максимальная текущая усталость: {{fatigue}}. Рекомендуется немедленно пересмотреть нагрузку.",
        "summaryMany": "У {{count}} гонщиков высокий уровень усталости. Максимальная текущая усталость: {{fatigue}}. Рекомендуется немедленно пересмотреть нагрузку.",
        "reason": "Высокая усталость",
        "recommendation": "Проверьте состояние этих гонщиков перед следующей интенсивной тренировкой.",
        "variant": "Высокая усталость",
    },
}


def patch_locales() -> None:
    for locale in LOCALES:
        path = LOCALE_ROOT / locale / "notifications.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        head = data.setdefault("headCoach", {})
        head["highFatigueAlert"] = {
            "title": COPY[locale]["title"],
            "summaryOne": COPY[locale]["summaryOne"],
            "summaryMany": COPY[locale]["summaryMany"],
            "reason": COPY[locale]["reason"],
            "recommendation": COPY[locale]["recommendation"],
        }
        variants = data.setdefault("reportVariants", {})
        variants["high_fatigue"] = COPY[locale]["variant"]
        variants["high_fatigue_alert"] = COPY[locale]["variant"]
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Could not find anchor for {label}")
    return text.replace(old, new, 1)


def patch_page() -> None:
    text = PAGE.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "  if (/^Head Coach Advisory\\s*[—-]\\s*Fatigue Watch$/i.test(text)) {\n    return t('headCoach.fatigueWatch.title')\n  }\n",
        "  if (/^Head Coach Advisory\\s*[—-]\\s*Fatigue Watch$/i.test(text)) {\n    return t('headCoach.fatigueWatch.title')\n  }\n  if (/^Head Coach Advisory\\s*[—-]\\s*High Fatigue Alert$/i.test(text)) {\n    return t('headCoach.highFatigueAlert.title')\n  }\n",
        "High Fatigue title",
    )

    anchor = """  if (match) {\n    const count = Number(match[1])\n    return t(count === 1 ? 'headCoach.fatigueWatch.summaryOne' : 'headCoach.fatigueWatch.summaryMany', { count })\n  }\n\n  match = /^(\\d+)\\s+rider\\(s\\)\\s+are not fully available for normal training load\\. Review recovery status before the next intensive block\\.$/i.exec(text)\n"""
    replacement = """  if (match) {\n    const count = Number(match[1])\n    return t(count === 1 ? 'headCoach.fatigueWatch.summaryOne' : 'headCoach.fatigueWatch.summaryMany', { count })\n  }\n\n  match = /^(\\d+)\\s+rider\\(s\\)\\s+are at high fatigue\\. Highest current fatigue:\\s*(\\d+(?:\\.\\d+)?)\\. Immediate workload review is recommended\\.$/i.exec(text)\n  if (match) {\n    const count = Number(match[1])\n    const fatigue = match[2]\n    return t(count === 1 ? 'headCoach.highFatigueAlert.summaryOne' : 'headCoach.highFatigueAlert.summaryMany', { count, fatigue })\n  }\n\n  match = /^(\\d+)\\s+rider\\(s\\)\\s+are not fully available for normal training load\\. Review recovery status before the next intensive block\\.$/i.exec(text)\n"""
    text = replace_once(text, anchor, replacement, "High Fatigue summary")

    text = replace_once(
        text,
        "  if (normalized === 'elevated fatigue') return t('headCoach.elevatedFatigue')\n",
        "  if (normalized === 'elevated fatigue') return t('headCoach.elevatedFatigue')\n  if (normalized === 'high fatigue') return t('headCoach.highFatigueAlert.reason')\n  if (normalized === 'high fatigue alert') return t('reportVariants.high_fatigue_alert')\n",
        "High Fatigue values",
    )

    text = replace_once(
        text,
        "  if (normalized === 'monitor the affected riders through the next training block.') {\n    return t('headCoach.fatigueWatch.recommendation')\n  }\n",
        "  if (normalized === 'monitor the affected riders through the next training block.') {\n    return t('headCoach.fatigueWatch.recommendation')\n  }\n  if (normalized === 'review the affected riders before the next demanding training session.') {\n    return t('headCoach.highFatigueAlert.recommendation')\n  }\n",
        "High Fatigue recommendation",
    )

    PAGE.write_text(text, encoding="utf-8")


def audit() -> None:
    page = PAGE.read_text(encoding="utf-8")
    required_page = [
        "headCoach.highFatigueAlert.title",
        "headCoach.highFatigueAlert.summaryOne",
        "headCoach.highFatigueAlert.summaryMany",
        "headCoach.highFatigueAlert.reason",
        "headCoach.highFatigueAlert.recommendation",
        "reportVariants.high_fatigue_alert",
    ]
    for token in required_page:
        if token not in page:
            raise RuntimeError(f"Missing runtime mapping: {token}")

    for locale in LOCALES:
        path = LOCALE_ROOT / locale / "notifications.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        block = data.get("headCoach", {}).get("highFatigueAlert", {})
        for key in ["title", "summaryOne", "summaryMany", "reason", "recommendation"]:
            if not block.get(key):
                raise RuntimeError(f"{locale}: missing highFatigueAlert.{key}")
        if not data.get("reportVariants", {}).get("high_fatigue"):
            raise RuntimeError(f"{locale}: missing reportVariants.high_fatigue")
        if locale != "en":
            english = COPY["en"]
            if block["title"] == english["title"] or block["recommendation"] == english["recommendation"]:
                raise RuntimeError(f"{locale}: English High Fatigue text leaked")

    print("Head Coach High Fatigue localization audit PASSED for 8 languages")


def main() -> None:
    patch_locales()
    patch_page()
    audit()


if __name__ == "__main__":
    main()
