from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN = ROOT / 'src/i18n/locales/en'
ES = ROOT / 'src/i18n/locales/es'

EXACT: dict[tuple[str, str], str] = {
    ('club.json','history.deferred'): 'Los honores finales de GC, puntos, montaña y clasificación juvenil se añadirán cuando se confirme su fuente autorizada y persistida de resultados.',

    ('finance.json','policies.saved'): 'Team Policy aplicada.',
    ('finance.json','policies.teamPolicies'): 'Team Policy',
    ('finance.json','tutorial.welcomeBody'): 'Te mostraremos cómo funcionan las finanzas del club, incluidos el saldo, los patrocinadores, las transacciones, los impuestos y Team Policy.',
    ('help.json','basics.b4Text'): 'Patrocinadores, impuestos, salarios, infraestructura, campos de entrenamiento, fichajes, equipamiento y Team Policy afectan al futuro financiero de tu club.',
    ('help.json','manual.financeText'): 'Consulta el saldo, los ingresos, los gastos, las transacciones, los impuestos, los patrocinadores, Team Policy y los costes operativos.',

    ('manual.json','sections.game-time.details[2]'): 'Las fechas del juego se utilizan para solicitudes de carreras, plazos de inscripción de ciclistas, bloqueos de Stage Plans, campos de entrenamiento, vencimientos de fichajes, transacciones financieras y periodos fiscales.',
    ('manualCore.json','sections.gameTime.details[2]'): 'Las fechas del juego se utilizan para solicitudes de carreras, plazos de inscripción de ciclistas, bloqueos de Stage Plans, campos de entrenamiento, vencimientos de fichajes, transacciones financieras y periodos fiscales.',

    ('manual.json','sections.rider-profile-skills.overview'): 'Los perfiles de ciclista muestran identidad, atributos, contrato, entrenamiento, comparaciones e historial. El rendimiento real en carrera depende de la combinación de habilidades, forma, moral, fatiga, salud y Race Sharpness.',
    ('manualCore.json','sections.riderProfileSkills.overview'): 'Los perfiles de ciclista muestran identidad, atributos, contrato, entrenamiento, comparaciones e historial. El rendimiento real en carrera depende de la combinación de habilidades, forma, moral, fatiga, salud y Race Sharpness.',
    ('manual.json','sections.rider-profile-skills.details[3]'): 'Race Sharpness mide el ritmo competitivo reciente. Competir demasiado poco puede reducirlo, mientras que competir demasiado aumenta el riesgo de sobrecarga.',
    ('manualCore.json','sections.riderProfileSkills.details[3]'): 'Race Sharpness mide el ritmo competitivo reciente. Competir demasiado poco puede reducirlo, mientras que competir demasiado aumenta el riesgo de sobrecarga.',
    ('manual.json','sections.rider-skills-deep.facts[1].value'): 'Potencial, moral, fatiga, Race Sharpness',
    ('manual.json','sections.race-sharpness-deep.overview'): 'Race Sharpness recompensa un ritmo competitivo útil y reciente, pero debe equilibrarse con la fatiga y la frescura.',
    ('manualDeepA.json','sections.raceSharpnessDeep.overview'): 'Race Sharpness ayuda a mostrar si un ciclista tiene suficiente ritmo competitivo reciente o está sobrecargado por demasiados días de carrera.',
    ('manual.json','sections.race-sharpness-deep.details[0]'): 'Race Sharpness no es lo mismo que la forma de entrenamiento.',
    ('manual.json','sections.stage-roles-deep.details[5]'): 'Los roles también deben tener en cuenta la fatiga, la moral, la salud y Race Sharpness, no solo la habilidad bruta.',
    ('manual.json','sections.faq-rider-underperformed.details[4]'): 'Una moral baja o un Race Sharpness deficiente pueden hacer que un ciclista normalmente fuerte rinda peor.',
    ('manualFaq.json','sections.riderUnderperformed.details[2]'): 'Comprueba la moral y Race Sharpness.',

    ('manual.json','sections.sponsors-policies.title'): 'Patrocinadores, patrocinadores técnicos y Team Policy',
    ('manualCore.json','sections.sponsorsPolicies.title'): 'Patrocinadores, patrocinadores técnicos y Team Policy',
    ('manual.json','sections.sponsors-policies.overview'): 'Team Policy define los viajes, el alojamiento, la vivienda, la nutrición, la recuperación y las bonificaciones. Tanto los patrocinadores como estas políticas pueden mejorar el club, pero también crear obligaciones o costes.',
    ('manualCore.json','sections.sponsorsPolicies.overview'): 'Team Policy define los viajes, el alojamiento, la vivienda, la nutrición, la recuperación y las bonificaciones. Tanto los patrocinadores como estas políticas pueden mejorar el club, pero también crear obligaciones o costes.',
    ('manual.json','sections.sponsors-policies.relatedLinks[1]'): 'Team Policy',
    ('manualCore.json','sections.sponsorsPolicies.links[1]'): 'Team Policy',
    ('manual.json','sections.team-policies-deep.relatedLinks[0]'): 'Team Policy',
    ('manual.json','sections.faq-money.details[3]'): 'Team Policy y los viajes a las carreras pueden generar costes incluso cuando el club no ha realizado ningún fichaje.',
    ('manualDynamic.json','category.finance'): 'Las páginas de Finanzas explican si el club puede sostener sus decisiones. Pestañas como Resumen, Patrocinadores, Transacciones, Impuestos y Team Policy responden a distintas preguntas financieras. Antes de confirmar fichajes caros, campos de entrenamiento, obras de infraestructura, mejoras de Team Policy o compras de equipamiento, conviene revisar Finanzas.',

    ('manual.json','sections.notification-examples.facts[0].value'): 'Recordatorios de Race Plans, recordatorios de Stage Plans, ventana de desarrollo, préstamo de emergencia, instalación terminada, liberación de ciclista, objetivo de patrocinador',
    ('manualDeepA.json','sections.notificationExamples.facts[1]'): 'Recordatorios de Race Plans, recordatorios de Stage Plans, ventana de desarrollo, préstamo de emergencia, instalación terminada, liberación de ciclista, objetivo de patrocinador',
    ('manualDynamic.json','mistake.equipment'): 'El error más común es esperar hasta el día de la carrera y descubrir que falta el equipamiento, el preset o el material necesario, que está desgastado, asignado o en mantenimiento. Lo correcto es comprobar el equipamiento después de solicitar una carrera importante, volver a revisarlo cuando el equipo sea aceptado y comprobarlo una vez más antes de que se bloqueen Stage Plans.',

    ('raceDetail.json','participants.noneConfirmed'): 'Todavía no hay equipos aceptados confirmados. Los equipos aceptados aparecerán aquí cuando se publique la Startlist oficial.',
    ('racePreparation.json','racePlan.sharpnessHelp'): 'Race Sharpness muestra si un ciclista tiene suficiente ritmo competitivo reciente. Un valor más alto ayuda a empezar la carrera mejor preparado y a rendir con mayor regularidad.',
    ('racePreparation.json','racePlan.fatigueHelp'): 'La fatiga sigue siendo el principal limitador. Un ciclista con buen Race Sharpness pero una fatiga muy alta no comenzará la carrera completamente fresco.',
    ('racePreparation.json','racePlan.u23GeneratedFirst'): 'El entrenador principal U23 generó el primer Stage Plan elegible.',
    ('racePreparation.json','weatherCancellation.stageCanceledBody'): 'Esta etapa fue cancelada por Race Engine ({{reason}}). Stage Plans están bloqueados porque no se generarán resultados, puntos, premios, fatiga ni replay para esta etapa.',
    ('training.json','campTags.premium'): 'Premium',
    ('tutorials.json','finance.welcome.body'): 'Te mostraremos cómo funcionan las finanzas del club, incluidos el saldo, los patrocinadores, las transacciones, los impuestos y Team Policy.',
}


def transform(src: Any, dst: Any, filename: str, path: str='') -> Any:
    if isinstance(src, dict) and isinstance(dst, dict):
        return {k: transform(src[k], dst[k], filename, f'{path}.{k}' if path else k) for k in src}
    if isinstance(src, list) and isinstance(dst, list):
        return [transform(a,b,filename,f'{path}[{i}]') for i,(a,b) in enumerate(zip(src,dst))]
    if isinstance(src,str) and isinstance(dst,str):
        exact=EXACT.get((filename,path))
        if exact is not None:
            return exact
        # Any remaining source occurrences of core protected game concepts get normalized here.
        low=src.lower()
        if 'team policy' in low or 'team policies' in low:
            dst=re.sub(r'\bpol[ií]ticas? de equipo\b','Team Policy',dst,flags=re.I)
        if 'race sharpness' in low:
            dst=re.sub(r'\b(?:nitidez|agudeza) (?:de la |de )?carrera\b','Race Sharpness',dst,flags=re.I)
            dst=re.sub(r'\bagudeza racial\b','Race Sharpness',dst,flags=re.I)
        if 'race engine' in low:
            dst=re.sub(r'\bmotor de carreras?\b','Race Engine',dst,flags=re.I)
        if 'replay engine' in low:
            dst=re.sub(r'\bmotor de repetici[oó]n\b','Replay Engine',dst,flags=re.I)
        if 'startlist' in low:
            dst=re.sub(r'\blista (?:oficial )?(?:de salida|de inicio)\b','Startlist',dst,flags=re.I)
        if 'stage plan' in low:
            dst=re.sub(r'\bplanes? de etapas?\b',lambda m:'Stage Plans' if m.group(0).lower().startswith('planes') else 'Stage Plan',dst,flags=re.I)
        if 'race plan' in low:
            dst=re.sub(r'\bplanes? de carreras?\b',lambda m:'Race Plans' if m.group(0).lower().startswith('planes') else 'Race Plan',dst,flags=re.I)
        return dst
    return dst


def main():
    changed=0
    for ep in sorted(EN.glob('*.json')):
        sp=ES/ep.name
        src=json.loads(ep.read_text(encoding='utf-8'))
        old=json.loads(sp.read_text(encoding='utf-8'))
        new=transform(src,old,ep.name)
        if new != old:
            sp.write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            changed += 1
    print(f'Final Spanish residual corrections changed {changed} resources.')

if __name__ == '__main__':
    main()
