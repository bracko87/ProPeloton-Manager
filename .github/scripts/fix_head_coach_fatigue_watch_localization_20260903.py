from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / 'src/pages/dashboard/NotificationsPage.tsx'
LOCALES = ROOT / 'src/i18n/locales'

TRANSLATIONS = {
    'en': {
        'title': 'Head Coach Advisory — Fatigue Watch',
        'summaryOne': '1 rider is currently in the elevated fatigue band (50–69). Monitor the trend before workload increases further.',
        'summaryMany': '{{count}} riders are currently in the elevated fatigue band (50–69). Monitor the trend before workload increases further.',
        'recommendation': 'Monitor the affected riders through the next training block.',
        'fit': 'Fit',
        'reportVariant': 'Elevated Fatigue',
    },
    'sr-Latn': {
        'title': 'Savet glavnog trenera — praćenje umora',
        'summaryOne': '1 vozač se trenutno nalazi u zoni povišenog umora (50–69). Pratite trend pre nego što dodatno povećate opterećenje.',
        'summaryMany': '{{count}} vozača se trenutno nalaze u zoni povišenog umora (50–69). Pratite trend pre nego što dodatno povećate opterećenje.',
        'recommendation': 'Pratite pogođene vozače tokom sledećeg trening bloka.',
        'fit': 'Spreman',
        'reportVariant': 'Povišen umor',
    },
    'de': {
        'title': 'Cheftrainer-Hinweis — Müdigkeit beobachten',
        'summaryOne': '1 Fahrer befindet sich derzeit im Bereich erhöhter Ermüdung (50–69). Beobachte die Entwicklung, bevor die Belastung weiter steigt.',
        'summaryMany': '{{count}} Fahrer befinden sich derzeit im Bereich erhöhter Ermüdung (50–69). Beobachte die Entwicklung, bevor die Belastung weiter steigt.',
        'recommendation': 'Beobachte die betroffenen Fahrer im nächsten Trainingsblock.',
        'fit': 'Einsatzbereit',
        'reportVariant': 'Erhöhte Ermüdung',
    },
    'hr': {
        'title': 'Savjet glavnog trenera — praćenje umora',
        'summaryOne': '1 vozač trenutačno se nalazi u rasponu povišenog umora (50–69). Pratite trend prije daljnjeg povećanja opterećenja.',
        'summaryMany': '{{count}} vozača trenutačno se nalaze u rasponu povišenog umora (50–69). Pratite trend prije daljnjeg povećanja opterećenja.',
        'recommendation': 'Pratite pogođene vozače tijekom sljedećeg bloka treninga.',
        'fit': 'Spreman',
        'reportVariant': 'Povišen umor',
    },
    'es': {
        'title': 'Aviso del entrenador jefe — Control de fatiga',
        'summaryOne': '1 corredor se encuentra actualmente en el rango de fatiga elevada (50–69). Vigila la tendencia antes de aumentar más la carga.',
        'summaryMany': '{{count}} corredores se encuentran actualmente en el rango de fatiga elevada (50–69). Vigila la tendencia antes de aumentar más la carga.',
        'recommendation': 'Supervisa a los corredores afectados durante el próximo bloque de entrenamiento.',
        'fit': 'En forma',
        'reportVariant': 'Fatiga elevada',
    },
    'it': {
        'title': "Avviso dell'allenatore capo — Controllo della fatica",
        'summaryOne': '1 corridore si trova attualmente nella fascia di fatica elevata (50–69). Monitora la tendenza prima di aumentare ulteriormente il carico.',
        'summaryMany': '{{count}} corridori si trovano attualmente nella fascia di fatica elevata (50–69). Monitora la tendenza prima di aumentare ulteriormente il carico.',
        'recommendation': 'Monitora i corridori interessati durante il prossimo blocco di allenamento.',
        'fit': 'In forma',
        'reportVariant': 'Fatica elevata',
    },
    'fr': {
        'title': "Conseil de l’entraîneur principal — Surveillance de la fatigue",
        'summaryOne': '1 coureur se trouve actuellement dans la zone de fatigue élevée (50–69). Surveillez la tendance avant d’augmenter davantage la charge.',
        'summaryMany': '{{count}} coureurs se trouvent actuellement dans la zone de fatigue élevée (50–69). Surveillez la tendance avant d’augmenter davantage la charge.',
        'recommendation': 'Surveillez les coureurs concernés pendant le prochain bloc d’entraînement.',
        'fit': 'En forme',
        'reportVariant': 'Fatigue élevée',
    },
    'ru': {
        'title': 'Совет главного тренера — контроль усталости',
        'summaryOne': '1 гонщик сейчас находится в зоне повышенной усталости (50–69). Следите за динамикой, прежде чем дополнительно увеличивать нагрузку.',
        'summaryMany': '{{count}} гонщиков сейчас находятся в зоне повышенной усталости (50–69). Следите за динамикой, прежде чем дополнительно увеличивать нагрузку.',
        'recommendation': 'Следите за состоянием этих гонщиков в течение следующего тренировочного блока.',
        'fit': 'Готов',
        'reportVariant': 'Повышенная усталость',
    },
}


def update_locales() -> None:
    for locale, block in TRANSLATIONS.items():
        path = LOCALES / locale / 'notifications.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        head_coach = data.setdefault('headCoach', {})
        head_coach['fit'] = block['fit']
        head_coach['fatigueWatch'] = {
            'title': block['title'],
            'summaryOne': block['summaryOne'],
            'summaryMany': block['summaryMany'],
            'recommendation': block['recommendation'],
        }
        report_variants = data.setdefault('reportVariants', {})
        report_variants['elevated_fatigue'] = block['reportVariant']
        report_variants['fatigue_watch'] = block['reportVariant']
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def insert_runtime_helper(text: str) -> str:
    if 'function localizeAdvisorNotificationRuntimeText' in text:
        return text

    pattern = re.compile(
        r"function formatAdvisorAvailability\(value: unknown\): string \{\n"
        r"  const normalized = String\(value \?\? ''\)\.trim\(\)\.replace\(/_/g, ' '\)\n"
        r"  if \(!normalized\) return '—'\n"
        r"  return normalized\.replace\(/\\b\\w/g, letter => letter\.toUpperCase\(\)\)\n"
        r"\}\n"
    )
    match = pattern.search(text)
    if not match:
        raise RuntimeError('Could not find formatAdvisorAvailability helper')

    helper = r'''

function localizeAdvisorNotificationRuntimeText(value: unknown, t: any): string {
  const text = String(value ?? '').trim()
  if (!text) return text

  if (/^Head Coach Advisory\s*[—-]\s*Fatigue Watch$/i.test(text)) {
    return t('headCoach.fatigueWatch.title')
  }

  const fatigueSummary = /^(\d+)\s+rider\(s\)\s+are currently in the elevated fatigue band \(50[–-]69\)\. Monitor the trend before workload increases further\.$/i.exec(text)
  if (fatigueSummary) {
    const count = Number(fatigueSummary[1])
    return t(
      count === 1 ? 'headCoach.fatigueWatch.summaryOne' : 'headCoach.fatigueWatch.summaryMany',
      { count }
    )
  }

  const normalized = text.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (normalized === 'elevated fatigue') return t('headCoach.elevatedFatigue')
  if (normalized === 'fit') return t('headCoach.fit')
  if (normalized === 'monitor the affected riders through the next training block.') {
    return t('headCoach.fatigueWatch.recommendation')
  }

  return text
}
'''
    return text[:match.end()] + helper + text[match.end():]


def update_page() -> None:
    text = PAGE.read_text(encoding='utf-8')
    text = insert_runtime_helper(text)

    # Feed + expanded-card title/message. The helper only changes known Fatigue Watch phrases.
    text = text.replace('{item.title}', '{localizeAdvisorNotificationRuntimeText(item.title, t)}')
    text = text.replace('{item.message}', '{localizeAdvisorNotificationRuntimeText(item.message, t)}')

    text = text.replace(
        '{skillChangeSummary || advisorPayload.summary || item.message}',
        '{skillChangeSummary || localizeAdvisorNotificationRuntimeText(advisorPayload.summary || item.message, t)}',
    )
    text = text.replace(
        '{advisorPayload.summary || item.message}',
        '{localizeAdvisorNotificationRuntimeText(advisorPayload.summary || item.message, t)}',
    )

    text = text.replace(
        '{formatAdvisorAvailability(rider.availability)}',
        '{localizeAdvisorNotificationRuntimeText(formatAdvisorAvailability(rider.availability), t)}',
    )
    text = text.replace(
        '{formatAdvisorValue(rider.flag_reason)}',
        '{localizeAdvisorNotificationRuntimeText(formatAdvisorValue(rider.flag_reason), t)}',
    )

    # Recommendation payloads are English strings. Keep unknown recommendations unchanged.
    text = text.replace(
        '{String(recommendation)}',
        '{localizeAdvisorNotificationRuntimeText(recommendation, t)}',
    )
    text = text.replace(
        '{formatAdvisorValue(recommendation)}',
        '{localizeAdvisorNotificationRuntimeText(formatAdvisorValue(recommendation), t)}',
    )

    # Three legacy advisor blocks title-case report_variant instead of using locale keys.
    old_variant = """{String(advisorPayload.report_variant ?? '')\n                                      .replace(/_/g, ' ')\n                                      .replace(/\\b\\w/g, letter => letter.toUpperCase())}"""
    new_variant = """{t(`reportVariants.${String(advisorPayload.report_variant ?? '')}`, {\n                                      defaultValue: localizeAdvisorNotificationRuntimeText(\n                                        String(advisorPayload.report_variant ?? '')\n                                          .replace(/_/g, ' ')\n                                          .replace(/\\b\\w/g, letter => letter.toUpperCase()),\n                                        t\n                                      ),\n                                    })}"""
    text = text.replace(old_variant, new_variant)

    PAGE.write_text(text, encoding='utf-8')


def audit() -> None:
    text = PAGE.read_text(encoding='utf-8')
    required_code = [
        'function localizeAdvisorNotificationRuntimeText',
        "headCoach.fatigueWatch.title",
        "headCoach.fatigueWatch.summaryMany",
        "headCoach.fatigueWatch.recommendation",
        "headCoach.fit",
        "reportVariants.${String(advisorPayload.report_variant ?? '')}",
        'localizeAdvisorNotificationRuntimeText(formatAdvisorAvailability(rider.availability), t)',
        'localizeAdvisorNotificationRuntimeText(formatAdvisorValue(rider.flag_reason), t)',
    ]
    for needle in required_code:
        if needle not in text:
            raise RuntimeError(f'Missing runtime localization hook: {needle}')

    for locale, expected in TRANSLATIONS.items():
        path = LOCALES / locale / 'notifications.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        fw = data.get('headCoach', {}).get('fatigueWatch', {})
        for key in ('title', 'summaryOne', 'summaryMany', 'recommendation'):
            if fw.get(key) != expected[key]:
                raise RuntimeError(f'{locale}: bad Fatigue Watch {key}')
        if data.get('headCoach', {}).get('fit') != expected['fit']:
            raise RuntimeError(f'{locale}: bad fit label')
        if data.get('reportVariants', {}).get('elevated_fatigue') != expected['reportVariant']:
            raise RuntimeError(f'{locale}: bad elevated_fatigue report variant')

    # Non-English locales must not retain the screenshot's English strings.
    for locale in [x for x in TRANSLATIONS if x != 'en']:
        block = TRANSLATIONS[locale]
        if block['title'] == TRANSLATIONS['en']['title']:
            raise RuntimeError(f'{locale}: title still English')
        if block['recommendation'] == TRANSLATIONS['en']['recommendation']:
            raise RuntimeError(f'{locale}: recommendation still English')

    print('Head Coach Fatigue Watch localization audit PASSED')


def main() -> None:
    update_locales()
    update_page()
    audit()


if __name__ == '__main__':
    main()
