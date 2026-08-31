from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ES = ROOT / 'src/i18n/locales/es'

PATCHES: dict[str, dict[str, str]] = {
    'common.json': {
        'forum.community': 'Comunidad de Discord',
        'forum.joinText': 'Chatea con otros jugadores, haz preguntas, consulta el manual y mantente al día con las últimas novedades de la comunidad.',
    },
    'accountPages.json': {
        'inbox.firstMessage': 'Tu primer mensaje iniciará una conversación directa con',
        'inbox.loadConversationsFailed': 'No se pudieron cargar las conversaciones.',
        'inbox.loadMessagesFailed': 'No se pudieron cargar los mensajes.',
        'profile.displayName': 'Nombre visible',
        'profile.displayNamePlaceholder': 'Nombre visible',
        'profile.displayNameHelp': '3–24 caracteres. Solo letras, números y guiones bajos. Los espacios se convierten en guiones bajos.',
        'profile.emailHelp': 'Si cambias tu correo electrónico, es posible que tengas que confirmar la nueva dirección.',
        'profile.passwordDescription': 'Por seguridad, los cambios de contraseña se realizan mediante verificación por correo electrónico. Enviaremos un enlace para restablecer la contraseña al correo electrónico actual de tu cuenta.',
        'profile.passwordHelp': 'Después de abrir el enlace del correo, podrás elegir una nueva contraseña en la página de restablecimiento.',
        'profile.displayNameLength': 'El nombre visible debe tener entre 3 y 24 caracteres.',
        'profile.savedEmail': 'Perfil guardado. Si la confirmación por correo está activada, confirma tu nueva dirección de correo electrónico.',
        'profile.languageSaving': 'Guardando idioma...',
        'profile.languageAccountHelp': 'Esta preferencia se guarda en tu cuenta y se utilizará también en tus otros dispositivos y futuros inicios de sesión.',
        'profile.languageSaved': 'El idioma del juego se cambió a {{language}}.',
        'profile.languageSaveFailed': 'No se pudo guardar el idioma del juego. Inténtalo de nuevo.',
        'profile.sendPasswordEmail': 'Enviar correo para cambiar la contraseña',
        'invite.subtitle': 'Invita a amigos y gana 40 Coins cuando creen un club y compren su primer paquete de Coins.',
        'invite.linkDescription': 'Comparte este enlace con un amigo. Cuando cree un club y realice su primera compra de Coins, recibirás 40 Coins.',
        'invite.referralAria': 'Enlace de invitación',
        'invite.copySuccess': 'Enlace de invitación copiado.',
        'invite.activityTitle': 'Actividad de invitaciones',
        'invite.activityDescription': 'Pendiente = tu amigo creó un club pero todavía no ha comprado Coins. Completado = tu amigo compró su primer paquete de Coins y recibiste la recompensa de 40 Coins.',
        'invite.loadingActivity': 'Cargando actividad de invitaciones...',
        'invite.noActivity': 'Todavía no hay actividad de invitaciones. Comparte tu enlace para empezar a ganar recompensas de 40 Coins.',
        'invite.pendingDescription': 'Tu amigo creó un club. Esperando su primera compra de Coins.',
        'invite.completedDescription': 'Tu amigo compró su primer paquete de Coins. Recompensa concedida: 40 Coins.',
        'invite.rejectedDescription': 'Esta invitación no pudo completarse.',
        'invite.referredUser': 'Usuario invitado',
        'invite.referredClub': 'Club del invitado',
        'invite.loadCodeFailed': 'No se pudo cargar el código de invitación.',
        'invite.missingCode': 'Falta el código de invitación.',
        'invite.loadActivityFailed': 'No se puede cargar la actividad de invitaciones en este momento.',
    },
    'navigation.json': {
        'descriptions.overview': 'Resumen y novedades del club',
        'descriptions.squad': 'Gestiona los ciclistas y la plantilla',
        'descriptions.racePreparation': 'Startlist, logística y Stage Plans',
        'descriptions.teamRanking': 'Clasificación y posición de los equipos',
        'descriptions.training': 'Entrenamiento y sesiones de los ciclistas',
        'descriptions.equipment': 'Bicicletas, ruedas y equipamiento',
        'header.namingRights': 'Derechos de denominación',
        'header.freeAccountMember': 'Miembro con cuenta gratuita. Ver Premium',
        'header.freeAccount': 'Cuenta gratuita — ver Premium',
        'header.free': 'Gratis',
        'footer.navigation': 'Navegación del pie de página',
        'footer.support': 'Soporte',
        'footer.dashboard': 'Panel',
        'bugReport.sent': 'Informe de error enviado.',
        'bugReport.descriptionPlaceholder': 'Describe el problema con claridad...',
        'bugReport.describeRequired': 'Describe el problema.',
        'bugReport.sendFailed': 'No se pudo enviar el informe de error.',
        'playerReport.reportPlayer': 'Reportar jugador',
        'playerReport.sent': 'Informe enviado.',
        'playerReport.title': 'Reportar jugador o equipo',
        'playerReport.cheating': 'Trampas / Explotación de errores',
        'playerReport.detailsPlaceholder': 'Describe el incidente, cuándo ocurrió y cualquier contexto relevante...',
        'playerReport.describeRequired': 'Describe el problema.',
    },
    'home.json': {
        'hero.seasonalMultiplayer': 'Multijugador por temporadas',
        'hero.titleLine2': 'Dirige el equipo.',
        'hero.description': 'ProPeloton Manager es un juego de gestión de ciclismo online en el que creas tu club, desarrollas ciclistas, planificas calendarios de carreras, negocias fichajes y compites contra otros mánagers en un mundo ciclista por temporadas.',
        'hero.liveManagerLeagues': 'Ligas de mánagers en vivo',
        'hero.progressionValue': 'Competiciones, clasificaciones y recompensas',
        'raceSchedule.yesterday': 'Carreras de ayer',
        'raceSchedule.today': 'Carreras de hoy',
        'raceSchedule.tomorrow': 'Carreras de mañana',
        'stats.subtitle': 'Resumen en vivo del mundo de ProPeloton.',
        'stats.activeManagers': 'Mánagers activos',
        'stats.totalRacesTours': 'Total de carreras y vueltas',
        'features.squadTitle': 'Gestión profunda de la plantilla',
        'features.squadDescription': 'Entrena, rota y desarrolla ciclistas teniendo en cuenta la forma, la fatiga y la progresión del talento.',
        'features.racesDescription': 'Elige los momentos de ataque, gestiona las escapadas y ejecuta tácticas ganadoras en cada etapa.',
        'features.marketDescription': 'Ojea, puja y negocia contratos en un mercado de fichajes dinámico.',
        'guide.intro': 'ProPeloton Manager está diseñado alrededor de la gestión ciclista a largo plazo. Las páginas públicas explican el juego y ofrecen una visión directa de sus sistemas principales: creación del equipo, desarrollo de ciclistas, preparación de carreras, tácticas, finanzas, soporte y clasificación de temporada.',
        'guide.title': 'Cómo funciona ProPeloton Manager',
        'guide.subtitle': 'Construye el club que hay detrás de los ciclistas y toma las decisiones que definen cada temporada.',
        'guide.whatText': 'ProPeloton Manager es un juego de gestión de ciclismo online en el que creas y desarrollas un club. En lugar de controlar directamente a un ciclista, gestionas todo lo que hay detrás de las carreras: ciclistas, entrenamiento, Race Plans, personal, equipamiento, finanzas, patrocinadores, fichajes y progreso a largo plazo en la clasificación.',
        'guide.howText': 'Los mánagers construyen una plantilla, estudian el calendario, solicitan las carreras adecuadas, preparan Race Plans, eligen ciclistas, asignan roles, gestionan suministros y siguen los resultados. Las buenas decisiones dependen de las habilidades del ciclista, la fatiga, la moral, el perfil de la carrera, el clima, el presupuesto y los objetivos de temporada.',
        'guide.preparationText': 'Un ciclista fuerte no basta por sí solo. La preparación de carrera conecta ciclistas, personal, vehículos, equipamiento, suministros y tácticas. Planificar con antelación ayuda al equipo a llegar preparado para sprints, subidas, contrarrelojes, carreras por etapas y condiciones meteorológicas difíciles.',
        'reviews.previous': 'Reseña anterior',
        'reviews.next': 'Reseña siguiente',
        'reviews.addFirst': 'Añadir la primera reseña',
        'reviews.addReview': 'Añadir reseña',
        'reviews.review': 'Reseña',
        'reviews.submit': 'Enviar reseña',
        'reviews.submitting': 'Enviando...',
        'reviews.submitFailed': 'No se pudo enviar la reseña.',
        'reviews.submitSuccess': 'Gracias. Tu reseña se ha enviado y aparecerá cuando sea aprobada.',
        'cta.body': 'Crea tu club, ficha ciclistas y compite en ligas por temporadas.',
        'footer.description': 'Un juego de gestión ciclista online de Next Quest Studio. Construye un equipo, gestiona ciclistas, prepara carreras, sigue las clasificaciones y desarrolla tu club a lo largo de una temporada ciclista viva.',
        'footer.support': 'Soporte',
    },
    'createClub.json': {
        'page.mottoPlaceholder': 'Por ejemplo, todos a una',
        'page.backgroundAlt': 'Fondo de ciclismo',
        'jersey.title': 'Maillot del equipo',
        'jersey.description': 'Elige un maillot para desbloquear la creación del equipo. Podrás cambiarlo más adelante en Personalizar equipo.',
        'jersey.scrollLeft': 'Desplazar maillots a la izquierda',
        'jersey.scrollRight': 'Desplazar maillots a la derecha',
        'jersey.select': 'Seleccionar maillot genérico {{index}}',
        'jersey.alt': 'Maillot genérico {{index}}',
        'jersey.required': 'Debes seleccionar un maillot antes de crear el equipo.',
        'preview.description': 'El diseño interior y los colores se actualizan en tiempo real.',
        'patterns.customDescription': 'El estilo interior solo se aplica al escudo de equipo generado.',
        'patterns.diagonalSash': 'Franja diagonal',
        'patterns.diagonalSplit': 'División diagonal',
        'patterns.centerStripe': 'Franja central',
        'patterns.quartered': 'Cuartos',
        'logo.description': 'Opcional. Sube un logotipo o utiliza una URL de imagen. Si no seleccionas ninguno, se utilizará el escudo generado arriba.',
        'logo.orUrl': 'o utiliza una URL',
        'errors.invalidType': 'El logotipo debe ser una imagen PNG, JPEG/JPG o BMP.',
        'errors.tooLarge': 'El archivo del logotipo debe ocupar como máximo 2 MB.',
        'errors.pasteUrl': 'Pega primero una URL del logotipo.',
        'errors.httpUrl': 'La URL del logotipo debe comenzar por http:// o https://.',
        'errors.countries': 'No se pudieron cargar los países.',
        'errors.nameRequired': 'El nombre del equipo es obligatorio.',
        'errors.countryRequired': 'El país del equipo es obligatorio.',
        'errors.jerseyRequired': 'Elige un maillot antes de crear el equipo.',
        'errors.uploadLogo': 'No se pudo subir el logotipo del equipo.',
        'errors.saveBadge': 'No se pudo guardar el escudo del equipo.',
        'errors.create': 'No se pudo crear el equipo.',
    },
}


def set_path(data: Any, path: str, value: str) -> None:
    cur = data
    parts = path.split('.')
    for part in parts[:-1]:
        if part not in cur:
            raise KeyError(path)
        cur = cur[part]
    if parts[-1] not in cur:
        raise KeyError(path)
    cur[parts[-1]] = value


def main() -> None:
    for filename, changes in PATCHES.items():
        path = ES / filename
        data = json.loads(path.read_text(encoding='utf-8'))
        for key, value in changes.items():
            set_path(data, key, value)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'polished {filename}: {len(changes)} entries')


if __name__ == '__main__':
    main()
