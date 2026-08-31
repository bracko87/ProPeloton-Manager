from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ES = ROOT / 'src/i18n/locales/es'

FIXES: dict[tuple[str, str], str] = {
    ('help.json', 'faq.a4'): 'La preparación de carrera es donde preparas las carreras aceptadas. Seleccionas los ciclistas, el personal, los activos, el equipamiento, los suministros y las tácticas de etapa. En las carreras por etapas, también preparas las tácticas de cada etapa después de enviar Race Plan.',
    ('help.json', 'faq.a12'): 'Usa la página Transferencias. Los ciclistas incluidos en la lista de transferencias requieren una oferta al equipo vendedor, mientras que con los agentes libres puedes pasar directamente a negociar el contrato.',
    ('home.json', 'status.clubStatusError'): 'Has iniciado sesión, pero no hemos podido cargar el estado de tu club. Actualiza la página o inténtalo de nuevo.',

    ('manual.json', 'sections.quick-start.overview'): 'ProPeloton Manager es un juego completo de gestión de clubes ciclistas. No se trata solo de elegir ciclistas para las carreras: gestionas las finanzas, el personal, el equipamiento, la infraestructura, los patrocinadores, el entrenamiento, las solicitudes de carrera, la preparación y la clasificación a largo plazo.',
    ('manual.json', 'sections.squad-riders.overview'): 'Plantilla es donde gestionas y revisas a los ciclistas de tu primera plantilla. Incluye distintas vistas para los datos generales, las finanzas, las habilidades, la forma y el desarrollo.',
    ('manual.json', 'sections.race-supplies.overview'): 'Los suministros de carrera se utilizan en la preparación de carrera y Stage Plans. Algunos se consumen en cada etapa, mientras que los kits de carrera y los impermeables son artículos duraderos reutilizables con un número limitado de usos.',
    ('manual.json', 'sections.transfers-scouting.details[1]'): 'Los agentes libres no tienen equipo vendedor. Negocias directamente con el ciclista.',
    ('manual.json', 'sections.staff-capacity-deep.subtitle'): 'Por qué un puesto de personal puede estar bloqueado aunque tengas efectivo.',
    ('manual.json', 'sections.sponsor-objectives-deep.tips[1]'): 'No sacrifiques la identidad del club por un acuerdo de derechos sobre el nombre salvo que el valor adicional te compense.',
    ('manual.json', 'sections.faq-staff-hiring.details[2]'): 'Comprueba si el rol del candidato pertenece al grupo de instalaciones que crees que le corresponde.',

    ('manualCore.json', 'sections.quickStart.overview'): 'ProPeloton Manager es un juego completo de gestión de clubes ciclistas. No se trata solo de elegir ciclistas para las carreras: gestionas las finanzas, el personal, el equipamiento, la infraestructura, los patrocinadores, el entrenamiento, las solicitudes de carrera, la preparación y la clasificación a largo plazo.',
    ('manualCore.json', 'sections.squadRiders.overview'): 'Plantilla es donde gestionas y revisas a los ciclistas de tu primera plantilla. Incluye distintas vistas para los datos generales, las finanzas, las habilidades, la forma y el desarrollo.',
    ('manualCore.json', 'sections.raceSupplies.overview'): 'Los suministros de carrera se utilizan en la preparación de carrera y Stage Plans. Algunos se consumen en cada etapa, mientras que los kits de carrera y los impermeables son artículos duraderos reutilizables con un número limitado de usos.',
    ('manualCore.json', 'sections.transfersScouting.details[1]'): 'Los agentes libres no tienen equipo vendedor. Negocias directamente con el ciclista.',

    ('notifications.json', 'doctor.injuredRiders'): 'ciclistas lesionados',
    ('overview.json', 'staffBriefing.withoutText'): 'Sigues recibiendo todas las notificaciones normales del juego y los avisos esenciales: plazos de Race Plan y Stage Plans, lesiones y enfermedades, vencimientos de contratos de ciclistas y personal, escasez de suministros de carrera, avisos de patrocinio y finanzas, tareas de scouting completadas, transferencias y otros eventos normales del juego.',
    ('preferences.json', 'dangerZone.aboutToDelete'): 'Estás a punto de eliminar permanentemente:',
    ('preferences.json', 'dangerZone.afterDelete'): 'Después de eliminar la cuenta correctamente, se cerrará tu sesión y volverás a la página principal. Podrás registrarte de nuevo con la misma dirección de correo electrónico como un usuario nuevo.',

    ('racePreparation.json', 'racePlan.sportDirectorPlanHelp'): 'Gestionas Stage Plans manualmente y puedes pedir sugerencias al director deportivo.',
    ('racePreparation.json', 'dialog.submitBody'): 'Si envías Race Plan ahora, los ciclistas, el personal y los activos de carrera quedarán bloqueados para esta carrera. Stage Plans se abrirá inmediatamente después del envío.',
    ('racePreparation.json', 'dialog.submitTail'): '. Si envías Race Plan ahora, los ciclistas, el personal y los activos de carrera quedarán bloqueados para esta carrera. Stage Plans se abrirá inmediatamente después del envío.',
    ('racePreparation.json', 'tactics.ttFastStartDesc'): 'Primera mitad a máxima intensidad y después mantener el ritmo. Buena opción para prólogos cortos, pero arriesgada para los contrarrelojistas más débiles.',

    ('riderProfile.json', 'scouting.youHave'): 'Actualmente tienes',
    ('staff.json', 'release.aboutToRelease'): 'Estás a punto de liberar a {{name}}',
    ('statistics.json', 'riders.top50'): 'Top 50 de ciclistas',

    ('training.json', 'camps.noEligibleStaff'): 'No se encontró personal elegible para la concentración. Puedes reservarla sin personal, pero los ciclistas no recibirán bonificaciones del equipo técnico.',
    ('training.json', 'tutorial.campsBody'): 'Las concentraciones de entrenamiento son bloques especiales en los que envías a ciclistas seleccionados durante varios días. Pueden ofrecer un desarrollo más intenso que el entrenamiento diario, pero cuestan mucho más. Eliges el tipo de concentración, la ubicación, las fechas, la duración, los ciclistas y el personal disponible. El personal puede mejorar el efecto de la concentración o ayudar a proteger mejor a los ciclistas, según sus habilidades y disponibilidad. Antes de reservar, puedes revisar el coste, el riesgo meteorológico, los ciclistas y el personal seleccionados y las advertencias de validación.',

    ('transfers.json', 'activity.rejectedByYou'): 'Rechazado por ti',
    ('transfers.json', 'shortlist.premiumDescription'): 'Los usuarios Premium pueden seguir a ciclistas de la lista de transferencias, agentes libres, búsquedas y perfiles externos. Se incluyen dos nuevas incorporaciones por día real; las siguientes cuestan una unidad de Coins cada una.',
    ('transfers.json', 'negotiation.draftInfo'): 'La negociación comenzará solo después de que envíes esta oferta.',

    ('tutorials.json', 'training.camps.body'): 'Las concentraciones de entrenamiento son bloques especiales en los que envías a ciclistas seleccionados durante varios días. Pueden ofrecer un desarrollo más intenso que el entrenamiento diario, pero cuestan mucho más. Eliges el tipo de concentración, la ubicación, las fechas, la duración, los ciclistas y el personal disponible. El personal puede mejorar el efecto de la concentración o ayudar a proteger mejor a los ciclistas, según sus habilidades y disponibilidad. Antes de reservar, puedes revisar el coste, el riesgo meteorológico, los ciclistas y el personal seleccionados y las advertencias de validación.',
    ('tutorials.json', 'equipment.market.body'): 'La pestaña Mercado es donde compras equipamiento nuevo. Cada artículo tiene un precio y puede aportar distintas bonificaciones. Un equipamiento mejor puede aumentar el rendimiento en carrera, pero también cuesta más. Cuando compras un artículo, se añade a tu inventario y después puedes utilizarlo en las configuraciones de carrera.',
    ('tutorials.json', 'racePreparation.racePlan.body'): 'En la pestaña Race Plan preparas a tu equipo para una carrera aceptada. El tiempo del juego avanza más rápido que el tiempo real: un día de juego equivale a 12 horas reales. Esto significa que dos días de juego equivalen a un día real. Tenlo en cuenta al comprobar las ventanas de Race Plan, los plazos de inscripción de ciclistas y los plazos de Stage Plans. Cuando la ventana de Race Plan esté abierta, puedes elegir si compite la primera plantilla o el equipo de desarrollo, si lo tienes disponible. También debes respetar el plazo de inscripción de ciclistas. Hasta esa fecha puedes seleccionar a quienes participarán. La página muestra el número mínimo y máximo de ciclistas permitidos y quién está bloqueado por coincidir con otra carrera. También puedes asignar personal y activos disponibles. La previsión de costes se actualiza mientras preparas el plan para que sepas cuánto costará la carrera. En el lado derecho, la vista previa de bonificaciones muestra el posible apoyo del personal, los activos, el equipamiento y Team Policy.',
}


def set_path(root: Any, path: str, value: str) -> None:
    cur = root
    parts = path.split('.')
    for part in parts[:-1]:
        if '[' in part:
            key, idx = part[:-1].split('[')
            cur = cur[key][int(idx)]
        else:
            cur = cur[part]
    last = parts[-1]
    if '[' in last:
        key, idx = last[:-1].split('[')
        cur[key][int(idx)] = value
    else:
        cur[last] = value


def main() -> None:
    by_file: dict[str, list[tuple[str, str]]] = {}
    for (filename, path), value in FIXES.items():
        by_file.setdefault(filename, []).append((path, value))

    applied = 0
    changed_files = 0
    for filename, fixes in sorted(by_file.items()):
        file = ES / filename
        data = json.loads(file.read_text(encoding='utf-8'))
        before = json.dumps(data, ensure_ascii=False, sort_keys=True)
        for path, value in fixes:
            set_path(data, path, value)
            applied += 1
        after = json.dumps(data, ensure_ascii=False, sort_keys=True)
        if after != before:
            file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed_files += 1

    print(f'Applied {applied} residual Spanish fixes across {changed_files} resources.')


if __name__ == '__main__':
    main()
