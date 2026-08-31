from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / 'src/i18n/locales'

# These source literals are rendered by legacy React pages/components. Existing
# localization bridges build an exact English-value map from the EN resource and
# replace matching text/attributes at runtime. Adding the literals here therefore
# closes Spanish-only gaps without restructuring mature React screens.
COVERAGE: dict[str, dict[str, tuple[str, str]]] = {
    'appShell.json': {
        'close': ('Close', 'Cerrar'),
        'previous': ('Previous', 'Anterior'),
        'next': ('Next', 'Siguiente'),
        'previousSlide': ('Previous slide', 'Diapositiva anterior'),
        'nextSlide': ('Next slide', 'Diapositiva siguiente'),
        'closeNavigation': ('Close navigation', 'Cerrar navegación'),
        'previousPage': ('Go to previous page', 'Ir a la página anterior'),
        'nextPage': ('Go to next page', 'Ir a la página siguiente'),
    },
    'club.json': {
        'jerseyPreviewUnavailable': ('Jersey preview unavailable', 'Vista previa del maillot no disponible'),
        'unknownCountry': ('Unknown country', 'País desconocido'),
    },
    'equipment.json': {
        'activeStatuses': ('Active statuses', 'Estados activos'),
        'maintenanceTitle': ('Equipment Needing Maintenance', 'Equipamiento que necesita mantenimiento'),
        'loadingMaintenance': ('Loading maintenance...', 'Cargando mantenimiento...'),
        'searchEquipment': ('Search equipment...', 'Buscar equipamiento...'),
    },
    'finance.json': {
        'planningTitle': ('Finance Planning Centre', 'Centro de planificación financiera'),
        'saved': ('Saved', 'Guardado'),
        'selectPreset': ('Select preset', 'Seleccionar preajuste'),
        'noSchedules': ('No policy schedules saved.', 'No hay programaciones de Team Policy guardadas.'),
        'presetApplied': ('Preset applied to active club policies.', 'Preajuste aplicado a las Team Policy activas del club.'),
        'selectPresetDate': ('Select a preset and game date.', 'Selecciona un preajuste y una fecha del juego.'),
        'scheduleSaved': ('Automatic policy schedule saved.', 'Programación automática de Team Policy guardada.'),
        'limitsSaved': ('Finance planning limits saved.', 'Límites de planificación financiera guardados.'),
    },
    'infrastructure.json': {
        'teamBusGarage': ('Team Bus Garage', 'Garaje de autobuses del equipo'),
        'teamBusGarageDescription': (
            'Team Buses improve rider travel comfort, recovery, fatigue control, and stage-race logistics. Manage the garage by slot, start new deliveries, repair worn buses, or sell available buses.',
            'Los autobuses del equipo mejoran la comodidad de viaje de los ciclistas, la recuperación, el control de la fatiga y la logística de las carreras por etapas. Gestiona el garaje por plazas: inicia nuevas entregas, repara autobuses desgastados o vende los disponibles.',
        ),
        'equipmentVanGarage': ('Equipment Van Garage', 'Garaje de furgonetas de equipamiento'),
        'equipmentVanGarageDescription': (
            'Equipment Vans support bike transport, spare parts coverage, race equipment logistics, and broader event readiness. Manage the garage by slot, start new deliveries, repair worn vans, or sell available vans.',
            'Las furgonetas de equipamiento facilitan el transporte de bicicletas, la cobertura de repuestos, la logística del material de carrera y la preparación general para los eventos. Gestiona el garaje por plazas: inicia nuevas entregas, repara furgonetas desgastadas o vende las disponibles.',
        ),
        'mobileWorkshopGarageDescription': (
            'Mobile Workshops support on-site technical repairs, faster issue response, mechanic coverage, and equipment service capacity. Manage the garage by slot, start new deliveries, repair worn workshops, or sell available workshops.',
            'Los talleres móviles permiten realizar reparaciones técnicas in situ, responder más rápido a los problemas y mejorar la cobertura mecánica y la capacidad de mantenimiento del equipamiento. Gestiona el garaje por plazas: inicia nuevas entregas, repara talleres desgastados o vende los disponibles.',
        ),
        'medicalVanGarageDescription': (
            'Medical Vans support race-day health response, rider treatment access, injury control, and medical coverage. Manage the garage by slot, start new deliveries, repair worn vans, or sell available vans.',
            'Las furgonetas médicas facilitan la respuesta sanitaria en carrera, el acceso al tratamiento de los ciclistas, el control de lesiones y la cobertura médica. Gestiona el garaje por plazas: inicia nuevas entregas, repara furgonetas desgastadas o vende las disponibles.',
        ),
    },
    'raceDetail.json': {
        'rider': ('Rider', 'Ciclista'),
        'preRaceAvailability': ('Pre-race availability', 'Disponibilidad antes de la carrera'),
        'stageUses': ('Stage uses before / used / after', 'Usos de etapa antes / usados / después'),
        'riderTeam': ('Rider / team', 'Ciclista / equipo'),
        'stageResult': ('Stage result', 'Resultado de etapa'),
        'generalClassification': ('General classification', 'Clasificación general'),
        'invalidRaceId': ('Invalid or missing race id.', 'ID de carrera no válido o ausente.'),
    },
    'racePreparation.json': {
        'stagePlanLock': ('Stage Plan lock', 'Bloqueo de Stage Plan'),
        'notSavedYet': ('Not saved yet', 'Aún no guardado'),
        'roadRolesDisabled': (
            'Normal road roles are disabled on Prologue, ITT and TTT stages.',
            'Los roles normales de carretera están desactivados en prólogos y etapas ITT y TTT.',
        ),
        'tttRidersExplainer': (
            'Every rider is treated as a Team Time Trial Rider. The engine calculates counting riders, dropped riders, team cohesion, support work and official team time.',
            'Cada ciclista se trata como un ciclista de contrarreloj por equipos. El motor calcula los ciclistas que cuentan para el tiempo, los descolgados, la cohesión del equipo, el trabajo de apoyo y el tiempo oficial del equipo.',
        ),
        'equipmentCapacityProblem': ('Equipment setup capacity problem', 'Problema de capacidad de la configuración de equipamiento'),
        'noEquipmentPresets': ('No equipment setup presets found', 'No se encontraron configuraciones de equipamiento predefinidas'),
        'raceJerseysNeeded': ('Race jerseys needed', 'Se necesitan kits de carrera'),
        'rider': ('Rider', 'Ciclista'),
        'racePagePreview': ('Race Page Preview', 'Vista previa de la página de carrera'),
        'stages': ('Stages', 'Etapas'),
        'bonusPreview': ('Race Plan Bonus Preview', 'Vista previa de bonificaciones de Race Plan'),
        'profile': ('Profile', 'Perfil'),
        'stageProfileChart': ('Stage profile chart', 'Gráfico del perfil de la etapa'),
        'ttHelp': ('Time Trial tactic and rider role help', 'Ayuda sobre tácticas de contrarreloj y rol del ciclista'),
        'teamTacticHelp': ('Team tactic and rider role help', 'Ayuda sobre táctica de equipo y rol del ciclista'),
        'equipmentPackagePreview': ('Equipment package bonus preview', 'Vista previa de bonificaciones del paquete de equipamiento'),
        'riderEquipmentHelp': ('Rider equipment package help', 'Ayuda sobre el paquete de equipamiento del ciclista'),
        'raceJerseyKit': ('Race Jersey Kit', 'Kit completo de carrera'),
        'finalCalculationHelp': ('Final stage calculation help', 'Ayuda sobre el cálculo final de la etapa'),
        'ttEquipmentEffect': ('TT equipment effect', 'Efecto del equipamiento de contrarreloj'),
        'equipmentCondition': ('Equipment condition', 'Estado del equipamiento'),
        'raceSupport': ('Race support', 'Apoyo en carrera'),
        'recoverySupport': ('Recovery support', 'Apoyo a la recuperación'),
        'teamCohesion': ('Team cohesion', 'Cohesión del equipo'),
        'countingRiderGroup': ('Counting rider group', 'Grupo de ciclistas que cuentan para el tiempo'),
        'droppedRiderRisk': ('Dropped rider risk', 'Riesgo de ciclista descolgado'),
        'racePlanBonusTotal': ('Race Plan bonus total', 'Bonificación total de Race Plan'),
        'equipmentBonusDirection': ('Equipment bonus direction', 'Orientación de la bonificación de equipamiento'),
        'quoteRefreshed': ('Race Plan quote refreshed.', 'Cotización de Race Plan actualizada.'),
    },
    'staff.json': {
        'unlockDevelopingTeam': ('Unlock Developing Team in Preferences first.', 'Desbloquea primero el equipo de desarrollo en Preferencias.'),
    },
    'training.json': {
        'noCurrentCamp': ('No current training camp found', 'No se encontró ninguna concentración de entrenamiento actual'),
        'ridersBooked': ('Riders booked', 'Ciclistas inscritos'),
        'riders': ('Riders', 'Ciclistas'),
        'staff': ('Staff', 'Personal'),
        'trainingProgram': ('Training program', 'Programa de entrenamiento'),
        'rider': ('Rider', 'Ciclista'),
        'riderProgress': ('Rider progress', 'Progreso del ciclista'),
        'staffBoostSummary': ('Staff boost summary', 'Resumen de bonificaciones del personal'),
        'campStaffBoosts': ('Camp staff & boosts', 'Personal y bonificaciones de la concentración'),
    },
    'transfers.json': {
        'riderColon': ('Rider:', 'Ciclista:'),
        'loadingNegotiation': ('Loading transfer negotiation…', 'Cargando negociación de transferencia…'),
        'rider': ('Rider', 'Ciclista'),
        'preferredMinimumSalary': ('Preferred minimum salary', 'Salario mínimo preferido'),
        'preferredContract': ('Preferred contract', 'Contrato preferido'),
        'riderResponse': ('Rider Response', 'Respuesta del ciclista'),
        'salary': ('Salary', 'Salario'),
        'country': ('Country', 'País'),
    },
}


def main() -> None:
    touched = 0
    entries = 0
    for filename, values in sorted(COVERAGE.items()):
        en_path = LOCALES / 'en' / filename
        es_path = LOCALES / 'es' / filename
        en = json.loads(en_path.read_text(encoding='utf-8'))
        es = json.loads(es_path.read_text(encoding='utf-8'))

        en_legacy = en.setdefault('legacyUi', {})
        es_legacy = es.setdefault('legacyUi', {})

        changed = False
        for key, (english, spanish) in values.items():
            if en_legacy.get(key) != english:
                en_legacy[key] = english
                changed = True
            if es_legacy.get(key) != spanish:
                es_legacy[key] = spanish
                changed = True
            entries += 1

        if changed:
            en_path.write_text(json.dumps(en, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            es_path.write_text(json.dumps(es, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            touched += 1

    print(f'Covered {entries} hardcoded UI literals across {touched} EN/ES namespaces.')


if __name__ == '__main__':
    main()
