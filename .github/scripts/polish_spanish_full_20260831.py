from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EN = ROOT / 'src/i18n/locales/en'
ES = ROOT / 'src/i18n/locales/es'

# Exact player-facing rewrites for strings where generic MT was clearly unnatural.
EXACT: dict[tuple[str, str], str] = {
    ('accountPages.json','inbox.firstMessage'): 'Tu primer mensaje iniciará una conversación directa con',
    ('accountPages.json','inbox.loadConversationsFailed'): 'No se pudieron cargar las conversaciones.',
    ('accountPages.json','inbox.loadMessagesFailed'): 'No se pudieron cargar los mensajes.',
    ('accountPages.json','profile.emailHelp'): 'Si cambias tu correo electrónico, es posible que tengas que confirmar la nueva dirección.',
    ('accountPages.json','profile.passwordDescription'): 'Por seguridad, los cambios de contraseña se completan mediante verificación por correo electrónico. Enviaremos un enlace para restablecer la contraseña a tu correo electrónico actual.',
    ('accountPages.json','profile.savedEmail'): 'Perfil guardado. Si la confirmación por correo electrónico está activada, confirma tu nueva dirección.',
    ('accountPages.json','profile.languageAccountHelp'): 'Esta preferencia se guarda en tu cuenta y se utilizará también en tus otros dispositivos y futuros inicios de sesión.',
    ('accountPages.json','invite.loadingActivity'): 'Cargando actividad de invitaciones...',
    ('accountPages.json','invite.noActivity'): 'Aún no hay actividad de invitaciones. Comparte tu enlace para empezar a ganar recompensas de 40 Coins.',
    ('accountPages.json','invite.rejectedDescription'): 'Esta invitación no pudo completarse.',
    ('accountPages.json','invite.referredUser'): 'Usuario invitado',
    ('accountPages.json','invite.referredClub'): 'Club invitado',
    ('accountPages.json','invite.loadCodeFailed'): 'No se pudo cargar el código de invitación.',
    ('accountPages.json','invite.missingCode'): 'Falta el código de invitación.',
    ('accountPages.json','invite.loadActivityFailed'): 'No se puede cargar la actividad de invitaciones ahora mismo.',

    ('appShell.json','guards.clubLoadFailed'): 'No se puede cargar tu club en este momento. Inténtalo de nuevo en breve.',
    ('appShell.json','restartWelcome.title'): 'Bienvenido de nuevo a tu equipo reiniciado',
    ('appShell.json','restartWelcome.subtitle'): 'Tu club empieza de nuevo.',
    ('appShell.json','restartWelcome.body1'): 'Tu equipo vuelve a estar activo con una nueva plantilla inicial, equipamiento inicial, finanzas iniciales y 0 puntos de temporada.',
    ('appShell.json','restartWelcome.body2'): 'Se han conservado el nombre, el logotipo, el maillot, el país y la plaza de competición de tu club. Los antiguos ciclistas han sido liberados como agentes libres y el club está listo para empezar de nuevo.',
    ('appShell.json','restartWelcome.goodLuck'): 'Buena suerte esta vez. Construye con cuidado, controla el presupuesto y devuelve a tu club a lo más alto.',
    ('appShell.json','liquidation.accountNotice'): 'Tu cuenta de usuario y tus Coins siguen activos. Solo se cierra este club. Puedes crear un club nuevo en la siguiente plaza libre disponible o reiniciar este equipo en la misma plaza de competición con una plantilla nueva, sin personal y con 0 puntos.',
    ('appShell.json','liquidation.identityTitle'): 'Reiniciar el equipo conserva la identidad del club.',
    ('appShell.json','liquidation.identityBody'): 'El ID del club, la cuenta del propietario, el nombre del equipo, el logotipo, el maillot, el país y la plaza de nivel/división se mantienen. Los ciclistas actuales pasan al mercado de agentes libres, todos los puntos de temporada se restablecen a 0 y el club recibe una nueva plantilla inicial según su nivel de competición actual.',
    ('appShell.json','restartModal.unexpected'): 'No se pudo reiniciar el equipo debido a un error inesperado.',
    ('appShell.json','restartModal.subtitle'): 'Esto devolverá tu club a un estado inicial nuevo.',
    ('appShell.json','restartModal.intro'): 'Reiniciar el equipo conserva la identidad del club y su plaza de competición, pero restablece el estado deportivo y de juego del equipo.',
    ('appShell.json','restartModal.keepJersey'): 'Maillot',
    ('appShell.json','restartModal.after'): 'Después del reinicio, tu equipo recibe una nueva plantilla inicial según su nivel de competición actual, equipamiento e infraestructura iniciales y 0 puntos de temporada.',
    ('appShell.json','rollover.title'): 'Se está preparando la temporada {{season}}',
    ('appShell.json','rollover.body'): 'El cambio de temporada está en curso. Los datos de tu club y del juego están seguros mientras se finaliza la nueva temporada.',
    ('appShell.json','rollover.targetSeason'): 'Preparando la temporada {{season}}',
    ('appShell.json','rollover.noAction'): 'No tienes que hacer nada. El juego está bloqueado temporalmente mientras se procesan ascensos y descensos, contratos, patrocinadores, recompensas, clasificaciones, calendario y validaciones finales.',

    ('auth.json','info.passwordResetSuccess'): 'Contraseña actualizada correctamente. Inicia sesión con tu nueva contraseña.',
    ('auth.json','info.accountUnconfirmed'): 'La cuenta existe, pero aún no está confirmada. Revisa tu correo electrónico.',
    ('auth.json','register.birthdayHelp'): 'Tu cumpleaños se utiliza para las recompensas de cumpleaños. Te felicitaremos y añadiremos 10 Coins a tu cuenta. Solo puede introducirse una vez durante el registro y no puede cambiarse más adelante.',
    ('auth.json','register.confirmRequired'): 'Confirma tu contraseña.',
    ('auth.json','register.enterEmailFirst'): 'Introduce primero tu dirección de correo electrónico.',
    ('auth.json','register.accountCreatedConfirm'): 'Cuenta creada. Confirma tu correo electrónico antes de iniciar sesión. Si no recibes el correo de activación, utiliza «Reenviar correo de activación» a continuación.',
    ('auth.json','forgot.subtitle'): 'Introduce el correo electrónico de tu cuenta y te enviaremos instrucciones para restablecer la contraseña.',
    ('auth.json','forgot.emailRequired'): 'Introduce tu dirección de correo electrónico.',
    ('auth.json','forgot.networkError'): 'No pudimos conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',

    ('navigation.json','descriptions.overview'): 'Resumen y novedades del club',
    ('navigation.json','descriptions.squad'): 'Gestiona la plantilla y los ciclistas',
    ('navigation.json','descriptions.racePreparation'): 'Startlist, logística y Stage Plans',
    ('navigation.json','descriptions.teamRanking'): 'Clasificaciones y posiciones',
    ('navigation.json','descriptions.training'): 'Entrenamiento y sesiones de los ciclistas',
    ('navigation.json','descriptions.equipment'): 'Bicicletas, ruedas y equipamiento',
    ('navigation.json','footer.support'): 'Soporte',
    ('navigation.json','footer.dashboard'): 'Panel',
    ('navigation.json','header.free'): 'Gratis',
    ('navigation.json','header.manager'): 'Mánager',
    ('navigation.json','playerReport.reportPlayer'): 'Denunciar jugador',
    ('navigation.json','playerReport.title'): 'Denunciar jugador o equipo',
    ('navigation.json','playerReport.cheating'): 'Trampas / exploits',

    ('home.json','hero.liveManagerLeagues'): 'Ligas con mánagers reales',
    ('home.json','raceSchedule.yesterday'): 'Carreras de ayer',
    ('home.json','raceSchedule.today'): 'Carreras de hoy',
    ('home.json','raceSchedule.tomorrow'): 'Carreras de mañana',
    ('home.json','stats.activeManagers'): 'Mánagers activos',
    ('home.json','stats.totalRacesTours'): 'Total de carreras y vueltas',
    ('home.json','features.squadTitle'): 'Gestión profunda de la plantilla',
    ('home.json','features.squadDescription'): 'Entrena, rota y desarrolla ciclistas con forma, fatiga y progresión del talento realistas.',
    ('home.json','features.racesDescription'): 'Elige los momentos de ataque, gestiona las escapadas y ejecuta tácticas ganadoras de etapa.',
    ('home.json','guide.title'): 'Cómo funciona ProPeloton Manager',
    ('home.json','guide.subtitle'): 'Construye el club que hay detrás de los ciclistas y toma las decisiones que definen cada temporada.',
    ('home.json','guide.whatText'): 'ProPeloton Manager es un juego online de gestión ciclista en el que creas y desarrollas un club. En lugar de controlar directamente a un ciclista, gestionas todo lo que rodea a las carreras: ciclistas, entrenamiento, Race Plans, personal, equipamiento, finanzas, patrocinadores, fichajes y progresión a largo plazo en las clasificaciones.',
    ('home.json','guide.howText'): 'Los mánagers construyen una plantilla, estudian el calendario, solicitan las carreras adecuadas, preparan Race Plans, eligen ciclistas, asignan roles, gestionan suministros y siguen los resultados. Las buenas decisiones dependen de las habilidades, la fatiga, la moral, el perfil de carrera, el clima, el presupuesto y los objetivos de temporada.',
    ('home.json','guide.preparationText'): 'Un ciclista fuerte no basta por sí solo. La preparación conecta ciclistas, personal, vehículos, equipamiento, suministros y tácticas. Planificar con antelación ayuda a que el equipo llegue preparado para sprints, ascensos, contrarrelojes, carreras por etapas y condiciones meteorológicas difíciles.',
    ('home.json','reviews.previous'): 'Reseña anterior',
    ('home.json','reviews.next'): 'Reseña siguiente',
    ('home.json','reviews.addReview'): 'Añadir reseña',
    ('home.json','reviews.addFirst'): 'Añadir la primera reseña',
    ('home.json','reviews.review'): 'Reseña',
    ('home.json','reviews.submit'): 'Enviar reseña',
    ('home.json','reviews.submitting'): 'Enviando...',
    ('home.json','footer.support'): 'Soporte',

    ('createClub.json','page.chooseJerseyFirst'): 'Elige primero un maillot de equipo',
    ('createClub.json','page.backgroundAlt'): 'Fondo de ciclismo',
    ('createClub.json','jersey.title'): 'Maillot del equipo',
    ('createClub.json','jersey.description'): 'Elige un maillot para desbloquear la creación del equipo. Puedes cambiarlo más adelante en Personalizar equipo.',
    ('createClub.json','jersey.scrollLeft'): 'Desplazar maillots a la izquierda',
    ('createClub.json','jersey.scrollRight'): 'Desplazar maillots a la derecha',
    ('createClub.json','jersey.select'): 'Seleccionar el maillot genérico {{index}}',
    ('createClub.json','jersey.alt'): 'Maillot genérico {{index}}',
    ('createClub.json','jersey.required'): 'Debes seleccionar un maillot antes de crear el equipo.',
    ('createClub.json','preview.description'): 'El diseño y los colores se actualizan en tiempo real.',
    ('createClub.json','patterns.customDescription'): 'El estilo interior solo se aplica al escudo de equipo generado.',
    ('createClub.json','patterns.diagonalSash'): 'Banda diagonal',
    ('createClub.json','patterns.diagonalSplit'): 'División diagonal',
    ('createClub.json','patterns.centerStripe'): 'Franja central',
    ('createClub.json','patterns.quartered'): 'Cuartos',
    ('createClub.json','errors.bucketMissing'): 'No se encontró el bucket de almacenamiento «club-logos». Créalo primero en Supabase Storage.',

    ('finance.json','transactions.showRecent'): 'Mostrando {{start}}-{{end}} de {{total}} transacciones recientes.',
    ('finance.json','transactions.showMonth'): 'Mostrando {{start}}-{{end}} de {{total}} elementos de {{month}}.',
    ('finance.json','sponsors.namingRights'): 'Derechos de denominación',
    ('finance.json','sponsors.namingIdentity'): 'Identidad del equipo con derechos de denominación',
    ('finance.json','sponsors.previewRaceStartDescription'): 'Participa en {{race}} con tu equipo. El objetivo se completa cuando tu equipo aparece en la Startlist de la carrera.',
    ('finance.json','sponsors.previewStageTop5Title'): '{{race}}: top 5 de etapa',
    ('finance.json','sponsors.previewStageTop5Description'): 'Coloca al menos a un ciclista entre los 5 primeros de una etapa de {{race}}.',
    ('finance.json','sponsors.previewRaceTop5Description'): 'Finaliza {{race}} con al menos un ciclista entre los 5 primeros.',
    ('finance.json','sponsors.previewRaceTop10Description'): 'Finaliza {{race}} con al menos un ciclista entre los 10 primeros.',
    ('finance.json','policies.weeklyDescription'): 'Coste semanal recurrente basado en los ciclistas activos, el personal activo y los niveles actuales de Team Policy.',
    ('finance.json','policies.flightsDescription'): 'Política de viaje por persona utilizada cuando los ciclistas y el personal vuelan a carreras, vueltas y campos de entrenamiento.',
    ('finance.json','policies.teamPoliciesDescription'): 'Paquetes de soporte a largo plazo y estándares internos del club para ciclistas y personal.',
    ('finance.json','policies.riderBonusDescription'): 'Fondo de bonificaciones de temporada para los ciclistas.',

    ('club.json','report.titleTooltip'): 'Denunciar jugador',
    ('club.json','report.reportPlayer'): 'Denunciar jugador',
    ('club.json','report.modalTitle'): 'Denunciar jugador o equipo',
    ('club.json','report.describeIssue'): 'Describe el problema.',
    ('club.json','teamProfile.rosterDescription'): 'Ciclistas actualmente inscritos en este equipo.',

    ('transfers.json','negotiation.validSalary'): 'Introduce un salario semanal válido.',
    ('racePreparation.json','errors.save'): 'No se pudo guardar Race Plan.',
    ('racePreparation.json','page.subtitle'): 'Las carreras aceptadas aparecen primero. Race Plan gestiona la Startlist completa de la carrera, viajes, personal, activos y costes. Stage Plans gestiona las tácticas etapa por etapa después de enviar Race Plan.',
    ('racePreparation.json','accepted.missedStartlist'): 'Tu equipo perdió el plazo de la Startlist y no participa.',
    ('preferences.json','groups.races.description'): 'Mostrar actualizaciones de Startlist, plazos de Startlist perdidos, día de carrera y penalizaciones.',
    ('notifications.json','categories.stagePlanReminders'): 'Recordatorios de Stage Plans',
    ('notifications.json','sportDirector.incompleteStagePlans'): 'Stage Plans incompletos',
    ('notifications.json','sportDirector.missingPlans'): 'Stage Plans incompletos o ausentes',

    ('publicInfo.json','terms.s5p1'): 'Coins es una moneda del juego asociada a la cuenta y utilizada únicamente dentro de ProPeloton Manager. Coins no es dinero real, no tiene valor en efectivo, no puede retirarse y no puede venderse, transferirse ni canjearse fuera del juego salvo que introduzcamos explícitamente una función que lo permita.',
    ('publicInfo.json','terms.s5p4'): 'Los Coins no utilizados permanecen asociados a la cuenta y no caducan durante el uso normal de la cuenta ni tras cancelar Premium. Los Coins vinculados a un pago reembolsado, revertido, disputado, fraudulento o no autorizado pueden eliminarse o corregirse.',

    ('customizeTeam.json','logo.notEnoughRestore'): 'No tienes suficientes Coins para cambiar el logotipo del equipo. Restaurar el escudo generado también cuenta como un cambio de logotipo y cuesta {{cost}} Coins. Tu saldo actual es {{balance}}; necesitas {{missing}} Coins más.',
    ('preferencesDynamic.json','service.summary'): 'Disponible para jugadores Free y Premium. La primera activación cuesta {{activation}} Coins. Cada renovación o reactivación en temporadas posteriores cuesta {{renewal}} Coins. La membresía Premium no elimina estos costes del servicio.',

    ('manual.json','sections.race-preparation.details[4]'): 'Después de enviar Race Plan, se habilitan Stage Plans. Stage Plans define los roles de los ciclistas, las tácticas de equipo, las tácticas individuales, el equipamiento y los suministros de cada etapa.',
    ('manualCore.json','sections.racePreparation.details[4]'): 'Después de enviar Race Plan, se habilitan Stage Plans. Stage Plans define los roles de los ciclistas, las tácticas de equipo, las tácticas individuales, el equipamiento y los suministros de cada etapa.',
    ('manual.json','sections.facilities-overview-deep.details[3]'): 'Youth Academy da soporte a los sistemas U23/de desarrollo y a futuras funciones relacionadas con jóvenes.',
    ('manual.json','sections.club-history-deep.details[4]'): 'Los honores finales de GC, puntos, montaña y clasificación juvenil se añadirán cuando se confirme su fuente persistida autorizada.',
    ('manualDeepB2.json','sections.staffMarketDeep.facts[1]'): 'Entrenador principal, preparador, entrenador U23, médico, fisioterapeuta, nutricionista, mecánico, director deportivo y scout/analista',
}

IDENTICAL = {
    'Hilly': 'Ondulado',
    'Cobbled': 'Adoquinado',
    'Cobble': 'Adoquines',
    'Cobbles': 'Adoquines',
    'Foggy': 'Con niebla',
    'Leader': 'Líder',
    'Jerseys': 'Maillots',
    'Jersey': 'Maillot',
    'News Board': 'Panel de noticias',
    'Fitness': 'Condición física',
    'Team Cars': 'Coches de equipo',
    'Club House': 'Casa club',
    'U23 Head Coach': 'Entrenador principal U23',
    'Rider:': 'Ciclista:',
    'rider': 'ciclista',
    'Showing {{start}}-{{end}} of {{total}} riders • 30 per page': 'Mostrando {{start}}-{{end}} de {{total}} ciclistas • 30 por página',
    'Showing {{start}}-{{end}} of {{total}} activity items': 'Mostrando {{start}}-{{end}} de {{total}} elementos de actividad',
    'Showing {{start}}-{{end}} of {{total}}': 'Mostrando {{start}}-{{end}} de {{total}}',
    'Showing {{start}}-{{end}} of {{total}} negotiation items': 'Mostrando {{start}}-{{end}} de {{total}} negociaciones',
    'Showing {{start}}-{{end}} of {{total}} candidates': 'Mostrando {{start}}-{{end}} de {{total}} candidatos',
    'Compressed replay starts · {{seconds}}s apart': 'Inicio de replay comprimido · intervalos de {{seconds}} s',
    'No #': 'Sin n.º',
    '{{age}} yrs': '{{age}} años',
    'Pos.': 'Pos.',
    'Avg P{{value}}': 'Media P{{value}}',
    'Diff': 'Dif.',
    'Available to Free and Premium players. First activation costs {{activation}} coins. Each later season renewal or reactivation costs {{renewal}} coins. Premium membership does not waive these service costs.': 'Disponible para jugadores Free y Premium. La primera activación cuesta {{activation}} Coins. Cada renovación o reactivación en temporadas posteriores cuesta {{renewal}} Coins. Premium no elimina estos costes del servicio.',
}

COMMON_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'\brazas\b', re.I), 'carreras'),
    (re.compile(r'\braza\b', re.I), 'carrera'),
    (re.compile(r'\bjinetes\b', re.I), 'ciclistas'),
    (re.compile(r'\bjinete\b', re.I), 'ciclista'),
    (re.compile(r'\breproductores\b', re.I), 'jugadores'),
    (re.compile(r'\breproductor\b', re.I), 'jugador'),
    (re.compile(r'\bgerentes\b', re.I), 'mánagers'),
    (re.compile(r'\bgerente\b', re.I), 'mánager'),
    (re.compile(r'\badministradores activos\b', re.I), 'mánagers activos'),
    (re.compile(r'\bSalvando\b'), 'Guardando'),
    (re.compile(r'\bsalvando\b'), 'guardando'),
    (re.compile(r'\bSalvar\b'), 'Guardar'),
    (re.compile(r'\bsalvar\b'), 'guardar'),
    (re.compile(r'\bTablero de mando\b', re.I), 'Panel'),
    (re.compile(r'\bDerechos de designación\b', re.I), 'Derechos de denominación'),
    (re.compile(r'\bderechos de designación\b', re.I), 'derechos de denominación'),
    (re.compile(r'\bEquipo Jersey\b'), 'Maillot del equipo'),
    (re.compile(r'\bjerseys\b', re.I), 'maillots'),
    (re.compile(r'\bjersey\b', re.I), 'maillot'),
    (re.compile(r'\bTrimestral\b'), 'Cuartos'),
    (re.compile(r'\bDiagonal Sash\b'), 'Banda diagonal'),
    (re.compile(r'\bDiagonal Split\b'), 'División diagonal'),
    (re.compile(r'\bCentro Stripe\b'), 'Franja central'),
    (re.compile(r'\bSírvase describir la cuestión\.?', re.I), 'Describe el problema.'),
    (re.compile(r'\bSírvase proporcionar un sueldo semanal válido\.?', re.I), 'Introduce un salario semanal válido.'),
    (re.compile(r'\bFalló al ([a-záéíóúñ]+)', re.I), r'No se pudo \1'),
    (re.compile(r'\bFallo al ([a-záéíóúñ]+)', re.I), r'No se pudo \1'),
    (re.compile(r'\blos ciclista\b', re.I), 'los ciclistas'),
    (re.compile(r'\blas ciclista\b', re.I), 'las ciclistas'),
    (re.compile(r'\btus ciclista\b', re.I), 'tus ciclistas'),
    (re.compile(r'\bsus ciclista\b', re.I), 'sus ciclistas'),
    (re.compile(r'\bestos ciclista\b', re.I), 'estos ciclistas'),
    (re.compile(r'\botros ciclista\b', re.I), 'otros ciclistas'),
    (re.compile(r'\bciclista activos\b', re.I), 'ciclistas activos'),
    (re.compile(r'\bciclista actuales\b', re.I), 'ciclistas actuales'),
    (re.compile(r'\bciclista jóvenes\b', re.I), 'ciclistas jóvenes'),
    (re.compile(r'\bciclista adecuados\b', re.I), 'ciclistas adecuados'),
    (re.compile(r'\bciclista dominantes\b', re.I), 'ciclistas dominantes'),
    (re.compile(r'\bsubrayados, sólo letras/números/substrato\b', re.I), 'guiones bajos; solo se permiten letras, números y guiones bajos'),
    (re.compile(r'\bsólo letras/números/substrato\b', re.I), 'solo letras, números y guiones bajos'),
    (re.compile(r'\bInformer jugador o equipo\b', re.I), 'Denunciar jugador o equipo'),
    (re.compile(r'\bInforme del jugador\b', re.I), 'Denunciar jugador'),
    (re.compile(r'\bExamen anterior\b', re.I), 'Reseña anterior'),
    (re.compile(r'\bPróximo examen\b', re.I), 'Reseña siguiente'),
    (re.compile(r'\bprimer examen\b', re.I), 'primera reseña'),
    (re.compile(r'\bremisión\b', re.I), 'invitación'),
    (re.compile(r'\bmontaÃ±o\b'), 'montaña'),
    (re.compile(r'\bmontaÃ±a\b'), 'montaña'),
    (re.compile(r'\bprÃ3logo\b'), 'prólogo'),
]

IMPERATIVE_REPLACEMENTS = [
    ('Por favor, vuelva a intentarlo', 'Inténtalo de nuevo'),
    ('Por favor vuelva a intentarlo', 'Inténtalo de nuevo'),
    ('Por favor, introduzca', 'Introduce'),
    ('Por favor introduzca', 'Introduce'),
    ('Introduzca', 'Introduce'),
    ('Compruebe', 'Comprueba'),
    ('Confirme', 'Confirma'),
    ('Elija', 'Elige'),
    ('Seleccione', 'Selecciona'),
    ('Utilice', 'Usa'),
    ('Cargue', 'Carga'),
    ('Construya', 'Construye'),
    ('Mantenga', 'Mantén'),
    ('Haga clic', 'Haz clic'),
    ('Revise', 'Revisa'),
    ('Abra', 'Abre'),
]


def source_aware(src: str, dst: str) -> str:
    low = src.lower()

    # Keep product/game vocabulary exactly as agreed.
    protected_patterns = {
        'Race Plans': [r'planes de carreras?', r'planes de carrera'],
        'Race Plan': [r'plan de carrera', r'plan de la carrera'],
        'Stage Plans': [r'planes de etapas?', r'planes de etapa'],
        'Stage Plan': [r'plan de etapa'],
        'Startlist': [r'lista inicial', r'lista de inicio(?: de carrera)?', r'lista de salida'],
        'Race Engine': [r'motor de carreras?', r'motor de la carrera'],
        'Replay Engine': [r'motor de repetición', r'motor de replay'],
        'Team Policy': [r'política de equipo', r'políticas de equipo'],
        'Race Sharpness': [r'nitidez de carrera', r'agudeza de carrera', r'afilado de carrera'],
    }
    for term, patterns in protected_patterns.items():
        if term in src and term not in dst:
            for pat in patterns:
                dst2, n = re.subn(pat, term, dst, count=1, flags=re.I)
                if n:
                    dst = dst2
                    break

    if 'Coins' in src and 'Coins' not in dst:
        dst = re.sub(r'\bmonedas?\b', 'Coins', dst, flags=re.I)
    if 'Premium' in src and 'Premium' not in dst:
        dst = re.sub(r'\bprima\b', 'Premium', dst, flags=re.I)

    # Source-aware semantic MT corrections.
    if re.search(r'\bstages?\b', low):
        dst = re.sub(r'\bescenarios\b', 'etapas', dst, flags=re.I)
        dst = re.sub(r'\bescenario\b', 'etapa', dst, flags=re.I)
    if re.search(r'\btours?\b', low):
        dst = re.sub(r'\bpaseos\b', 'vueltas', dst, flags=re.I)
        dst = re.sub(r'\bpaseo\b', 'vuelta', dst, flags=re.I)
    if re.search(r'\bplayers?\b', low):
        dst = re.sub(r'\breproductores\b', 'jugadores', dst, flags=re.I)
        dst = re.sub(r'\breproductor\b', 'jugador', dst, flags=re.I)
    if re.search(r'\bscouts?\b', low):
        dst = re.sub(r'\bexploradores\b', 'scouts', dst, flags=re.I)
        dst = re.sub(r'\bexplorador\b', 'scout', dst, flags=re.I)

    # Use informal, consistent player-facing Spanish when English addresses the user.
    pairs = [
        ('your team', 'su equipo', 'tu equipo'),
        ('your club', 'su club', 'tu club'),
        ('your account', 'su cuenta', 'tu cuenta'),
        ('your profile', 'su perfil', 'tu perfil'),
        ('your email', 'su correo electrónico', 'tu correo electrónico'),
        ('your other devices', 'sus otros dispositivos', 'tus otros dispositivos'),
        ('your riders', 'sus ciclistas', 'tus ciclistas'),
        ('your rider', 'su ciclista', 'tu ciclista'),
        ('your country', 'su país', 'tu país'),
    ]
    for eng, formal, informal in pairs:
        if eng in low:
            dst = re.sub(re.escape(formal), informal, dst, flags=re.I)

    if 'you will be able' in low:
        dst = re.sub(r'usted será capaz de', 'podrás', dst, flags=re.I)
    if low.startswith('you can'):
        dst = re.sub(r'^usted puede', 'Puedes', dst, flags=re.I)
    if low.startswith('you must'):
        dst = re.sub(r'^usted debe', 'Debes', dst, flags=re.I)
    if 'we will send you' in low:
        dst = re.sub(r'\ble enviaremos\b', 'te enviaremos', dst, flags=re.I)

    # Free account/package wording, but never free-agent wording.
    if 'free agent' not in low and re.search(r'\bfree\b', low):
        dst = re.sub(r'\bcuenta libre\b', 'cuenta gratuita', dst, flags=re.I)
        dst = re.sub(r'\blibre\b', 'gratis', dst, flags=re.I)

    return dst


def polish(src: str, dst: str, filename: str, path: str) -> str:
    exact = EXACT.get((filename, path))
    if exact is not None:
        return exact

    if src == dst and src in IDENTICAL:
        dst = IDENTICAL[src]

    for pattern, repl in COMMON_REPLACEMENTS:
        dst = pattern.sub(repl, dst)

    for old, new in IMPERATIVE_REPLACEMENTS:
        if dst.startswith(old):
            dst = new + dst[len(old):]

    dst = source_aware(src, dst)

    # Common cycling wording cleanups.
    dst = re.sub(r'\bprueba de tiempo\b', 'contrarreloj', dst, flags=re.I)
    dst = re.sub(r'\bprueba individual\b', 'contrarreloj individual', dst, flags=re.I)
    dst = re.sub(r'\bprueba de tiempo en equipo\b', 'contrarreloj por equipos', dst, flags=re.I)
    dst = re.sub(r'\badoquin\b', 'adoquín', dst, flags=re.I)
    dst = re.sub(r'\bPiso\b', 'Llano', dst)

    # Cleanup doubled spaces/punctuation introduced by old MT.
    dst = re.sub(r'\s+([,.;:!?])', r'\1', dst)
    dst = re.sub(r' {2,}', ' ', dst)
    return dst


def transform(src: Any, dst: Any, filename: str, path: str='') -> Any:
    if isinstance(src, dict) and isinstance(dst, dict):
        return {k: transform(src[k], dst[k], filename, f'{path}.{k}' if path else k) for k in src}
    if isinstance(src, list) and isinstance(dst, list):
        return [transform(a,b,filename,f'{path}[{i}]') for i,(a,b) in enumerate(zip(src,dst))]
    if isinstance(src, str) and isinstance(dst, str):
        return polish(src,dst,filename,path)
    return dst


def main() -> None:
    changed=0
    for ep in sorted(EN.glob('*.json')):
        sp=ES/ep.name
        if not sp.exists():
            raise SystemExit(f'Missing Spanish file: {sp}')
        src=json.loads(ep.read_text(encoding='utf-8'))
        old=json.loads(sp.read_text(encoding='utf-8'))
        new=transform(src,old,ep.name)
        if new != old:
            sp.write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            changed += 1
    print(f'Polished Spanish resources: {changed}')

if __name__ == '__main__':
    main()
