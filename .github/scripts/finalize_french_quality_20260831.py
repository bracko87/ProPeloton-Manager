from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FR = ROOT / 'src/i18n/locales/fr'

OVERRIDES: dict[str, str] = {
    'calendarPage.json.races.stageBadgeCanceled': '{{race}} · Étape {{stage}} · Annulée ({{reason}})',
    'finance.json.sponsors.previewGcTop5Title': '{{race}} : top 5 final au GC',
    'finance.json.policies.weeklyDescription': 'Coût hebdomadaire récurrent calculé en fonction des coureurs actifs, du staff actif et des niveaux Team Policy actuellement sélectionnés.',
    'help.json.faq.a4': 'La préparation de course est l’espace où vous préparez les courses auxquelles votre équipe a été acceptée. Sélectionnez les coureurs, le staff, les véhicules et autres ressources, l’équipement, le ravitaillement et les tactiques d’étape. Pour une course par étapes, préparez également les tactiques de chaque étape après l’envoi du Race Plan.',
    'home.json.footer.description': 'Un jeu de gestion cycliste en ligne Premium de Next Quest Studio. Construisez votre équipe, gérez vos coureurs, préparez les courses, suivez les classements et développez votre club au fil d’une saison cycliste vivante et dynamique.',
    'manual.json.sections.rider-profile-skills.overview': 'Le profil d’un coureur présente son identité, ses attributs, son contrat, son entraînement, les comparaisons et son historique. Sa valeur réelle en course dépend de la combinaison de ses compétences, de sa forme, de son moral, de sa fatigue, de sa santé et de sa Race Sharpness.',
    'manual.json.sections.contact-forum-support.overview': 'Contact Us, le Forum et Discord sont les principaux points d’accès à l’assistance et à la communauté. Pour le moment, Contact Us fonctionne uniquement dans l’interface, tandis que le Forum redirige les joueurs vers Discord.',
    'manual.json.sections.notification-examples.facts[0].value': 'Rappels Race Plan, rappels Stage Plan, fenêtre de développement, prêt d’urgence, installation terminée, libération d’un coureur, objectif sponsor',
    'manual.json.sections.rider-skills-deep.facts[1].value': 'Potentiel, moral, fatigue, Race Sharpness',
    'manual.json.sections.race-sharpness-deep.details[0]': 'La Race Sharpness n’est pas la même chose que la forme obtenue à l’entraînement.',
    'manual.json.sections.staff-roles-deep.details[2]': 'Le Directeur sportif soutient les tactiques, les Stage Plans et les recommandations de préparation de course.',
    'manual.json.sections.stage-roles-deep.details[5]': 'Les rôles doivent aussi tenir compte de la fatigue, du moral, de la santé et de la Race Sharpness, pas uniquement des qualités brutes du coureur.',
    'manual.json.sections.faq-rider-underperformed.details[4]': 'Un moral faible ou une Race Sharpness insuffisante peut rendre un coureur normalement très fort moins efficace.',
    'manualCore.json.sections.riderProfileSkills.overview': 'Le profil d’un coureur présente son identité, ses attributs, son contrat, son entraînement, les comparaisons et son historique. Sa valeur réelle en course dépend de la combinaison de ses compétences, de sa forme, de son moral, de sa fatigue, de sa santé et de sa Race Sharpness.',
    'manualDeepA.json.sections.contactForumSupport.overview': 'Contact Us, le Forum et Discord sont les principaux points d’accès à l’assistance et à la communauté. Pour le moment, Contact Us fonctionne uniquement dans l’interface, tandis que le Forum redirige les joueurs vers Discord.',
    'manualDeepA.json.sections.notificationExamples.facts[1]': 'Rappels Race Plan, rappels Stage Plan, fenêtre de développement, prêt d’urgence, installation terminée, libération d’un coureur, objectif sponsor',
    'manualFaq.json.sections.riderUnderperformed.details[2]': 'Vérifiez le moral et la Race Sharpness.',
    'notifications.json.categories.stagePlanReminders': 'Rappels Stage Plan',
    'publicInfo.json.how.system3': 'Stage Plans et tactiques d’équipe',
    'publicInfo.json.privacy.s3p1': 'ProPeloton Manager peut proposer des abonnements Premium, des packs de Coins et d’autres fonctionnalités payantes. Le traitement des paiements est assuré par des prestataires externes tels que Stripe. Nous ne stockons pas les numéros complets de carte bancaire ni les codes de sécurité sur nos propres serveurs d’application.',
    'publicInfo.json.privacy.s7p2': 'Stripe reçoit et traite les informations de paiement et de facturation nécessaires au passage en caisse, à la facturation récurrente, aux factures, aux moyens de paiement, à la gestion des abonnements, aux remboursements et au traitement des litiges. Stripe traite ces informations conformément à ses propres règles de confidentialité.',
    'racePreparation.json.racePlan.fatigueHelp': 'La fatigue reste le principal facteur limitant. Un coureur avec une bonne Race Sharpness mais une fatigue très élevée ne prendra pas le départ totalement frais.',
    'racePreparation.json.racePlan.freshnessBarHelp': 'La barre rouge de fraîcheur au départ combine la fatigue et la Race Sharpness. Elle est limitée entre 50 et 100 afin qu’aucun coureur sélectionné ne commence une course avec un niveau de fraîcheur irréaliste.',
    'racePreparation.json.bonus.capHelp': 'Si ces deux valeurs diffèrent ensuite, le plafond du Race Engine ou une règle de normalisation a limité le bonus final.',
    'riderProfile.json.premiumBid.acceptedMissingId': 'L’offre Premium acceptée ne contient pas l’identifiant attendu. Fermez cette fenêtre puis rechargez le profil avant de réessayer.',
    'training.json.camps.genericLong': 'Ce stage d’entraînement à {{city}} offre des conditions structurées pour l’entraînement {{type}}, la préparation de l’équipe et le développement des coureurs.',
    'tutorials.json.overview.simpleOrDeep.body': 'Au début, vous pouvez jouer simplement : suivez les alertes, vérifiez votre équipe, inscrivez-vous aux courses, préparez votre formation et consultez les résultats. Plus tard, si vous souhaitez davantage de profondeur, vous pourrez utiliser des systèmes avancés comme la fatigue des coureurs, le moral, la Race Sharpness, les objectifs sponsors, les bonus d’équipement, les stages d’entraînement, les négociations de transfert, la fiscalité, les infrastructures ainsi que la promotion et la relégation.',
    'tutorials.json.squad.details.body': 'La page Effectif vous permet d’analyser vos coureurs sous plusieurs angles.\n\nVous pouvez consulter les informations financières, les compétences, la forme, le développement, la santé et la disponibilité. Les compétences peuvent progresser au fil du temps : cette page vous aide donc à suivre l’évolution de chaque coureur.\n\nEn cliquant sur le bouton Voir, vous ouvrez le profil complet du coureur avec des informations plus détaillées.\n\nCertains outils avancés, tableaux supplémentaires ou fonctions de confort peuvent nécessiter un compte Premium ou un achat en Coins.',
    'tutorials.json.racePreparation.racePlan.body': 'L’onglet Race Plan sert à préparer votre équipe pour une course acceptée. Important : le temps de jeu avance plus vite que le temps réel. Une journée de jeu correspond à 12 heures réelles, donc deux jours de jeu correspondent à une journée réelle. Gardez cela à l’esprit lorsque vous vérifiez les fenêtres du Race Plan, les échéances de sélection des coureurs et les échéances des Stage Plans. Lorsque la fenêtre Race Plan est ouverte, vous pouvez choisir si votre équipe première ou Developing Team participera, si Developing Team est disponible. Vérifiez aussi l’échéance de sélection des coureurs. Jusqu’à cette date, vous pouvez choisir les coureurs participants. La page indique le nombre minimum et maximum de coureurs autorisés. La liste montre qui peut être sélectionné et qui est bloqué parce qu’il est déjà affecté à une autre course qui se chevauche. Vous pouvez également affecter le staff et les ressources de course disponibles.',
    'tutorials.json.menu.premium.body': 'Voici votre espace Premium.\n\nUn compte Premium peut rendre le jeu plus confortable en donnant accès à des fonctionnalités supplémentaires, des vues plus avancées et des outils pratiques.\n\nPremium peut également vous permettre de profiter plus largement de l’expérience complète de gestion.\n\nEn achetant Premium ou des Pro Packages, vous soutenez directement notre équipe et nous aidez à poursuivre le développement de ProPeloton Manager plus rapidement et dans de meilleures conditions.',
}


def parse_path(path: str) -> tuple[str, list[str | int]]:
    marker = '.json.'
    if marker not in path:
        raise ValueError(f'Invalid locale path: {path}')
    stem, rest = path.split(marker, 1)
    file_name = stem + '.json'
    tokens: list[str | int] = []
    for part in rest.split('.'):
        while '[' in part:
            before, tail = part.split('[', 1)
            if before:
                tokens.append(before)
            idx, part = tail.split(']', 1)
            tokens.append(int(idx))
        if part:
            tokens.append(part)
    return file_name, tokens


def set_path(data: Any, tokens: list[str | int], value: str) -> None:
    cursor = data
    for token in tokens[:-1]:
        cursor = cursor[token]
    cursor[tokens[-1]] = value


def main() -> None:
    changed_files: set[str] = set()
    changed_strings = 0
    for full_path, value in OVERRIDES.items():
        file_name, tokens = parse_path(full_path)
        path = FR / file_name
        data = json.loads(path.read_text(encoding='utf-8'))
        cursor = data
        for token in tokens:
            cursor = cursor[token]
        if cursor == value:
            continue
        set_path(data, tokens, value)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        changed_files.add(file_name)
        changed_strings += 1
    print(f'Applied {changed_strings} French quality overrides across {len(changed_files)} files.')


if __name__ == '__main__':
    main()
