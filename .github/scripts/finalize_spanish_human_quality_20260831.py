from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ES = ROOT / 'src/i18n/locales/es'

# Human-reviewed neutral Spanish. Keep intentional product/game vocabulary exactly.
FIXES: dict[tuple[str, str], str] = {
    # Account / shell / auth / club
    ('accountPages.json', 'inbox.readOnly'): 'Solo lectura',
    ('accountPages.json', 'inbox.loadConversationsFailed'): 'No se pudieron cargar las conversaciones.',
    ('accountPages.json', 'inbox.loadMessagesFailed'): 'No se pudieron cargar los mensajes.',
    ('accountPages.json', 'invite.activityDescription'): 'Pendiente = tu amigo creó un club, pero todavía no ha comprado Coins. Completado = tu amigo compró su primer paquete de Coins y recibiste la recompensa de 40 Coins.',
    ('accountPages.json', 'profile.emailHelp'): 'Este es el correo electrónico asociado a tu cuenta.',
    ('accountPages.json', 'profile.passwordDescription'): 'Por seguridad, los cambios de contraseña se completan mediante verificación por correo electrónico. Enviaremos un enlace para restablecer la contraseña al correo actual de tu cuenta.',
    ('accountPages.json', 'profile.languageAccountHelp'): 'Esta preferencia se guarda en tu cuenta y se aplica en tus otros dispositivos y futuros inicios de sesión.',
    ('accountPages.json', 'profile.resetFailed'): 'No se pudo enviar el correo electrónico para restablecer la contraseña. Inténtalo de nuevo en unos instantes.',
    ('appShell.json', 'restartModal.loseRiders'): 'Los ciclistas actuales, que se convierten en agentes libres',
    ('auth.json', 'register.resendHelp'): 'Usa esta opción si ya te registraste, pero no recibiste o perdiste el correo electrónico de activación.',
    ('club.json', 'dashboardAccess.welcomeBodyTwo'): 'Se han conservado el nombre de tu club, el logotipo, el maillot, el país y la plaza de competición. Los antiguos ciclistas fueron liberados como agentes libres y el club está listo para un nuevo comienzo.',
    ('club.json', 'dashboardAccess.welcomeGoodLuck'): 'Buena suerte esta vez. Construye con cuidado, controla el presupuesto y devuelve a tu club a lo más alto.',
    ('club.json', 'dashboardAccess.restartKeepsIdentityDescription'): 'Se conservan el ID del club, la cuenta del propietario, el nombre del equipo, el logotipo, el maillot, el país y la plaza de nivel/división. Los ciclistas actuales pasan al mercado de agentes libres, todos los puntos de la temporada se restablecen a 0 y el club recibe una nueva plantilla inicial acorde a su nivel competitivo actual.',
    ('club.json', 'history.founded'): 'Fundado el {{date}}',

    # Overview / preferences / packages
    ('overview.json', 'staffBriefing.coinBalance'): 'Saldo de Coins',
    ('overview.json', 'staffBriefing.notEnoughCoins'): 'No tienes suficientes Coins. Necesitas {{required}} Coins y tu saldo actual es {{balance}}.',
    ('overview.json', 'staffBriefing.eligibleMany'): 'Hay {{count}} miembros del personal que cumplen los requisitos para recibir apoyo de asesoría.',
    ('overview.json', 'staffBriefing.pausedRenewIntro'): 'Se conserva el tiempo de juego pagado. Esta renovación opcional añade {{months}} meses de juego por {{coins}} Coins. Contratar un reemplazo no requiere otra compra.',
    ('overview.json', 'squad.availableRiders'): 'ciclistas disponibles',
    ('preferences.json', 'developingTeam.rosterRule'): 'Tamaño máximo de la plantilla: 8 ciclistas.',
    ('preferences.json', 'dangerZone.restartDetail'): 'Los ciclistas actuales se convierten en agentes libres, los puntos de la temporada se restablecen a 0 y el equipo recibe una nueva plantilla inicial acorde a su nivel actual.',
    ('preferencesDynamic.json', 'service.autoRenewHelp'): 'Cuando esté activada, la renovación descontará {{cost}} Coins al comienzo de la próxima temporada. Si tu saldo es demasiado bajo, la renovación fallará y el equipo de desarrollo pasará a modo de solo lectura.',
    ('preferencesDynamic.json', 'service.confirmActivate'): '¿Activar el equipo de desarrollo para la temporada {{season}}?',
    ('preferencesDynamic.json', 'service.deductCoins'): 'Se descontarán {{cost}} Coins de tu saldo.',
    ('proPackages.json', 'packages.description'): 'Las cuentas Gratis y Premium pueden comprar Coins adicionales para funciones y expansiones opcionales. Comprar Coins no activa la membresía Premium.',
    ('proPackages.json', 'services.autoRenewSuffix'): 'el coste en Coins se descontará al comienzo de la próxima temporada. Si el saldo es demasiado bajo, la renovación fallará y el equipo de desarrollo pasará a modo de solo lectura.',
    ('proPackages.json', 'services.autoEnabled'): 'Renovación automática activada. Se cobrarán {{cost}} Coins al comienzo de la próxima temporada.',

    # Public information
    ('publicInfo.json', 'about.teamText'): 'Construye tu equipo con velocistas, escaladores, especialistas en contrarreloj, gregarios, líderes y jóvenes ciclistas. Los contratos, la moral, la fatiga, el potencial y el desarrollo importan.',
    ('publicInfo.json', 'terms.s2p1'): 'ProPeloton Manager es un juego de gestión de ciclismo en línea. El juego puede incluir creación de equipos, gestión de ciclistas, entrenamiento, preparación de carreras, transferencias, rankings, sistemas financieros, patrocinadores, funciones Premium, Coins y otras características de juego.',
    ('publicInfo.json', 'terms.s5p4'): 'Las Coins no utilizadas permanecen asociadas a la cuenta y no caducan durante el uso normal de la cuenta ni tras cancelar Premium. Las Coins vinculadas a un pago reembolsado, revertido, disputado, fraudulento o no autorizado pueden eliminarse o corregirse.',
    ('publicInfo.json', 'terms.s6p4'): 'Las Coins no utilizadas permanecen normalmente en la cuenta después de cancelar Premium. Si un pago Premium es reembolsado, revertido, disputado, fraudulento o no autorizado, el acceso a Premium y las Coins asociadas a ese pago pueden eliminarse o corregirse.',

    # Finance
    ('finance.json', 'page.loadFailed'): 'No se pudieron cargar los datos financieros.',
    ('finance.json', 'page.noSponsorClub'): 'Crea un club principal o únete a uno para ver los patrocinadores.',
    ('finance.json', 'page.noTransactionClub'): 'Crea un club principal o únete a uno para ver las transacciones.',
    ('finance.json', 'page.noTaxClub'): 'Crea un club principal o únete a uno para ver los datos fiscales.',
    ('finance.json', 'page.tabCrashed'): 'La pestaña dejó de funcionar.',
    ('finance.json', 'tabs.transactions'): 'Transacciones',
    ('finance.json', 'common.free'): 'Gratis',
    ('finance.json', 'transactionLabels.newClubBonus'): 'Bonificación por nuevo club',
    ('finance.json', 'transactionLabels.trainingCampRefund'): 'Reembolso de concentración de entrenamiento',
    ('finance.json', 'transactionLabels.trainingCampBooking'): 'Reserva de concentración de entrenamiento',
    ('finance.json', 'transactionLabels.equipmentPurchase'): 'Compra de equipamiento',
    ('finance.json', 'transactionLabels.freeAgentSigningCostPaid'): 'Coste de fichaje de agente libre pagado',
    ('finance.json', 'policyEffects.morale'): '+{{value}} moral',
    ('finance.json', 'policyEffects.contractHappiness'): '+{{value}} satisfacción contractual',
    ('finance.json', 'overview.netOperatingValue'): 'Resultado operativo neto: {{amount}}',
    ('finance.json', 'overview.emergencyDebtDescription'): 'El flujo de caja de la deuda se muestra por separado de los ingresos y gastos operativos.',
    ('finance.json', 'overview.top5Income'): '5 principales ingresos',
    ('finance.json', 'overview.operatingView'): 'Vista operativa del periodo seleccionado.',
    ('finance.json', 'overview.netOperating'): 'Resultado operativo neto',
    ('finance.json', 'overview.netFormula'): 'ingresos - gastos operativos',
    ('finance.json', 'overview.netTrend'): 'Tendencia del resultado operativo neto',
    ('finance.json', 'overview.hoverBar'): 'Pasa el cursor sobre una barra para ver los detalles.',
    ('finance.json', 'overview.hoverDot'): 'Pasa el cursor sobre un punto para ver los detalles.',
    ('finance.json', 'sponsors.mainDescription'): 'Tu principal socio de la temporada y tu mayor fuente de ingresos por patrocinio.',
    ('finance.json', 'sponsors.secondaryDescription'): 'Hasta tres acuerdos con patrocinadores secundarios por temporada.',
    ('finance.json', 'sponsors.technicalDescription'): 'Socio de equipamiento que aporta apoyo económico y descuentos en equipamiento de la marca patrocinadora.',
    ('finance.json', 'sponsors.equipmentSupportNotCashLong'): 'El fondo de equipamiento no es efectivo. Solo puede utilizarse para descuentos en equipamiento de la marca patrocinadora. No hay un límite fijo de unidades; el límite es el saldo restante del fondo de equipamiento.',
    ('finance.json', 'sponsors.unusedSupportExpires'): 'El fondo de equipamiento no utilizado caduca al final de la temporada.',
    ('finance.json', 'sponsors.bonusPool'): 'Fondo de bonificaciones',
    ('finance.json', 'sponsors.dealType'): 'Tipo de acuerdo',
    ('finance.json', 'sponsors.supportingSponsor'): 'Patrocinador secundario',
    ('finance.json', 'sponsors.mainPackageDescription'): 'Esta oferta paga una cantidad garantizada en cuanto se firma. El fondo de bonificaciones solo se paga después si tu equipo cumple objetivos del patrocinador, como participar en carreras objetivo, conseguir victorias, podios, resultados en el top 5 u objetivos de GC.',
    ('finance.json', 'sponsors.namingIdentityDescription'): 'Durante la temporada del patrocinio, el equipo se muestra con este nombre. El nombre original del club se conserva únicamente en el historial.',
    ('finance.json', 'sponsors.historyLabel'): 'Nombre en el historial después del acuerdo: {{name}}',
    ('finance.json', 'sponsors.historyLabelPrefix'): 'Nombre en el historial después del acuerdo:',
    ('finance.json', 'sponsors.noObjectives'): 'Todavía no hay objetivos del patrocinador principal.',
    ('finance.json', 'sponsors.stageTop5'): 'Top 5 de etapa',
    ('finance.json', 'sponsors.stageWin'): 'Victoria de etapa',
    ('finance.json', 'sponsors.noMain'): 'No hay patrocinador principal firmado',
    ('finance.json', 'sponsors.slotUsage'): 'Uso de plazas',
    ('finance.json', 'sponsors.slotsFilled'): '{{used}}/{{total}} ocupadas',
    ('finance.json', 'sponsors.slot'): 'Plaza {{slot}}',
    ('finance.json', 'sponsors.noSlotSponsor'): 'Todavía no hay ningún patrocinador asignado a esta plaza.',
    ('finance.json', 'sponsors.noActiveFund'): 'No hay un fondo de equipamiento activo',
    ('finance.json', 'sponsors.cashSupport'): 'Apoyo económico',
    ('finance.json', 'sponsors.supportUsed'): 'Se ha utilizado el {{percent}}% del fondo de equipamiento.',
    ('finance.json', 'sponsors.equipmentSupportNotCash'): 'El fondo de equipamiento no es efectivo. Solo puede utilizarse para descuentos en equipamiento de la marca patrocinadora. El saldo no utilizado caduca al final de la temporada.',
    ('finance.json', 'sponsors.noTechnicalDescription'): 'Firma con un patrocinador técnico para desbloquear descuentos en equipamiento de su marca.',
    ('finance.json', 'sponsors.supportStatus'): 'Estado del apoyo',
    ('finance.json', 'sponsors.supportStatusDescription'): 'El apoyo del patrocinador técnico se divide entre efectivo y un fondo estacional de descuentos en equipamiento.',
    ('finance.json', 'sponsors.cashSupportTitle'): 'Apoyo económico',
    ('finance.json', 'sponsors.equipmentSupportFund'): 'Fondo de equipamiento',
    ('finance.json', 'sponsors.equipmentSupportFundDescription'): 'Se utiliza automáticamente al comprar equipamiento compatible de la marca patrocinadora.',
    ('finance.json', 'sponsors.previewMultipleTop5Title'): 'Varios resultados en el top 5',
    ('finance.json', 'sponsors.previewSportingResultsDescription'): 'El dinero adicional depende de resultados como victorias, podios, puestos en el top 5 o top 10 y objetivos de GC.',
    ('finance.json', 'tax.noStatement'): 'No se encontraron declaraciones fiscales.',

    # Transfers
    ('transfers.json', 'negotiationIntelligence.roleWarning'): 'La plantilla ya tiene varios ciclistas en este rol.',
    ('transfers.json', 'tutorial.welcomeBody'): 'Te mostraremos cómo funcionan los traspasos de ciclistas, los agentes libres, el scouting, las negociaciones de contratos y la contratación de personal.',
    ('transfers.json', 'tutorial.transferListTitle'): 'Lista de transferencias de ciclistas',
    ('transfers.json', 'tutorial.transferListBody'): 'Esta es la página de Transferencias.\n\nEn la sección Ciclistas, la lista de transferencias muestra a los ciclistas puestos en el mercado por otros equipos, incluidos equipos de IA.\n\nAntes de hacer scouting de un ciclista, parte de la información puede estar oculta o ser menos precisa. El scouting te ofrece información más fiable sobre sus habilidades y potencial.\n\nCada anuncio indica durante cuánto tiempo sigue vigente y el precio inicial de la negociación. Si pulsas Hacer oferta, puedes presentar una oferta al equipo vendedor. Si la acepta, pasarás a negociar el contrato con el ciclista.',
    ('transfers.json', 'tutorial.freeAgentsTitle'): 'Ciclistas agentes libres',
    ('transfers.json', 'tutorial.freeAgentsBody'): 'Los agentes libres son ciclistas sin equipo.\n\nLa principal diferencia es que no hay un equipo vendedor entre tú y el ciclista. Si te interesa un agente libre, pasas directamente a negociar su contrato.\n\nPuedes negociar el salario, la duración del contrato y la comisión del agente. La perspectiva de la oferta te ayuda a valorar si tu propuesta es sólida, arriesgada o poco probable que prospere.',
    ('transfers.json', 'tutorial.staffBody'): 'La pestaña Personal muestra los miembros del personal que están disponibles como agentes libres.\n\nAquí puedes revisar sus habilidades, rol, salario, especialización y disponibilidad. Solo se puede contratar personal que esté libre.\n\nLos límites de personal son importantes. Si tu club ya ha alcanzado el máximo permitido para un rol, no podrás contratar a otra persona para ese puesto hasta aumentar el límite, normalmente mediante mejoras de infraestructura.\n\nDespués de Transferencias, la siguiente página recomendada es Finanzas.',

    # Rider profile
    ('riderProfile.json', 'owned.performanceMatrixSubtitle'): 'Resumen Premium del rendimiento deportivo, el desarrollo y la situación financiera',
    ('riderProfile.json', 'ownedProfile.imageUpdated'): 'Imagen actualizada correctamente. Se han cobrado {{coins}} Coins.',
    ('riderProfile.json', 'ownedTraining.overrideOn'): 'Anulación activa',
    ('riderProfile.json', 'ownedTraining.noActivity'): 'Todavía no hay actividad registrada para este ciclista.',

    # Infrastructure
    ('infrastructure.json', 'common.currentCoinBalance'): 'Saldo actual de Coins:',
    ('infrastructure.json', 'facilities.jobInProgress'): 'Trabajos de infraestructura en curso: {{count}}',
    ('infrastructure.json', 'facilities.coachingImpact'): 'Los efectos de entrenamiento y desarrollo de los entrenadores principales dependen del nivel de esta instalación.',
    ('infrastructure.json', 'facilities.medicalImpact'): 'Los efectos de recuperación médica y prevención de lesiones dependen del nivel de esta instalación.',
    ('infrastructure.json', 'assets.teamBusGarage'): 'Garaje de autobuses del equipo',
    ('infrastructure.json', 'assets.teamCarDescription'): 'Los coches del equipo aportan apoyo en carrera, comunicación táctica, cobertura de avituallamiento y reducción de la fatiga en los días de competición. Gestiona el garaje por plazas: encarga nuevas unidades, repara coches usados o vende los que estén disponibles.',
    ('infrastructure.json', 'assets.teamBusDescription'): 'Los autobuses del equipo mejoran la comodidad de viaje de los ciclistas, la recuperación, el control de la fatiga y la logística de carrera. Gestiona el garaje por plazas: encarga nuevas unidades, repara autobuses usados o vende los que estén disponibles.',
    ('infrastructure.json', 'assets.mobileWorkshopDescription'): 'Los talleres móviles permiten realizar reparaciones técnicas in situ, responder más rápido a los problemas y mejorar la cobertura mecánica y la capacidad de mantenimiento del equipamiento. Gestiona el garaje por plazas: encarga nuevas unidades, repara talleres desgastados o vende los que estén disponibles.',
    ('infrastructure.json', 'assetModal.closeAria'): 'Cerrar modal de activos',
    ('infrastructure.json', 'facilityUpgrades.mechanics_workshop.level3.unlock'): 'Desbloquea la cuarta plaza de mecánico y permite reparar el equipamiento un 20% más rápido y con un 20% menos de coste.',
    ('infrastructure.json', 'facilityUpgrades.scouting_office.level1.effect'): 'Mantiene el límite básico de calidad de los informes, pero mejora la capacidad de scouting.',

    # Equipment
    ('equipment.json', 'common.saving'): 'Guardando...',
    ('equipment.json', 'overview.equipmentSupport'): 'Fondo de equipamiento',
    ('equipment.json', 'overview.intelligenceDescription'): 'Ayuda de planificación basada en el equipamiento que ya posee tu club. No añade ninguna bonificación de rendimiento oculta.',
    ('equipment.json', 'overview.supportNotice'): 'El fondo de equipamiento no es efectivo. Solo puede utilizarse para descuentos en equipamiento de la marca patrocinadora y el saldo no utilizado caduca al final de la temporada.',
    ('equipment.json', 'overview.maintenanceItem'): 'Elementos que necesitan mantenimiento: {{count}}',
    ('equipment.json', 'inventory.showing'): 'Mostrando {{count}} elementos activos de {{category}}.',
    ('equipment.json', 'inventory.showingRole'): 'Mostrando {{count}} elementos activos de {{category}} para {{role}}.',
    ('equipment.json', 'inventory.plannerDescription'): 'Guarda un umbral de aviso e inicia conjuntamente las reparaciones disponibles. Cada reparación mantiene su coste en efectivo y su duración normal.',
    ('equipment.json', 'presets.description'): 'Guarda hasta cuatro configuraciones de equipamiento preferidas. La capacidad indica cuántos ciclistas pueden utilizar exactamente esa configuración en una etapa.',
    ('equipment.json', 'presets.previewInfo'): 'Se calcula solo a partir de los tipos de equipamiento seleccionados que posee tu club.',
    ('equipment.json', 'supplies.description'): 'Suministros de carrera utilizados por la preparación de carrera y Stage Plans. Los consumibles se gastan con un solo uso; el kit completo de carrera y las chaquetas de lluvia son suministros reutilizables con un número limitado de usos por etapa.',
    ('equipment.json', 'supplies.noneFound'): 'No se encontraron suministros de carrera. Los suministros previstos son bidones, geles energéticos, paquetes de nutrición, kit completo de carrera y chaquetas de lluvia.',
    ('equipment.json', 'supplies.durablePanelDescription'): 'El kit completo de carrera y las chaquetas de lluvia son unidades reutilizables. Este panel muestra en un mismo lugar las unidades disponibles y los usos por etapa que les quedan.',
    ('equipment.json', 'supplies.jersey'): 'Kit completo de carrera',
    ('equipment.json', 'supplies.jerseyStage'): 'Obligatorio en Stage Plans. Se necesita un kit completo de carrera por cada ciclista seleccionado.',
    ('equipment.json', 'supplies.jerseyNegative1'): 'Falta el kit de carrera: se bloquea la configuración de la etapa',
    ('equipment.json', 'supplies.rainStage'): 'Opcional en Stage Plans: ninguno o todos los ciclistas.',
    ('equipment.json', 'tutorial.inventoryBody'): 'La pestaña Inventario muestra todo el equipamiento que posee actualmente tu equipo. Aquí puedes ver bicicletas, ruedas, neumáticos y otros artículos. Puedes comprobar su calidad, estado, valor, bonificaciones y disponibilidad. Si ya no necesitas algún elemento, puedes venderlo desde el inventario.',
    ('equipment.json', 'tutorial.marketBody'): 'La pestaña Mercado es donde compras equipamiento nuevo. Cada artículo tiene un precio y puede aportar distintas bonificaciones. Un equipamiento mejor puede aumentar el rendimiento en carrera, pero también cuesta más. Cuando compras un artículo, se añade a tu inventario y después puedes utilizarlo en las configuraciones de carrera.',
    ('equipment.json', 'tutorial.suppliesBody'): 'La pestaña Suministros de carrera muestra los consumibles que tu equipo puede utilizar en competición. Algunos se usan una sola vez y otros pueden reutilizarse. Los suministros pueden ayudar a proteger a los ciclistas en condiciones difíciles. Sin el material adecuado, los ciclistas pueden sufrir efectos negativos con calor, frío u otras condiciones exigentes.',

    # Race detail / preparation
    ('raceDetail.json', 'participants.teamRiderCount'): 'Equipos: {{teams}} · Ciclistas asignados: {{riders}}',
    ('raceDetail.json', 'participants.riderDetailsUnavailable'): '{{count}} ciclistas asignados. Los detalles de los ciclistas todavía no están disponibles.',
    ('raceDetail.json', 'participants.noRiders'): 'Todavía no hay ciclistas asignados.',
    ('raceDetail.json', 'replay.unlockFor'): 'Desbloquear por {{coins}} Coins',
    ('raceDetail.json', 'replay.roadDescription'): 'Sigue los grupos, diferencias, ataques y puntos a medida que se desarrolla la etapa',
    ('raceDetail.json', 'tutorial.profileBody'): 'Aquí puedes ver la información más importante de la carrera: cuántos equipos pueden participar, el fondo de premios, cuándo se cierran las solicitudes, cuándo se anuncian los equipos participantes y cuántos ciclistas puede llevar cada equipo. En las carreras por etapas también puedes ver cuántas etapas están incluidas.',
    ('raceDetail.json', 'tutorial.stagesBody'): 'El perfil de la carrera también muestra información detallada de cada etapa. Puedes revisar los perfiles, los mapas de ruta, el reparto del terreno, el tiempo previsto, los puntos de sprint, los puntos de montaña y otros detalles. El tiempo solo se publica cerca de la carrera, por lo que puede aparecer más adelante. Más abajo, la información de carrera muestra los equipos y ciclistas participantes antes de la salida y los resultados después. Si tu equipo participa y la carrera está activa o terminada, puedes seguir la acción en el mapa o ver la repetición.',
    ('racePreparation.json', 'page.subtitle'): 'Las carreras aceptadas aparecen primero. Race Plan gestiona la Startlist completa de la carrera, los viajes, el personal, los activos y los costes. Stage Plans gestionan las tácticas etapa por etapa después de enviar Race Plan.',
    ('racePreparation.json', 'racePlan.fatigueHelp'): 'La fatiga sigue siendo el principal limitador. Un ciclista con buen Race Sharpness, pero con una fatiga muy alta, no comenzará la carrera completamente fresco.',
    ('racePreparation.json', 'errors.selectU23Save'): 'Selecciona un entrenador principal U23 o vuelve a asignar la planificación táctica al director deportivo antes de guardar el Race Plan.',
    ('racePreparation.json', 'errors.selectU23Submit'): 'Selecciona un entrenador principal U23 o vuelve a asignar la planificación táctica al director deportivo antes de enviar el Race Plan.',
    ('racePreparation.json', 'tactics.ttAllOut'): 'contrarreloj a tope',
    ('racePreparation.json', 'tactics.ttAllOutDesc'): 'Máxima velocidad desde el inicio. Es la opción más rápida, pero provoca mucha fatiga y aumenta el riesgo de desfallecer.',

    # Training
    ('training.json', 'page.focusedRider'): 'Entrenamiento centrado en el ciclista',
    ('training.json', 'page.focusedRiderText'): 'Abierto desde el perfil del ciclista (ID: {{id}}).',
    ('training.json', 'regular.riderOverridesPremium'): 'Las tareas del entrenador principal aparecen aquí como el entrenamiento efectivo de hoy. Editar a un ciclista gestionado por el entrenador crea una anulación de un día; el entrenador retoma el control al siguiente día de juego.',
    ('training.json', 'coach.youthStat'): 'Jóvenes: {{value}}',
    ('training.json', 'coach.noEligibleHeadCoach'): 'No hay ningún entrenador principal elegible disponible.',
    ('training.json', 'coach.recoveryQuality'): 'La planificación de la recuperación controla la intensidad en función de la fatiga y las decisiones de descanso.',
    ('training.json', 'camps.minimumRiders'): 'Mínimo: 5 ciclistas',
    ('training.json', 'camps.overlapWarning'): 'Algunos ciclistas no están disponibles para las fechas seleccionadas porque ya están asignados a una concentración de entrenamiento que se solapa.',
    ('training.json', 'camps.noAssignedRiders'): 'No se encontraron ciclistas asignados.',
    ('training.json', 'currentCamp.ridersBooked'): 'ciclistas inscritos',
    ('training.json', 'currentCamp.hiddenDescription'): 'Esta concentración está fuera de la ventana visible u otra concentración de entrenamiento está activa actualmente.',
    ('training.json', 'currentCamp.noRiders'): 'Todavía no hay ciclistas asignados a esta concentración.',

    # Staff / squad / statistics
    ('staff.json', 'roles.sportDirector.subtitle'): 'Tácticas de carrera planificadas, moral, trabajo en equipo y apoyo de gregarios.',
    ('staff.json', 'impactAreas.u23RaceTactics'): 'Tácticas de carrera U23',
    ('staff.json', 'courseOptions.u23_race_readiness_course.description'): 'Prepara a jóvenes ciclistas para la estructura del día de carrera, la disciplina y el desarrollo táctico.',
    ('squad.json', 'healthReport.subtitle'): 'Estado actual de los ciclistas lesionados, enfermos y en recuperación de la plantilla',
    ('statistics.json', 'page.subtitle'): 'Estadísticas de equipos y ciclistas de todo el mundo del ciclismo. Los rankings de ciclistas son globales y comparan a los mejores ciclistas de todos los equipos del juego.',
    ('statistics.json', 'page.loadFailed'): 'No se pudieron cargar las estadísticas.',
    ('statistics.json', 'common.showing'): 'Mostrando {{start}}-{{end}} de {{total}}',
    ('statistics.json', 'teams.countrySpreadSubtitle'): 'Número de equipos por país en el filtro actual.',
    ('statistics.json', 'riders.roleDistributionSubtitle'): 'Distribución de los ciclistas por rol en el filtro seleccionado.',
    ('statistics.json', 'riders.ageDistributionSubtitle'): 'Una forma rápida de ver cómo se distribuyen por edad los ciclistas del filtro seleccionado.',
    ('statistics.json', 'riders.noAgeDescription'): 'Los grupos de edad aparecerán cuando se hayan cargado los ciclistas.',
    ('statistics.json', 'riders.topRiders'): 'Los mejores ciclistas',
    ('statistics.json', 'riders.top50Subtitle'): 'Los mejores ciclistas disponibles en el filtro actual.',
    ('statistics.json', 'riders.noRidersAvailable'): 'No hay ciclistas disponibles',
    ('statistics.json', 'tutorial.welcomeBody'): 'Te mostraremos cómo funcionan las estadísticas de equipos y ciclistas, incluidos los rankings de la temporada actual, los resultados históricos, los puntos de los ciclistas, los podios y los maillots.',
    ('statistics.json', 'tutorial.ridersBody'): 'La sección Ciclistas muestra a los mejores ciclistas del mundo. Puedes compararlos por puntos internacionales, puntos de meta, GC y puntos de un día. También puedes ver quién acumula más podios y maillots. Esta página te ayuda a entender qué ciclistas dominan la temporada y cuáles puede interesarte seguir, analizar o fichar. Después de Estadísticas, la siguiente página recomendada es Transferencias.',

    # Tutorials
    ('tutorials.json', 'squad.welcome.body'): 'Te mostraremos una breve introducción a la página Plantilla, donde gestionas a tus ciclistas, el equipo de desarrollo, las ventanas de movimiento y el personal.',
    ('tutorials.json', 'squad.developing.body'): 'Tu equipo de desarrollo es tu segundo equipo. Está pensado para ciclistas jóvenes que todavía no están preparados para la primera plantilla, pero pueden competir en las competiciones asignadas. Primero debes desbloquear el equipo de desarrollo; encontrarás más información en Preferencias. Los ciclistas solo pueden moverse entre la primera plantilla y el equipo de desarrollo durante las ventanas de movimiento. Estas ventanas se abren cuatro veces al año y la página Plantilla muestra cuándo estará disponible la siguiente. Algunas herramientas de gestión, vistas ampliadas o funciones de comodidad relacionadas con esta área pueden requerir Premium o Coins.',
    ('tutorials.json', 'raceDetail.overview.body'): 'Aquí puedes ver la información más importante de la carrera: cuántos equipos pueden participar, el fondo de premios, cuándo se cierran las solicitudes, cuándo se anuncian los equipos participantes y cuántos ciclistas puede llevar cada equipo. En las carreras por etapas también puedes ver cuántas etapas están incluidas.',
    ('tutorials.json', 'raceDetail.stagesResults.body'): 'El perfil de la carrera también muestra información detallada de cada etapa. Puedes revisar perfiles, mapas de ruta, reparto del terreno, tiempo previsto, puntos de sprint, puntos de montaña y otros detalles. El tiempo solo se publica cerca de la carrera, por lo que puede aparecer más adelante. Más abajo se muestran los equipos y ciclistas participantes antes de la salida y los resultados después. Si tu equipo participa y la carrera está activa o terminada, puedes seguir la acción en el mapa o ver la repetición.',
    ('tutorials.json', 'racePreparation.acceptedRaces.body'): 'Esta es la página de preparación de carrera. La pestaña Carreras aceptadas muestra las pruebas en las que tu equipo ha sido admitido. Aquí puedes ver la información principal de la carrera y el estado de preparación del equipo. Por ejemplo, sabrás si Race Plan está abierto, si Stage Plans están abiertos, si ha vencido el plazo de inscripción de ciclistas, si la carrera está activa o terminada o si todo está listo. Cuando acepten a tu equipo, vuelve aquí para preparar ciclistas, personal, activos, equipamiento, suministros y tácticas. Será una de las páginas que más visites durante la temporada.',
    ('tutorials.json', 'racePreparation.racePlan.body'): 'En la pestaña Race Plan preparas a tu equipo para una carrera aceptada. El tiempo del juego avanza más rápido que el tiempo real: un día de juego equivale a 12 horas reales. Tenlo en cuenta al comprobar las ventanas y los plazos. Cuando Race Plan esté abierto, puedes elegir si compite la primera plantilla o el equipo de desarrollo, si lo tienes disponible. También debes respetar el plazo de inscripción de ciclistas. Hasta esa fecha puedes seleccionar a quienes participarán. La página muestra el número mínimo y máximo de ciclistas permitidos y quién está bloqueado por coincidir con otra carrera. También puedes asignar personal y activos disponibles. La previsión de costes se actualiza mientras preparas el plan para que sepas cuánto costará la carrera.',
    ('tutorials.json', 'racePreparation.stagePlans.body'): 'La pestaña Stage Plans se abre después de enviar Race Plan. Aquí preparas las tácticas de cada etapa. Puedes definir roles de los ciclistas, equipamiento, suministros, tácticas de equipo y tácticas individuales. Stage Plans son importantes porque cada tipo de etapa exige un planteamiento distinto: una etapa llana al sprint, una jornada de montaña, una contrarreloj o una etapa quebrada pueden requerir ciclistas, tácticas y apoyos diferentes.',
    ('tutorials.json', 'teamRanking.points.body'): 'Los equipos ganan puntos internacionales en las carreras. Los mejores resultados en pruebas de mayor nivel suelen otorgar más puntos. Estos puntos determinan la posición de cada equipo dentro de su competición. Al final de la temporada, los equipos pueden ascender o descender según su posición final. Esta página te permite comparar a tu equipo con sus rivales y saber qué necesitas para ascender. Después del Ranking de equipos, la siguiente página recomendada es Estadísticas.',
    ('tutorials.json', 'statistics.welcome.body'): 'Te mostraremos cómo funcionan las estadísticas de equipos y ciclistas, incluidos los rankings de la temporada actual, los resultados históricos, los puntos de los ciclistas, los podios y los maillots.',
    ('tutorials.json', 'statistics.riders.body'): 'La sección Ciclistas muestra a los mejores ciclistas del mundo. Puedes compararlos por puntos internacionales, puntos de meta, GC y puntos de un día. También puedes ver quién acumula más podios y maillots. Esta página te ayuda a entender qué ciclistas dominan la temporada y cuáles puede interesarte seguir, analizar o fichar. Después de Estadísticas, la siguiente página recomendada es Transferencias.',
    ('tutorials.json', 'transfers.welcome.body'): 'Te mostraremos cómo funcionan los traspasos de ciclistas, los agentes libres, el scouting, las negociaciones de contratos y la contratación de personal.',
    ('tutorials.json', 'transfers.riderTransferList.title'): 'Lista de transferencias de ciclistas',
    ('tutorials.json', 'transfers.riderFreeAgents.title'): 'Ciclistas agentes libres',
    ('tutorials.json', 'transfers.riderFreeAgents.body'): 'Los agentes libres son ciclistas sin equipo. La principal diferencia es que no hay un equipo vendedor entre tú y el ciclista. Si te interesa un agente libre, pasas directamente a negociar su contrato. Puedes negociar el salario, la duración del contrato y la comisión del agente. La perspectiva de la oferta te ayuda a valorar si tu propuesta es sólida, arriesgada o poco probable que prospere.',
    ('tutorials.json', 'finance.overview.body'): 'Esta es la página Finanzas. La pestaña Resumen muestra la situación financiera principal de tu club, incluidos el saldo actual, los ingresos, los gastos, el flujo de caja y los resúmenes financieros. Si tu equipo tiene deuda de emergencia o problemas económicos, aquí puedes entender rápidamente la situación actual.',
    ('tutorials.json', 'finance.transactions.body'): 'La pestaña Transacciones muestra el historial financiero de tu club. Aquí puedes ver ingresos y gastos de la temporada, incluidos premios, pagos de patrocinadores, salarios, transferencias, infraestructura, compras de equipamiento, concentraciones de entrenamiento, retenciones fiscales y otros movimientos financieros.',
    ('tutorials.json', 'finance.tax.body'): 'La pestaña Impuestos muestra la situación fiscal de tu club. Las transacciones pueden generar obligaciones fiscales y se realiza una liquidación fiscal una vez al mes. Aquí puedes ver cuánto impuesto se ha calculado, cuánto se ha pagado y cuánto queda pendiente.',
    ('tutorials.json', 'finance.policies.body'): 'Team Policy controla aspectos de la operativa de tu club. Cambiar estas políticas puede hacerlo más atractivo para ciclistas y personal, pero también aumentar los costes de viajes, apoyo en carrera, concentraciones de entrenamiento y operaciones diarias. Esta sección te ayuda a equilibrar comodidad, rendimiento, atractivo y coste. Después de Finanzas, el siguiente tutorial explica el menú principal.',
    ('tutorials.json', 'menu.main.body'): 'Este es el botón del menú principal, en la esquina superior derecha. Desde aquí puedes abrir la bandeja de entrada, el perfil, los temas y opciones de personalización, el foro o Discord, las preferencias del juego, el manual y las preguntas frecuentes, Contacto, los paquetes Pro y el progreso de Invitación de amigos. Usa este menú cuando necesites ajustes de cuenta, ayuda, soporte, preferencias u otras opciones del juego.',
    ('tutorials.json', 'menu.coins.body'): 'Aquí se muestra tu saldo actual de Coins. Las Coins se utilizan en determinadas funciones, desbloqueos y opciones de comodidad de ProPeloton Manager. Puedes comprobar el saldo en cualquier momento y comprar más desde Menú → Paquetes Pro. Tener pocas Coins no suspende tu cuenta: puedes seguir jugando, aunque algunas funciones opcionales pueden no estar disponibles hasta que añadas más Coins.',
    ('tutorials.json', 'menu.premium.body'): 'Esta es tu zona de acceso Premium. Premium puede hacer la experiencia más cómoda al ofrecer funciones adicionales, vistas avanzadas y herramientas útiles. Al comprar Premium o paquetes Pro también apoyas directamente al equipo y contribuyes al desarrollo de ProPeloton Manager.',
    ('tutorials.json', 'menu.finished.body'): 'Has completado el tutorial básico de ProPeloton Manager. Si más adelante tienes dudas, puedes consultar el manual, leer las preguntas frecuentes, contactar con nosotros o unirte a nuestra comunidad de Discord. ¡Buena suerte con tu equipo!',

    # Help
    ('help.json', 'basics.b6Text'): 'Los puntos internacionales determinan tu posición. Los ascensos y descensos hacen que cada temporada sea importante, especialmente para los clubes ProTeam, Continental y amateur.',
    ('help.json', 'manual.infrastructureText'): 'Construye y mejora instalaciones como la sede del club, el centro de entrenamiento, el centro médico, el taller de mecánica, la academia juvenil y la oficina de scouting. También gestiona los vehículos del equipo y otros activos de apoyo.',
    ('help.json', 'faq.q6'): '¿Cómo puedo mejorar a mis ciclistas más rápido?',

    # Manual family — high-confidence semantic/grammar repairs
    ('manual.json', 'guide.categoryIntro.getting-started'): '{{title}} forma parte de la rutina inicial de gestión. Si acabas de empezar, no intentes optimizarlo todo de inmediato. Primero identifica qué controla cada página, qué información es fiable, qué plazos existen y qué acciones pueden tener consecuencias permanentes o costosas.',
    ('manual.json', 'guide.categoryIntro.coins-and-account'): '{{title}} pertenece a la capa de cuenta, no a la economía normal del club. Separa las Coins y los ajustes de identidad/perfil de las finanzas del equipo. Si una función utiliza Coins, comprueba el saldo de tu cuenta y el precio actual del paquete o servicio antes de confirmar nada.',
    ('manual.json', 'guide.commonMistake.finance'): 'Un error habitual es mirar solo el saldo actual. Un balance saludable puede ocultar futuros salarios, impuestos, políticas, viajes u obligaciones de deuda. Revisa conjuntamente los costes recurrentes y las transacciones antes de comprometer efectivo.',
    ('manual.json', 'guide.detail.quote'): 'Una cotización es la vista previa del juego sobre la consecuencia real antes de confirmar una acción. Revisa siempre el coste total o reembolso, la duración, la elegibilidad y las advertencias. El valor mostrado es más fiable que un ejemplo antiguo del manual porque el equilibrio o la configuración del motor pueden cambiar con el tiempo.',
    ('manual.json', 'guide.detail.nutrition'): 'Los consumibles se multiplican por ciclista y por etapa. Calcula el stock necesario según el número real de ciclistas seleccionados y todas las etapas, y deja una pequeña reserva cuando sea posible. Una estimación para un solo día no basta para una carrera por etapas.',
    ('manual.json', 'sections.quick-start.details[3]'): 'Abre Calendario para entender la temporada. Solicita carreras que encajen con tu equipo, pero no sobrecargues a tus ciclistas. Un equipo pequeño puede perder rendimiento rápidamente si los mismos ciclistas compiten con demasiada frecuencia.',
    ('manual.json', 'sections.quick-start.details[5]'): 'Abre Finanzas antes de realizar transferencias, comprar equipamiento, invertir en infraestructura o reservar concentraciones de entrenamiento. Necesitas efectivo para salarios, personal, impuestos, equipamiento, apoyo en carrera, concentraciones, políticas y transferencias.',
    ('manual.json', 'sections.coins.subtitle'): 'La diferencia entre las Coins de la cuenta y el efectivo del club.',
    ('manual.json', 'sections.coins.overview'): 'Las Coins pertenecen a la cuenta. El efectivo del club corresponde a la economía del equipo. No confundas Coins con el dinero del juego utilizado para salarios, transferencias, equipamiento e infraestructura.',
    ('manual.json', 'sections.coins.details[4]'): 'Las Coins están asociadas a la cuenta del usuario. Si un club se liquida, la cuenta y las Coins siguen activas; solo se cierra el club.',
    ('manual.json', 'sections.club-identity.subtitle'): 'Nombre del equipo, colores, logotipo, maillot y bloqueos relacionados con los derechos sobre el nombre del patrocinador.',
    ('manual.json', 'sections.overview.facts[2].value'): 'Condición física, moral, preparación, forma, ciclistas disponibles, ciclistas lesionados/enfermos/no aptos y contratos próximos a vencer',
    ('manual.json', 'sections.notifications-inbox.facts[2].value'): 'Mensajes directos y mensajes directos de administración',
    ('manual.json', 'sections.squad-riders.details[1]'): 'La Vista financiera muestra salarios, valor de mercado y contratos. Úsala antes de renovar, liberar o vender ciclistas.',
    ('manual.json', 'sections.squad-riders.facts[0].value'): '18 ciclistas',
    ('manual.json', 'sections.rider-profile-skills.details[4]'): 'La comparación de ciclistas muestra dos corredores lado a lado con atributos como sprint, escalada, contrarreloj, resistencia, llano, recuperación, aguante, inteligencia de carrera y trabajo en equipo.',
    ('manual.json', 'sections.developing-team.facts[0].value'): '8 ciclistas',
    ('manual.json', 'sections.race-supplies.details[3]'): 'El kit completo de carrera es obligatorio en Stage Plans. Si falta parte del kit, puede bloquearse la configuración de la etapa.',
    ('manual.json', 'sections.race-supplies.details[4]'): 'Las chaquetas de lluvia son opcionales, pero resultan útiles con tiempo húmedo o frío. Los suministros duraderos que ya no tengan usos disponibles no pueden utilizarse.',
    ('manual.json', 'sections.infrastructure.details[3]'): 'La academia juvenil apoya el desarrollo de futuros ciclistas y de los U23 y puede desbloquear sistemas de entrenadores principales U23.',
    ('manual.json', 'sections.statistics-team-profile.details[2]'): 'Los rankings de ciclistas muestran a los mejores por puntos y pueden incluir rol, país, edad, club, valor de mercado, salario, fatiga y disponibilidad.',
    ('manual.json', 'sections.emergency-liquidation.subtitle'): '¿Qué ocurre cuando un club no puede hacer frente a sus obligaciones de pago?',
    ('manual.json', 'sections.notification-examples.details[4]'): 'La notificación de liberación de un ciclista enlaza con su perfil o con el mercado de agentes libres.',
    ('manual.json', 'sections.inbox-deep.facts[0].value'): 'Mensajes directos y mensajes directos de administración',
    ('manual.json', 'sections.first-squad-deep.facts[0].value'): '18 ciclistas',
    ('manual.json', 'sections.rider-profile-deep.subtitle'): 'Vistas de ciclista propio, ciclista externo, comparación e historial.',
    ('manual.json', 'sections.contracts-renewals-release.details[4]'): 'Ten en cuenta la capacidad de la primera plantilla antes de fichar nuevos ciclistas.',
    ('manual.json', 'sections.equipment-caps-deep.subtitle'): '¿Por qué acumular bonificaciones no genera mejoras de rendimiento ilimitadas?',
    ('manual.json', 'sections.race-plan-deep.details[5]'): 'Los suministros de carrera deben ser suficientes para todo el evento, especialmente en las carreras por etapas.',
    ('manual.json', 'sections.stage-plan-deep.details[1]'): 'Las tácticas de equipo definen la intención general: controlar, proteger, perseguir, apoyar un sprint, buscar una escapada, defender GC u otro objetivo de carrera.',
    ('manual.json', 'sections.stage-roles-deep.details[0]'): 'Un líder de GC debe recibir protección en las jornadas de montaña y no asumir trabajo innecesario al principio de la etapa.',
    ('manual.json', 'sections.stage-roles-deep.facts[2].value'): 'Los gregarios protegen, persiguen, marcan el ritmo o prestan apoyo',
    ('manual.json', 'sections.stage-readiness-deep.overview'): 'La preparación resume si Stage Plans existe y puede utilizarse. Está diseñada para avisar al manager antes del plazo límite en lugar de dejar que un plan incompleto falle sin explicación.',
    ('manual.json', 'sections.sport-director-deep.details[4]'): 'Guarda siempre el plan final después de revisar el consejo.',
    ('manual.json', 'sections.free-agents-deep.details[4]'): 'Los agentes libres jóvenes pueden ser valiosos, pero siguen necesitando scouting o análisis cuando la información es incierta.',
    ('manual.json', 'sections.transactions-deep.tips[0]'): 'Usa Transacciones cada vez que te preguntes: «¿Adónde ha ido mi dinero?»',

    ('manualCore.json', 'sections.quickStart.details[3]'): 'Abre Calendario para entender la temporada. Solicita carreras que encajen con tu equipo, pero no sobrecargues a tus ciclistas. Un equipo pequeño puede perder rendimiento rápidamente si los mismos ciclistas compiten con demasiada frecuencia.',
    ('manualCore.json', 'sections.quickStart.details[5]'): 'Abre Finanzas antes de realizar transferencias, comprar equipamiento, invertir en infraestructura o reservar concentraciones de entrenamiento. Necesitas efectivo para salarios, personal, impuestos, equipamiento, apoyo en carrera, concentraciones, políticas y transferencias.',
    ('manualCore.json', 'sections.coins.subtitle'): 'La diferencia entre las Coins de la cuenta y el efectivo del club.',
    ('manualCore.json', 'sections.coins.overview'): 'Las Coins pertenecen a la cuenta. El efectivo del club corresponde a la economía del equipo. No confundas Coins con el dinero del juego utilizado para salarios, transferencias, equipamiento e infraestructura.',
    ('manualCore.json', 'sections.coins.details[4]'): 'Las Coins están asociadas a la cuenta del usuario. Si un club se liquida, la cuenta y las Coins siguen activas; solo se cierra el club.',
    ('manualCore.json', 'sections.clubIdentity.subtitle'): 'Nombre del equipo, colores, logotipo, maillot y bloqueos relacionados con los derechos sobre el nombre del patrocinador.',
    ('manualCore.json', 'sections.overview.facts[5]'): 'Condición física, moral, preparación, forma, ciclistas disponibles, ciclistas lesionados/enfermos/no aptos y contratos próximos a vencer',
    ('manualCore.json', 'sections.notificationsInbox.facts[5]'): 'Mensajes directos y mensajes directos de administración',
    ('manualCore.json', 'sections.squadRiders.facts[1]'): '18 ciclistas',
    ('manualCore.json', 'sections.squadRiders.details[1]'): 'La Vista financiera muestra salarios, valor de mercado y contratos. Úsala antes de renovar, liberar o vender ciclistas.',
    ('manualCore.json', 'sections.riderProfileSkills.details[4]'): 'La comparación de ciclistas muestra dos corredores lado a lado con atributos como sprint, escalada, contrarreloj, resistencia, llano, recuperación, aguante, inteligencia de carrera y trabajo en equipo.',
    ('manualCore.json', 'sections.developingTeam.facts[1]'): '8 ciclistas',
    ('manualCore.json', 'sections.raceSupplies.details[3]'): 'El kit completo de carrera es obligatorio en Stage Plans. Si falta parte del kit, puede bloquearse la configuración de la etapa.',
    ('manualCore.json', 'sections.raceSupplies.details[4]'): 'Las chaquetas de lluvia son opcionales, pero resultan útiles con tiempo húmedo o frío. Los suministros duraderos que ya no tengan usos disponibles no pueden utilizarse.',
    ('manualCore.json', 'sections.infrastructure.details[3]'): 'La academia juvenil apoya el desarrollo de futuros ciclistas y de los U23 y puede desbloquear sistemas de entrenadores principales U23.',
    ('manualCore.json', 'sections.statisticsTeamProfile.details[2]'): 'Los rankings de ciclistas muestran a los mejores por puntos y pueden incluir rol, país, edad, club, valor de mercado, salario, fatiga y disponibilidad.',
    ('manualCore.json', 'sections.emergencyLiquidation.subtitle'): '¿Qué ocurre cuando un club no puede hacer frente a sus obligaciones de pago?',

    ('manualDeepA.json', 'sections.profileSettings.details[4]'): 'La fecha de cumpleaños se muestra en Mi Perfil, pero no se vuelve a guardar desde allí.',
    ('manualDeepA.json', 'sections.inviteFriends.details[2]'): 'Pendiente significa que un amigo creó un club, pero todavía no ha comprado su primer paquete de Coins.',
    ('manualDeepA.json', 'sections.proPackagesDeep.details[4]'): 'Las Coins pertenecen a la cuenta, no son efectivo del club.',
    ('manualDeepA.json', 'sections.notificationExamples.details[4]'): 'La notificación de liberación de un ciclista enlaza con su perfil o con el mercado de agentes libres.',
    ('manualDeepA.json', 'sections.inboxDeep.facts[1]'): 'Mensajes directos y mensajes directos de administración',
    ('manualDeepA.json', 'sections.firstSquadDeep.facts[1]'): '18 ciclistas',
    ('manualDeepA.json', 'sections.developingTeamDeep.facts[1]'): '8 ciclistas',
    ('manualDeepA.json', 'sections.staffCapacityDeep.overview'): 'Las funciones del personal tienen límites. La infraestructura suele determinar cuántos miembros de cada función puede contratar el club.',
    ('manualDeepB1.json', 'sections.raceDetailDeep.details[2]'): 'Las etapas muestran ruta, terreno, distancia, clima, sprints y ascensiones.',
    ('manualDeepB1.json', 'sections.stagePlanDeep.details[0]'): 'Una etapa llana para sprinters necesita roles distintos a una etapa de montaña.',
    ('manualDeepB1.json', 'sections.stagePlanDeep.details[4]'): 'Los planes guardados, pero vacíos, no son lo mismo que los planes completos.',
    ('manualDeepB1.json', 'sections.stageRolesDeep.details[0]'): 'El líder del equipo o de GC debe ser un ciclista protegido para la clasificación general.',
    ('manualDeepB2.json', 'sections.taxDeep.details[1]'): 'Ya retenido indica el impuesto que ya se ha descontado.',
    ('manualDeepB2.json', 'sections.liquidationDeep.details[3]'): 'Un reinicio posterior liberaría a los antiguos ciclistas, eliminaría el personal y restablecería los puntos y el progreso.',
    ('manualFaq.json', 'sections.acceptedNotReady.title'): 'FAQ: ¿Por qué estoy aceptado, pero todavía no estoy listo?',
    ('manualFaq.json', 'sections.equipment.tips[0]'): 'Usa la configuración adecuada para cada etapa.',
    ('manualLegacyDynamic.json', 'category.gettingStarted'): '{{title}} forma parte de la rutina inicial de gestión. Si acabas de empezar, no intentes optimizarlo todo de inmediato. Primero identifica qué controla cada página, qué información es fiable, qué plazos existen y qué acciones pueden tener consecuencias permanentes o costosas.',
    ('manualLegacyDynamic.json', 'category.coinsAccount'): '{{title}} pertenece a la capa de cuenta, no a la economía normal del club. Separa las Coins y los ajustes de identidad/perfil de las finanzas del equipo. Si una función utiliza Coins, comprueba el saldo de tu cuenta y el precio actual del paquete o servicio antes de confirmar nada.',
    ('manualLegacyDynamic.json', 'mistake.finance'): 'Un error habitual es mirar solo el saldo actual. Un balance saludable puede ocultar futuros salarios, impuestos, políticas, viajes u obligaciones de deuda. Revisa conjuntamente los costes recurrentes y las transacciones antes de comprometer efectivo.',
    ('manualLegacyDynamic.json', 'expanded.quote'): 'Una cotización es la vista previa del juego sobre la consecuencia real antes de confirmar una acción. Revisa siempre el coste total o reembolso, la duración, la elegibilidad y las advertencias. El valor mostrado es más fiable que un ejemplo antiguo del manual porque el equilibrio o la configuración del motor pueden cambiar con el tiempo.',
    ('manualLegacyDynamic.json', 'expanded.consumables'): 'Los consumibles se multiplican por ciclista y por etapa. Calcula el stock necesario según el número real de ciclistas seleccionados y todas las etapas, y deja una pequeña reserva cuando sea posible. Una estimación para un solo día no basta para una carrera por etapas.',
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

    changed_files = 0
    applied = 0
    for filename, fixes in sorted(by_file.items()):
        path = ES / filename
        data = json.loads(path.read_text(encoding='utf-8'))
        before = json.dumps(data, ensure_ascii=False, sort_keys=True)
        for key, value in fixes:
            set_path(data, key, value)
            applied += 1
        after = json.dumps(data, ensure_ascii=False, sort_keys=True)
        if after != before:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed_files += 1

    print(f'Applied {applied} reviewed Spanish fixes across {changed_files} resources.')


if __name__ == '__main__':
    main()
