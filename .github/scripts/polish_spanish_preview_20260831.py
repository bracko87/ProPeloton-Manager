from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ES = ROOT / 'src/i18n/locales/es'

OVERRIDES = {
    'navigation.json': {
        'descriptions.overview': 'Resumen del club y novedades',
        'descriptions.squad': 'Gestiona los ciclistas y la plantilla',
        'descriptions.racePreparation': 'Startlist, logística y Stage Plans',
        'descriptions.teamRanking': 'Clasificación y posiciones',
        'descriptions.training': 'Entrenamiento y sesiones de los ciclistas',
        'descriptions.equipment': 'Bicicletas, ruedas y equipamiento',
        'header.toggleSidebar': 'Mostrar u ocultar la barra lateral',
        'header.namingRights': 'Derechos de nombre',
        'header.freeAccountMember': 'Cuenta gratuita. Ver Premium',
        'header.free': 'Gratis',
        'footer.support': 'Soporte',
        'footer.dashboard': 'Panel',
        'bugReport.describeRequired': 'Describe el problema.',
        'playerReport.reportPlayer': 'Denunciar jugador',
        'playerReport.sent': 'Informe enviado.',
        'playerReport.title': 'Denunciar jugador o equipo',
        'playerReport.cheating': 'Trampas / exploits',
        'playerReport.describeRequired': 'Describe el incidente.',
    },
    'accountPages.json': {
        'inbox.subtitle': 'Conversaciones privadas y mensajes de la administración.',
        'inbox.readConversations': 'Conversaciones leídas',
        'inbox.search': 'Buscar conversaciones...',
        'inbox.signInRequired': 'Debes iniciar sesión para ver tu bandeja de entrada.',
        'profile.displayName': 'Nombre visible',
        'profile.displayNamePlaceholder': 'Nombre visible',
        'profile.displayNameHelp': '3–24 caracteres. Solo letras, números y guiones bajos. Los espacios se convierten en guiones bajos.',
        'profile.saving': 'Guardando...',
        'profile.sendPasswordEmail': 'Enviar correo para cambiar la contraseña',
        'profile.passwordHelp': 'Después de abrir el enlace del correo, podrás elegir una nueva contraseña en la página de restablecimiento.',
        'profile.displayNameLength': 'El nombre visible debe tener entre 3 y 24 caracteres.',
        'profile.resetSent': 'Se ha enviado un correo para restablecer la contraseña a {{email}}. Revisa tu bandeja de entrada y la carpeta de spam y sigue el enlace para elegir una nueva contraseña.',
        'profile.languageSaving': 'Guardando idioma...',
        'profile.languageSaved': 'Idioma del juego cambiado a {{language}}.',
        'profile.languageSaveFailed': 'No se pudo guardar el idioma del juego. Inténtalo de nuevo.',
        'profile.languageSelect': 'Seleccionar idioma',
        'invite.subtitle': 'Invita a amigos y gana 40 Coins cuando creen un club y compren su primer paquete de Coins.',
        'invite.referralAria': 'Enlace de invitación',
        'invite.copySuccess': 'Enlace de invitación copiado.',
        'invite.activityTitle': 'Actividad de invitaciones',
        'invite.activityDescription': 'Pendiente = tu amigo creó un club pero todavía no ha comprado Coins. Completado = tu amigo compró su primer paquete de Coins y recibiste la recompensa de 40 Coins.',
    },
    'createClub.json': {
        'page.backgroundAlt': 'Fondo de ciclismo',
        'jersey.title': 'Maillot del equipo',
        'jersey.description': 'Elige un maillot para desbloquear la creación del equipo. Podrás cambiarlo más tarde en Personalizar equipo.',
        'jersey.scrollLeft': 'Desplazar maillots a la izquierda',
        'jersey.scrollRight': 'Desplazar maillots a la derecha',
        'jersey.select': 'Seleccionar maillot genérico {{index}}',
        'jersey.alt': 'Maillot genérico {{index}}',
        'jersey.required': 'Debes seleccionar un maillot antes de crear tu equipo.',
        'preview.description': 'El diseño y los colores se actualizan en tiempo real.',
        'patterns.customDescription': 'El estilo interior solo se aplica al escudo generado del equipo.',
        'patterns.diagonalSash': 'Franja diagonal',
        'patterns.diagonalSplit': 'División diagonal',
        'patterns.centerStripe': 'Franja central',
        'patterns.quartered': 'Cuartos',
        'logo.description': 'Opcional. Sube un logotipo o utiliza una URL de imagen. Si no eliges ninguno, se utilizará el escudo generado.',
        'logo.useGenerated': 'Usar el escudo generado',
        'logo.orUrl': 'o usar una URL',
        'logo.uploaded': 'Logotipo personalizado seleccionado: {{name}}',
        'errors.pasteUrl': 'Pega primero la URL del logotipo.',
        'errors.invalidUrl': 'Introduce una URL válida para el logotipo.',
        'errors.httpUrl': 'La URL del logotipo debe empezar por http:// o https://.',
        'errors.countries': 'No se pudieron cargar los países',
        'errors.nameRequired': 'El nombre del equipo es obligatorio',
        'errors.countryRequired': 'El país del equipo es obligatorio',
        'errors.jerseyRequired': 'Elige un maillot antes de crear tu equipo.',
        'errors.signIn': 'Debes iniciar sesión para crear un equipo.',
    },
    'home.json': {
        'hero.description': 'ProPeloton Manager es un juego online de gestión ciclista en el que creas tu club, desarrollas ciclistas, planificas el calendario de carreras, negocias fichajes y compites contra otros mánagers en un mundo ciclista organizado por temporadas.',
        'hero.liveManagerLeagues': 'Ligas de mánagers en vivo',
        'hero.progressionValue': 'Competiciones, clasificaciones y recompensas',
        'raceSchedule.yesterday': 'Carreras de ayer',
        'raceSchedule.today': 'Carreras de hoy',
        'raceSchedule.tomorrow': 'Carreras de mañana',
        'stats.subtitle': 'Vista en directo del mundo ProPeloton.',
        'stats.activeManagers': 'Mánagers activos',
        'stats.totalRacesTours': 'Total de carreras y vueltas',
        'features.squadTitle': 'Gestión avanzada de la plantilla',
        'features.squadDescription': 'Entrena, rota y desarrolla ciclistas teniendo en cuenta la forma, la fatiga y la progresión del talento.',
        'features.racesDescription': 'Elige cuándo atacar, gestiona las escapadas y ejecuta tácticas para ganar etapas.',
        'features.marketDescription': 'Ojea ciclistas, realiza ofertas y negocia contratos en un mercado de fichajes dinámico.',
        'reviews.previous': 'Reseña anterior',
        'reviews.next': 'Siguiente reseña',
        'reviews.addReview': 'Añadir reseña',
        'reviews.addFirst': 'Añadir la primera reseña',
        'reviews.review': 'Reseña',
        'reviews.submit': 'Enviar reseña',
        'reviews.submitting': 'Enviando...',
        'reviews.reviewPosition': 'Reseña {{current}} de {{total}}',
        'reviews.submitFailed': 'No se pudo enviar la reseña.',
        'reviews.submitSuccess': 'Gracias. Tu reseña se ha enviado y aparecerá después de ser aprobada.',
        'cta.body': 'Crea tu club, ficha ciclistas y compite en ligas por temporadas.',
        'footer.description': 'Un juego premium de gestión ciclista online de Next Quest Studio. Construye un equipo, gestiona ciclistas, prepara carreras, sigue las clasificaciones y desarrolla tu club a lo largo de una temporada viva.',
        'footer.support': 'Soporte',
    },
}


def set_path(data, path: str, value: str) -> None:
    parts = path.split('.')
    current = data
    for part in parts[:-1]:
        current = current[part]
    current[parts[-1]] = value


def main() -> None:
    for filename, overrides in OVERRIDES.items():
        path = ES / filename
        data = json.loads(path.read_text(encoding='utf-8'))
        for dotted, value in overrides.items():
            set_path(data, dotted, value)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Polished {filename}: {len(overrides)} strings')


if __name__ == '__main__':
    main()
