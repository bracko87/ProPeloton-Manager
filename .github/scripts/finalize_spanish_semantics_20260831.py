from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / 'src/i18n/locales/en'
ES_DIR = ROOT / 'src/i18n/locales/es'

# Final human-reviewed corrections for residual strings found by the strict audit.
EXACT: dict[tuple[str, str], str] = {
    ('auth.json', 'register.title'): 'Crear tu cuenta de mánager',
    ('club.json', 'report.cheating'): 'Trampas / exploits',
    ('equipment.json', 'overview.defaultSetupDescription'): 'Elige los tipos de equipamiento preferidos. Race Engine puede seleccionar después cualquier unidad disponible del tipo elegido y, si es necesario, usar el siguiente tipo disponible.',
    ('help.json', 'first.title'): 'Primeros pasos para nuevos mánagers',
    ('help.json', 'first.s4Text'): 'Usa Calendario y Preparación de carrera para solicitar carreras, enviar Race Plans, seleccionar ciclistas y crear tácticas de etapa.',
    ('help.json', 'rules.gameTimeText'): 'Un día de juego equivale a 12 horas reales. Esto significa que dos días de juego equivalen a un día real. Tenlo en cuenta al comprobar plazos, ventanas de preparación de carrera y bloqueos de Stage Plans.',
    ('help.json', 'basics.b5Text'): 'Race Plans, las inscripciones de ciclistas y Stage Plans tienen plazos. Si los incumples, tu equipo puede quedar mal preparado o incluso no poder competir correctamente.',
    ('help.json', 'faq.a3'): 'Un día de juego equivale a 12 horas reales. Dos días de juego equivalen a un día real. Esto es importante para las ventanas de Race Plans, los plazos de inscripción de ciclistas, Stage Plans, campos de entrenamiento y otros sistemas del juego basados en el tiempo.',

    ('notifications.json', 'sportDirector.missingStagePlans'): 'Faltan Stage Plans',
    ('notifications.json', 'scout.reviewStatus'): 'Estado de la revisión',
    ('notifications.json', 'reportVariants.stage_plans_missing'): 'Faltan Stage Plans',
    ('notifications.json', 'reportVariants.stage_plans_incomplete'): 'Stage Plans incompletos',
    ('notifications.json', 'reportVariants.equipment_workshop_review'): 'Revisión de equipamiento y taller',
    ('notifications.json', 'reportVariants.recruitment_review'): 'Revisión de contratación',
    ('overview.json', 'attention.resultsReview'): 'Revisión de resultados',
    ('preferences.json', 'sections.race.description'): 'Invitaciones, preparación, clima, Stage Plans, problemas de carrera y resultados.',
    ('preferences.json', 'advisorCategories.startlistStagePlans.description'): 'Alertas del plazo de Startlist y advertencias sobre Stage Plans ausentes o incompletos.',
    ('proPackages.json', 'advantages.a5'): 'Acceso a opciones avanzadas de Team Policy y filtros de calendario seleccionados.',

    ('publicInfo.json', 'about.what2'): 'El mundo del juego incluye calendarios de carreras, clasificaciones de equipos, preparación de carrera, Stage Plans, equipamiento, entrenamiento, personal, patrocinadores, fichajes, gestión financiera y sistemas de equipos de desarrollo.',
    ('publicInfo.json', 'about.raceText'): 'Solicita carreras, selecciona ciclistas, asigna personal y activos, elige equipamiento, prepara suministros y crea Stage Plans antes de los plazos.',
    ('publicInfo.json', 'how.step5Title'): '5. Preparar Race Plans',
    ('publicInfo.json', 'how.system3'): 'Stage Plans y tácticas de equipo',
    ('publicInfo.json', 'how.timeText'): 'ProPeloton Manager utiliza el tiempo de juego para los plazos de carrera, los campos de entrenamiento, los fichajes, los periodos financieros y el avance de la temporada. Los mánagers deben comprobar siempre la hora de juego mostrada y prepararse antes del plazo final. Incumplir un plazo puede dejar al equipo mal preparado para una carrera importante.',
    ('publicInfo.json', 'support.gameplayText'): 'Pregunta sobre preparación de carrera, Stage Plans, fichajes, patrocinadores, finanzas, clasificaciones, entrenamiento, fatiga o cualquier sistema que no esté claro.',

    ('raceDetail.json', 'status.activeNotice'): 'La Startlist está bloqueada y esta carrera está esperando la simulación de Race Engine.',
    ('raceDetail.json', 'weather.stageAlreadyCanceled'): 'La etapa ya ha sido cancelada por Race Engine.',
    ('raceDetail.json', 'rewards.description'): 'Premios en metálico, puntos de equipo y puntos de ciclista generados por Race Engine.',
    ('raceDetail.json', 'report.roadGroupsDescription'): 'Situación final de la carrera según Replay Engine.',
    ('racePreparation.json', 'header.missedStartlist'): 'Tu equipo perdió el plazo de la Startlist y no participa en esta carrera.',
    ('racePreparation.json', 'racePlan.freshnessBarHelp'): 'La barra roja de frescura inicial combina fatiga y Race Sharpness. Está limitada entre 50 y 100 para que ningún ciclista seleccionado comience una carrera con un nivel irrealmente bajo.',
    ('racePreparation.json', 'bonus.description'): 'El personal de carrera, los activos de carrera y Team Policy se convierten en estos bonos porcentuales estandarizados de Race Engine.',
    ('racePreparation.json', 'bonus.capHelp'): 'Si estos dos valores difieren posteriormente, el límite o la regla de estandarización de Race Engine ha limitado el bono final.',

    ('tutorials.json', 'overview.simpleOrDeep.body'): 'No necesitas entenderlo todo de inmediato. Al principio puedes jugar de forma sencilla: seguir las alertas, revisar tu equipo, participar en carreras, preparar a tu plantilla y ver los resultados. Más adelante, si quieres más profundidad, puedes utilizar sistemas avanzados como fatiga, moral, Race Sharpness, objetivos de patrocinadores, bonos de equipamiento, campos de entrenamiento, scouting, negociaciones de fichajes, impuestos, infraestructura y ascensos o descensos.',
    ('tutorials.json', 'overview.dashboard.title'): 'Tu panel de mánager',
}

# Manual text that appeared repeatedly in several split/manual resources.
EXACT.update({
    ('manual.json', 'guide.detail.deadline'): 'Las ventanas y los plazos son estrictos porque Race Engine y los sistemas de temporada necesitan datos estables antes de la simulación. Si vence un plazo, puedes perder la posibilidad de editar un plan, solicitar una carrera, mover a un ciclista o enviar una lista. Compara siempre la fecha de la página con la hora de juego del pie de página.',
    ('manualDynamic.json', 'expanded.deadline'): 'Las ventanas y los plazos son estrictos porque Race Engine y los sistemas de temporada necesitan datos estables antes de la simulación. Si vence un plazo, puedes perder la posibilidad de editar un plan, solicitar una carrera, mover a un ciclista o enviar una lista. Compara siempre la fecha de la página con la hora de juego del pie de página.',
    ('manualLegacyDynamic.json', 'expanded.deadline'): 'Las ventanas y los plazos son estrictos porque Race Engine y los sistemas de temporada necesitan datos estables antes de la simulación. Si vence un plazo, puedes perder la posibilidad de editar un plan, solicitar una carrera, mover a un ciclista o enviar una lista. Compara siempre la fecha de la página con la hora de juego del pie de página.',

    ('manual.json', 'sections.quick-start.title'): 'Inicio rápido para nuevos mánagers',
    ('manualCore.json', 'sections.quickStart.title'): 'Inicio rápido para nuevos mánagers',
    ('manual.json', 'sections.game-time.details[4]'): 'Prepárate siempre con antelación. Incumplir los plazos puede bloquear Race Plans o dejar Stage Plans incompletos.',
    ('manualCore.json', 'sections.gameTime.details[4]'): 'Prepárate siempre con antelación. Incumplir los plazos puede bloquear Race Plans o dejar Stage Plans incompletos.',
    ('manual.json', 'sections.notifications-inbox.overview'): 'Las notificaciones son alertas del juego o de administración. La bandeja de entrada sirve para conversaciones directas o mensajes administrativos. Juntas ayudan a evitar plazos perdidos y a comunicarse con otros mánagers o administradores.',
    ('manualCore.json', 'sections.notificationsInbox.overview'): 'Las notificaciones son alertas del juego o de administración. La bandeja de entrada sirve para conversaciones directas o mensajes administrativos. Juntas ayudan a evitar plazos perdidos y a comunicarse con otros mánagers o administradores.',
    ('manual.json', 'sections.staff.details[3]'): 'El director deportivo ayuda con la preparación de carrera, las tácticas y las sugerencias para Stage Plans.',
    ('manualCore.json', 'sections.staff.details[3]'): 'El director deportivo ayuda con la preparación de carrera, las tácticas y las sugerencias para Stage Plans.',
    ('manual.json', 'sections.race-preparation.overview'): 'La preparación de carrera convierte una carrera aceptada en un plan real. Es una de las páginas más importantes del juego porque Race Engine depende de la selección de ciclistas, personal, activos, equipamiento, suministros y tácticas de etapa.',
    ('manualCore.json', 'sections.racePreparation.overview'): 'La preparación de carrera convierte una carrera aceptada en un plan real. Es una de las páginas más importantes del juego porque Race Engine depende de la selección de ciclistas, personal, activos, equipamiento, suministros y tácticas de etapa.',
    ('manual.json', 'sections.team-ranking.details[5]'): 'Los mánagers inactivos pueden seguir visibles en posiciones o resultados. La interfaz puede mostrar una insignia de mánager inactivo para equipos inactivos pendientes de retirada al final de la temporada.',
    ('manualCore.json', 'sections.teamRanking.details[5]'): 'Los mánagers inactivos pueden seguir visibles en posiciones o resultados. La interfaz puede mostrar una insignia de mánager inactivo para equipos inactivos pendientes de retirada al final de la temporada.',
    ('manual.json', 'sections.statistics-team-profile.overview'): 'Las estadísticas ayudan a identificar equipos y ciclistas fuertes. Los perfiles de equipo muestran información pública sobre clubes controlados por usuarios y por IA.',
    ('manualCore.json', 'sections.statisticsTeamProfile.overview'): 'Las estadísticas ayudan a identificar equipos y ciclistas fuertes. Los perfiles de equipo muestran información pública sobre clubes controlados por usuarios y por IA.',
    ('manual.json', 'sections.team-profile-deep.details[0]'): 'La página muestra si el club está controlado por un usuario o por IA.',
    ('manualDeepA.json', 'sections.teamProfileDeep.details[0]'): 'La página muestra si el club está controlado por un usuario o por IA.',
    ('manual.json', 'sections.notification-examples.details[0]'): 'Las notificaciones de preparación de carrera avisan cuando Race Plans o Stage Plans requieren atención.',
    ('manualDeepA.json', 'sections.notificationExamples.details[0]'): 'Las notificaciones de preparación de carrera avisan cuando Race Plans o Stage Plans requieren atención.',
    ('manual.json', 'sections.staff-roles-deep.details[2]'): 'El director deportivo ayuda con las tácticas, Stage Plans y las sugerencias de preparación de carrera.',
    ('manual.json', 'sections.equipment-caps-deep.details[3]'): 'Si varios elementos proporcionan el mismo tipo de bono, el juego puede limitar el efecto útil total. Por eso los mánagers deben crear configuraciones equilibradas en lugar de asumir que cada punto adicional se acumula indefinidamente.',
    ('manual.json', 'sections.equipment-inventory-deep.details[4]'): 'Las cotizaciones de reparación deben mostrar el coste antes de confirmar. El mánager debe comparar el coste de reparación con el valor del artículo y el coste de sustitución.',
    ('manual.json', 'sections.assets-deep.overview'): 'Los activos son recursos de apoyo propiedad del club. Pueden asignarse a Race Plans y tienen condición, estado, valor de compra, coste de reparación y valor de venta.',
    ('manual.json', 'sections.replay-results-deep.facts[0].value'): 'Cálculo oficial de Race Engine',
    ('manual.json', 'sections.stage-readiness-deep.details[5]'): 'Cuando la edición está bloqueada, el mánager debe aceptar el plan final almacenado.',
    ('manual.json', 'sections.transfer-list-deep.details[4]'): 'El mánager debe comprobar la capacidad de la plantilla antes de completar un nuevo fichaje.',
    ('manualDeepA.json', 'sections.riderProfileDeep.tips[0]'): 'Abre los perfiles antes de renovar, vender o preparar Race Plans.',
    ('manualDeepB1.json', 'sections.raceSuppliesDeep.overview'): 'Los suministros de carrera se consumen o utilizan mediante Stage Plans y pueden afectar a la fatiga, la resistencia, la preparación y el apoyo ante las condiciones meteorológicas.',
    ('manualDeepB1.json', 'sections.stagePlanDeep.overview'): 'Stage Plans indican a Race Engine lo que debe hacer cada ciclista en cada etapa.',
    ('manualDeepB1.json', 'sections.stageReadinessDeep.overview'): 'Los indicadores de preparación muestran si Stage Plans están lo bastante completos para Race Engine.',
    ('manualDeepB1.json', 'sections.stageReadinessDeep.details[4]'): 'Todos los Stage Plans requeridos deben estar guardados antes del día de la carrera.',
    ('manualDeepB1.json', 'sections.sportDirectorDeep.subtitle'): 'Sugerencias del asistente para Stage Plans.',
    ('manualDynamic.json', 'category.clubIdentity'): 'Las páginas de identidad del club controlan lo que ven otros mánagers: nombre del equipo, colores, logotipo, maillot, perfil público y nombre visible del patrocinador. Las cargas validan el tipo y el tamaño de imagen antes de guardar nada. Los botones de guardado conservan la nueva identidad mediante funciones de backend, por lo que conviene esperar la confirmación antes de salir.',
    ('manualDynamic.json', 'category.faq'): 'Las secciones de preguntas frecuentes están pensadas para resolver problemas rápidamente. Si te quedas atascado, lee la causa y utiliza la página relacionada para comprobar el bloqueo exacto. La mayoría de los problemas proceden de ventanas cerradas, falta de dinero, capacidad completa, ciclistas o personal no disponibles, Stage Plans sin preparar, falta de suministros, activos bloqueados o scouting incompleto.',
    ('manualFaq.json', 'sections.acceptedNotReady.overview'): 'Aceptado significa que tu equipo tiene plaza; listo significa que ciclistas, personal, activos, equipamiento, suministros y Stage Plans pueden utilizarse correctamente.',
})


def phrase_in_source(source: str, phrase: str) -> bool:
    return re.search(rf'(?<!\w){re.escape(phrase)}(?!\w)', source, flags=re.I) is not None


def replace_first_patterns(text: str, patterns: list[str], replacement: str) -> str:
    for pattern in patterns:
        new, n = re.subn(pattern, replacement, text, count=1, flags=re.I)
        if n:
            return new
    return text


def source_aware(source: str, target: str) -> str:
    # Product vocabulary is intentionally English in all language packs.
    vocabulary = [
        ('Race Plans', [r'planes? de carreras?', r'planes? para carreras?']),
        ('Race Plan', [r'plan de carrera', r'plan para la carrera']),
        ('Stage Plans', [r'planes? de etapas?', r'planes? para etapas?']),
        ('Stage Plan', [r'plan de etapa']),
        ('Startlist', [r'lista de salida', r'lista de inicio', r'lista inicial', r'lista de participantes']),
        ('Race Engine', [r'motor de carreras?', r'motor de la carrera', r'motor de simulación de carreras?']),
        ('Replay Engine', [r'motor de repetición', r'motor de replay', r'motor de reproducción']),
        ('Team Policy', [r'políticas? de equipo']),
        ('Race Sharpness', [r'nitidez de carrera', r'agudeza de carrera', r'afilado de carrera']),
    ]
    for term, patterns in vocabulary:
        if phrase_in_source(source, term) and not phrase_in_source(target, term):
            target = replace_first_patterns(target, patterns, term)

    low_source = source.lower()
    # The UI is written for cycling managers, not generic system administrators.
    if re.search(r'\bmanagers?\b', low_source):
        target = re.sub(r'\badministradores\b', 'mánagers', target, flags=re.I)
        target = re.sub(r'\badministrador\b', 'mánager', target, flags=re.I)
        target = re.sub(r'\bgerentes\b', 'mánagers', target, flags=re.I)
        target = re.sub(r'\bgerente\b', 'mánager', target, flags=re.I)

    # AI is naturally rendered as IA in Spanish; avoid verbose literal forms.
    if re.search(r'\bAI\b', source):
        target = re.sub(r'\binteligencia artificial\b', 'IA', target, flags=re.I)
        target = re.sub(r'\bequipos? de AI\b', lambda m: m.group(0).replace('AI', 'IA'), target, flags=re.I)

    # Review means review/check here, never an exam.
    if re.search(r'\breviews?\b', low_source):
        target = re.sub(r'\bexámenes\b', 'revisiones', target, flags=re.I)
        target = re.sub(r'\bexamen\b', 'revisión', target, flags=re.I)

    # General grammar and terminology leftovers.
    replacements = [
        (r'\blos ciclista\b', 'los ciclistas'), (r'\bde los ciclista\b', 'de los ciclistas'),
        (r'\ba los ciclista\b', 'a los ciclistas'), (r'\bpara los ciclista\b', 'para los ciclistas'),
        (r'\bciclista fuertes\b', 'ciclistas fuertes'), (r'\bciclista seleccionados\b', 'ciclistas seleccionados'),
        (r'\bsalvados\b', 'guardados'), (r'\bsalvado\b', 'guardado'),
        (r'\bWindows y los plazos\b', 'Las ventanas y los plazos'),
    ]
    for pattern, repl in replacements:
        target = re.sub(pattern, repl, target, flags=re.I)
    return target


def transform(source: Any, target: Any, filename: str, path: str = '') -> Any:
    if isinstance(source, dict) and isinstance(target, dict):
        return {k: transform(source[k], target[k], filename, f'{path}.{k}' if path else k) for k in source}
    if isinstance(source, list) and isinstance(target, list):
        return [transform(a, b, filename, f'{path}[{i}]') for i, (a, b) in enumerate(zip(source, target))]
    if isinstance(source, str) and isinstance(target, str):
        exact = EXACT.get((filename, path))
        if exact is not None:
            return exact
        return source_aware(source, target)
    return target


def main() -> None:
    changed = 0
    for en_path in sorted(EN_DIR.glob('*.json')):
        es_path = ES_DIR / en_path.name
        if not es_path.exists():
            raise SystemExit(f'Missing Spanish file: {es_path}')
        source = json.loads(en_path.read_text(encoding='utf-8'))
        old = json.loads(es_path.read_text(encoding='utf-8'))
        new = transform(source, old, en_path.name)
        if new != old:
            es_path.write_text(json.dumps(new, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed += 1
    print(f'Final Spanish semantic cleanup changed {changed} resources.')


if __name__ == '__main__':
    main()
