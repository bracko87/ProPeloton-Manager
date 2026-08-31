from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FR = ROOT / 'src/i18n/locales/fr'

# High-confidence cleanups for literal MT patterns that are unnatural in a cycling-management UI.
REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'\bgestion de vélo\b', re.I), 'gestion cycliste'),
    (re.compile(r'\bGestion du vélo\b'), 'Gestion cycliste'),
    (re.compile(r'\bgestionnaires\b', re.I), 'managers'),
    (re.compile(r'\bGestionnaires\b'), 'Managers'),
    (re.compile(r'\bVannes d’équipement\b|\bVannes d\'équipement\b', re.I), 'Fourgons d’équipement'),
    (re.compile(r'\bVanne médicale\b', re.I), 'Fourgon médical'),
    (re.compile(r'\bVannes médicales\b', re.I), 'Fourgons médicaux'),
    (re.compile(r'\bVans d’équipement\b|\bVans d\'équipement\b', re.I), 'fourgons d’équipement'),
    (re.compile(r'\bVans médicaux\b', re.I), 'fourgons médicaux'),
    (re.compile(r'\bVan médical\b', re.I), 'fourgon médical'),
    (re.compile(r'\bÉquipement Van\b', re.I), 'Fourgon d’équipement'),
    (re.compile(r'\bEquipment Van\b', re.I), 'Fourgon d’équipement'),
    (re.compile(r'\bFentes pleines\b', re.I), 'Emplacements complets'),
    (re.compile(r'\bfentes\b', re.I), 'emplacements'),
    (re.compile(r'\bfente\b', re.I), 'emplacement'),
    (re.compile(r'\bPorte-photo\b', re.I), 'Emplacement de l’image'),
    (re.compile(r'\bOwned (?=\{\{)', re.I), 'Possédés '),
    (re.compile(r'\bPending (?=\{\{)', re.I), 'En attente '),
    (re.compile(r'\bSauvages utilisés\b', re.I), 'Sauvetages utilisés'),
    (re.compile(r'\bClub liquide\b', re.I), 'Club liquidé'),
    (re.compile(r'\brenversement de la saison\b', re.I), 'transition de saison'),
    (re.compile(r'\brenversement\b', re.I), 'transition'),
    (re.compile(r'\broulement de la saison\b', re.I), 'transition de saison'),
    (re.compile(r'\bslot de concurrence\b', re.I), 'place en compétition'),
    (re.compile(r'\bslot de compétition\b', re.I), 'place en compétition'),
    (re.compile(r'\bconcurrence\b', re.I), 'compétition'),
    (re.compile(r'\bcongelé\b', re.I), 'figé'),
    (re.compile(r'\bcongelée\b', re.I), 'figée'),
    (re.compile(r'\bIl a échoué à\b', re.I), 'Impossible de'),
    (re.compile(r'\bSauver\.\.\.\b', re.I), 'Enregistrement...'),
    (re.compile(r'\bRafraîchissant\.\.\.\b', re.I), 'Actualisation...'),
    (re.compile(r'\bRafraîchir\b', re.I), 'Actualiser'),
    (re.compile(r'\bPièce\b'), 'Coin'),
    (re.compile(r'\bPaquets Pro\b', re.I), 'Packs Pro'),
    (re.compile(r'\bPersonne à contacter\b', re.I), 'Contact'),
    (re.compile(r'\bAppui\b'), 'Support'),
    (re.compile(r'\bSnaphot\b', re.I), 'Aperçu'),
    (re.compile(r'\bRégime d’assurance-chômage/disposition\b|\bRégime d\'assurance-chômage/disposition\b', re.I), 'Interface / mise en page'),
    (re.compile(r'\bCheating / Exploits\b', re.I), 'Triche / Exploits'),
    (re.compile(r'\bCourriel\b'), 'E-mail'),
    (re.compile(r'\bcourriel\b'), 'e-mail'),
]

OVERRIDES: dict[str, str] = {
    # Common / profile
    'common.json.language.applicationLanguage': 'Langue de l’application',
    'common.json.actions.skipTutorial': 'Passer le tutoriel',
    'common.json.forum.movingText': 'Le forum intégré n’est pas utilisé pour le moment. Les discussions sur le jeu, les guides, les questions et les échanges avec la communauté se déroulent sur notre serveur Discord.',
    'common.json.forum.joinText': 'Échangez avec d’autres joueurs, posez vos questions, obtenez de l’aide sur le jeu et suivez les dernières nouvelles de la communauté.',
    'profile.json.dropdown.signedInAs': 'Connecté en tant que',

    # Account pages
    'accountPages.json.inbox.subtitle': 'Conversations privées et messages administratifs.',
    'accountPages.json.inbox.readConversations': 'Conversations lues',
    'accountPages.json.inbox.noAuth': 'Aucun utilisateur connecté sur cette page.',
    'accountPages.json.inbox.adminThread': 'Message administratif',
    'accountPages.json.inbox.readOnly': 'Lecture seule',
    'accountPages.json.inbox.adminNoReplies': 'Il s’agit d’un message administratif. Les réponses sont actuellement désactivées.',
    'accountPages.json.inbox.loadConversationsFailed': 'Impossible de charger les conversations.',
    'accountPages.json.inbox.sendFailed': 'Impossible d’envoyer le message.',
    'accountPages.json.profile.displayName': 'Nom affiché',
    'accountPages.json.profile.displayNamePlaceholder': 'Nom affiché',
    'accountPages.json.profile.displayNameHelp': '3 à 24 caractères. Lettres, chiffres et tirets bas uniquement. Les espaces sont remplacés par des tirets bas.',
    'accountPages.json.profile.emailPlaceholder': 'Adresse e-mail',
    'accountPages.json.profile.birthday': 'Date de naissance',
    'accountPages.json.profile.birthdayHelp': 'La date de naissance est définie lors de l’inscription et ne peut plus être modifiée ensuite. Vous recevez 10 Coins le jour de votre anniversaire.',
    'accountPages.json.profile.passwordDescription': 'Pour des raisons de sécurité, les changements de mot de passe passent par une vérification par e-mail. Nous enverrons un lien de réinitialisation à l’adresse e-mail actuelle de votre compte.',
    'accountPages.json.profile.sendingEmail': 'Envoi de l’e-mail...',
    'accountPages.json.profile.sendPasswordEmail': 'Envoyer l’e-mail de modification du mot de passe',
    'accountPages.json.profile.passwordHelp': 'Après avoir ouvert le lien reçu par e-mail, vous pourrez choisir un nouveau mot de passe sur la page de réinitialisation.',
    'accountPages.json.profile.displayNameLength': 'Le nom affiché doit contenir entre 3 et 24 caractères.',
    'accountPages.json.profile.saved': 'Profil enregistré avec succès.',
    'accountPages.json.profile.savedEmail': 'Profil enregistré. Si la confirmation par e-mail est activée, veuillez confirmer votre nouvelle adresse.',
    'accountPages.json.profile.resetSent': 'E-mail de réinitialisation envoyé à {{email}}. Vérifiez votre boîte de réception et votre dossier spam, puis suivez le lien pour choisir un nouveau mot de passe.',
    'accountPages.json.profile.resetFailed': 'Impossible d’envoyer l’e-mail de réinitialisation du mot de passe. Veuillez réessayer dans un instant.',
    'accountPages.json.profile.languageSaving': 'Enregistrement de la langue...',
    'accountPages.json.profile.languageAccountHelp': 'Cette préférence est enregistrée sur votre compte et sera utilisée sur vos autres appareils et lors de vos prochaines connexions.',
    'accountPages.json.profile.languageSaved': 'La langue du jeu a été modifiée en {{language}}.',
    'accountPages.json.profile.languageSaveFailed': 'Impossible d’enregistrer la langue du jeu. Veuillez réessayer.',
    'accountPages.json.invite.subtitle': 'Invitez des amis et gagnez 40 Coins lorsqu’ils créent un club et achètent leur premier pack de Coins.',
    'accountPages.json.invite.linkDescription': 'Partagez ce lien avec un ami. Lorsqu’il crée un club puis effectue son premier achat de Coins, vous recevez 40 Coins.',
    'accountPages.json.invite.referralAria': 'Lien d’invitation',
    'accountPages.json.invite.loadingLink': 'Chargement du lien d’invitation...',
    'accountPages.json.invite.copySuccess': 'Lien d’invitation copié.',
    'accountPages.json.invite.shareTitle': 'Rejoignez-moi sur ProPeloton Manager',
    'accountPages.json.invite.activityTitle': 'Activité de parrainage',
    'accountPages.json.invite.activityDescription': 'En attente = votre ami a créé un club mais n’a pas encore acheté de Coins. Terminé = votre ami a effectué son premier achat de Coins et votre récompense de 40 Coins a été attribuée.',
    'accountPages.json.invite.loadingActivity': 'Chargement de l’activité de parrainage...',
    'accountPages.json.invite.noActivity': 'Aucune activité de parrainage pour le moment. Partagez votre lien d’invitation pour commencer à gagner des Coins.',
    'accountPages.json.invite.pendingDescription': 'Un ami a créé un club et attend encore son premier achat de Coins.',
    'accountPages.json.invite.completedDescription': 'Un ami a effectué son premier achat de Coins.',
    'accountPages.json.invite.rejectedDescription': 'Ce parrainage n’a pas pu être finalisé.',
    'accountPages.json.invite.referredUser': 'Utilisateur parrainé',
    'accountPages.json.invite.referredClub': 'Club parrainé',
    'accountPages.json.invite.loadCodeFailed': 'Impossible de charger le code de parrainage.',
    'accountPages.json.invite.missingCode': 'Le code de parrainage est manquant.',
    'accountPages.json.invite.loadActivityFailed': 'Impossible de charger l’activité de parrainage pour le moment.',
    'accountPages.json.forum.notice': 'Il n’y aura pas de forum intégré sur cette page pour le moment. Les discussions sur le jeu, les guides, les questions et les échanges avec la communauté se déroulent sur notre serveur Discord.',
    'accountPages.json.forum.discordDescription': 'Échangez avec d’autres joueurs, posez vos questions, obtenez de l’aide sur le jeu et suivez les dernières nouvelles de la communauté.',

    # App shell
    'appShell.json.guards.checkingSession': 'Vérification de votre session...',
    'appShell.json.guards.clubLoadFailed': 'Impossible de charger votre club pour le moment. Veuillez réessayer dans un instant.',
    'appShell.json.guards.redirectingSignup': 'Redirection vers l’inscription...',
    'appShell.json.access.checkingClub': 'Vérification du statut du club...',
    'appShell.json.access.cannotPlay': 'Ce club n’est pas jouable pour le moment.',
    'appShell.json.restartWelcome.close': 'Fermer le message de bienvenue',
    'appShell.json.restartWelcome.body1': 'Votre équipe est de nouveau active avec un nouvel effectif de départ, l’équipement initial, les finances de départ et 0 point de saison.',
    'appShell.json.restartWelcome.body2': 'Le nom du club, le logo, le maillot, le pays et la place en compétition ont été conservés. Les anciens coureurs ont été libérés comme coureurs libres et le club est prêt pour un nouveau départ.',
    'appShell.json.restartWelcome.goodLuck': 'Bonne chance pour ce nouveau départ. Construisez avec soin, maîtrisez votre budget et ramenez votre club au plus haut niveau.',
    'appShell.json.restartWelcome.continue': 'Continuer vers le tableau de bord',
    'appShell.json.liquidation.description': 'Ce club a déjà utilisé ses 3 sauvetages d’urgence à vie et n’a pas pu couvrir une nouvelle obligation obligatoire. Aucun autre prêt d’urgence n’est disponible et l’équipe ne peut plus effectuer d’actions de jeu.',
    'appShell.json.liquidation.reason': 'Raison',
    'appShell.json.liquidation.closedAt': 'Fermé le :',
    'appShell.json.liquidation.accountNotice': 'Votre compte utilisateur et vos Coins restent actifs. Seul ce club est fermé. Vous pouvez créer un nouveau club dans la prochaine place disponible ou redémarrer cette équipe dans la même compétition avec un nouvel effectif, sans staff et avec 0 point.',
    'appShell.json.liquidation.identityTitle': 'Le redémarrage de l’équipe conserve l’identité de votre club.',
    'appShell.json.liquidation.identityBody': 'L’identifiant du club, le compte propriétaire, le nom de l’équipe, le logo, le maillot, le pays et la place de niveau/division restent inchangés. Les coureurs actuels deviennent des coureurs libres, les points de saison sont remis à 0 et le club reçoit un nouvel effectif de départ adapté à son niveau de compétition.',
    'appShell.json.restartModal.failed': 'Le redémarrage de l’équipe a échoué.',
    'appShell.json.restartModal.unexpected': 'Le redémarrage de l’équipe a échoué en raison d’une erreur inattendue.',
    'appShell.json.restartModal.close': 'Fermer la confirmation du redémarrage',
    'appShell.json.restartModal.intro': 'Le redémarrage conserve l’identité du club et sa place en compétition, mais réinitialise son état sportif et les données de gameplay de l’équipe.',
    'appShell.json.restartModal.keepAccount': 'Compte utilisateur et Coins',
    'appShell.json.restartModal.keepJersey': 'Maillot',
    'appShell.json.restartModal.keepCompetition': 'Niveau, division et place en compétition actuels',
    'appShell.json.restartModal.lose': 'Vous perdrez ou réinitialiserez',
    'appShell.json.restartModal.loseRanking': 'Classement et position actuels',
    'appShell.json.restartModal.loseSponsors': 'Sponsors et partenaires de naming',
    'appShell.json.restartModal.loseEquipment': 'Progression de l’équipement, actifs et ravitaillement',
    'appShell.json.restartModal.loseGameplay': 'Entraînement, scouting, transferts et préparation de course',
    'appShell.json.restartModal.after': 'Après le redémarrage, votre équipe reçoit un nouvel effectif de départ adapté à son niveau de compétition, l’équipement et l’infrastructure de départ, ainsi que 0 point de saison.',
    'appShell.json.restartModal.typeConfirm': 'Saisissez RESTART pour confirmer',
    'appShell.json.rollover.eyebrow': 'Transition de saison',
    'appShell.json.rollover.title': 'La saison {{season}} est en préparation',
    'appShell.json.rollover.body': 'La transition de saison est en cours. Les données de votre club et de votre partie restent protégées pendant la finalisation de la nouvelle saison.',
    'appShell.json.rollover.frozenAtMidnight': 'Pause au 1er janvier · 00:00',
    'appShell.json.rollover.autoCheck': 'Cette page vérifie automatiquement l’avancement toutes les 20 secondes et vous renvoie au jeu lorsque la transition est terminée.',
    'appShell.json.rollover.delayedTitle': 'La transition prend plus de temps que prévu',
    'appShell.json.rollover.delayedBody': 'Le jeu restera figé en toute sécurité jusqu’à la réussite de toutes les validations requises. Les données de votre club ne seront ni ignorées ni appliquées partiellement.',
    'appShell.json.rollover.checkingStatus': 'Vérification de l’état de la transition de saison...',
    'appShell.json.rollover.statusCheckFailedTitle': 'Le statut de la saison est temporairement indisponible',
    'appShell.json.rollover.statusCheckFailedBody': 'Nous ne pouvons pas confirmer en toute sécurité si le jeu est actuellement disponible. La page continuera à réessayer automatiquement.',
    'appShell.json.rollover.checking': 'Vérification...',
    'appShell.json.rollover.checkAgain': 'Vérifier à nouveau',
    'appShell.json.rollover.phases.starting': 'Début de la transition de saison',
    'appShell.json.rollover.phases.sourceFrozen': 'Classement final figé',
    'appShell.json.rollover.phases.coreValidated': 'Compétitions et marchés traités',
    'appShell.json.rollover.phases.communicationDone': 'Notifications créées',

    # Homepage
    'home.json.beta.body': 'Le jeu est encore en phase de test et d’amélioration. Si vous souhaitez devenir testeur et nous aider à tester ProPeloton Manager, contactez-nous d’abord sur notre serveur Discord. Nous vous indiquerons ensuite les prochaines étapes.',
    'home.json.beta.continue': 'Continuer vers le site',
    'home.json.beta.closeLabel': 'Fermer l’avis bêta',
    'home.json.hero.titleLine3': 'Dominez la saison.',
    'home.json.hero.description': 'ProPeloton Manager est un jeu de gestion cycliste en ligne dans lequel vous créez votre club, développez vos coureurs, planifiez le calendrier des courses, négociez des transferts et affrontez de vrais managers dans un univers cycliste organisé par saisons.',
    'home.json.hero.gameTime': 'Temps de jeu',
    'home.json.hero.liveManagerLeagues': 'Ligues de managers en direct',
    'home.json.hero.progression': 'Progression',
    'home.json.hero.progressionValue': 'Tournois, classements et récompenses',
    'home.json.raceSchedule.yesterday': 'Courses d’hier',
    'home.json.raceSchedule.today': 'Courses d’aujourd’hui',
    'home.json.raceSchedule.tomorrow': 'Courses de demain',
    'home.json.stats.subtitle': 'Un aperçu en direct de l’univers ProPeloton.',
    'home.json.stats.activeManagers': 'Managers actifs',
    'home.json.stats.totalRacesTours': 'Total des courses et tours',
    'home.json.features.title': 'Fonctionnalités principales',
    'home.json.features.squadTitle': 'Gestion approfondie de l’effectif',
    'home.json.features.squadDescription': 'Entraînez, faites tourner et développez vos coureurs avec une forme, une fatigue et une progression du talent réalistes.',
    'home.json.features.marketDescription': 'Scoutez les coureurs, faites des offres et négociez les contrats sur un marché des transferts dynamique.',
    'home.json.guide.intro': 'ProPeloton Manager repose sur une gestion cycliste à long terme. Les pages publiques présentent le jeu, tandis que la page d’accueil donne un aperçu direct des principaux systèmes : construction de l’équipe, développement des coureurs, préparation de course, tactiques, finances, support et classements de saison.',
    'home.json.guide.whatText': 'ProPeloton Manager est un jeu de gestion cycliste en ligne dans lequel vous créez et développez un club. Au lieu de contrôler directement un coureur, vous gérez tout ce qui entoure la course : coureurs, entraînement, Race Plans, staff, équipement, finances, sponsors, transferts et progression à long terme dans les classements.',
    'home.json.guide.howTitle': 'Comment jouer ?',
    'home.json.guide.howText': 'Les managers construisent leur effectif, étudient le calendrier, s’inscrivent aux courses adaptées, préparent les Race Plans, choisissent les coureurs, attribuent les rôles, gèrent le ravitaillement et suivent les résultats. Les bonnes décisions dépendent des compétences, de la fatigue, du moral, du profil de course, de la météo, du budget et des objectifs de saison.',
    'home.json.guide.preparationTitle': 'Pourquoi la préparation est-elle importante ?',
    'home.json.guide.preparationText': 'Un excellent coureur ne suffit pas à lui seul. La préparation de course relie coureurs, staff, véhicules, équipement, ravitaillement et tactiques. Anticiper permet d’aborder au mieux les sprints, les ascensions, les contre-la-montre, les courses par étapes et les conditions météo difficiles.',
    'home.json.screenshots.subtitle': 'Découvrez la gestion d’équipe, la préparation de course, les tactiques et l’univers cycliste de ProPeloton Manager.',
    'home.json.reviews.previous': 'Avis précédent',
    'home.json.reviews.next': 'Avis suivant',
    'home.json.reviews.leaveReview': 'Laisser un avis',
    'home.json.reviews.addReview': 'Ajouter un avis',
    'home.json.reviews.closeForm': 'Fermer le formulaire d’avis',
    'home.json.reviews.name': 'Nom',
    'home.json.reviews.review': 'Avis',
    'home.json.reviews.submit': 'Envoyer l’avis',
    'home.json.reviews.submitting': 'Envoi...',
    'home.json.reviews.reviewPosition': 'Avis {{current}} sur {{total}}',
    'home.json.reviews.messageMax': 'Votre avis doit contenir moins de 1200 caractères.',
    'home.json.reviews.submitFailed': 'Impossible d’envoyer l’avis.',
    'home.json.reviews.submitSuccess': 'Merci. Votre avis a été envoyé et apparaîtra après validation.',
    'home.json.cta.badge': 'Rejoignez la compétition',
    'home.json.footer.legal': 'Juridique',
    'home.json.footer.connect': 'Nous contacter',
    'home.json.footer.contact': 'Contact',
    'home.json.footer.terms': 'Conditions d’utilisation',
    'home.json.footer.support': 'Support',
    'home.json.status.preparingAccount': 'Préparation de votre compte manager...',
    'home.json.status.clubStatusError': 'Vous êtes connecté, mais nous ne pouvons pas charger le statut de votre club. Actualisez la page ou réessayez.',
    'home.json.status.clubCreationDisabled': 'La création de nouveaux clubs est temporairement désactivée pendant le développement de ProPeloton Manager. Les managers existants peuvent continuer à se connecter.',

    # Navigation / reporting UI
    'navigation.json.proPackages': 'Packs Pro',
    'navigation.json.subtitle': 'Gestion cycliste multijoueur',
    'navigation.json.descriptions.overview': 'Aperçu du club et dernières informations',
    'navigation.json.descriptions.squad': 'Gérer les coureurs et l’effectif',
    'navigation.json.descriptions.racePreparation': 'Startlist, logistique et Stage Plans',
    'navigation.json.descriptions.teamRanking': 'Classements des équipes',
    'navigation.json.descriptions.training': 'Entraînement et séances des coureurs',
    'navigation.json.descriptions.equipment': 'Vélos, roues et matériel',
    'navigation.json.header.toggleSidebar': 'Afficher ou masquer la barre latérale',
    'navigation.json.header.namingRights': 'Droits de naming',
    'navigation.json.header.freeAccountMember': 'Compte gratuit. Découvrir Premium',
    'navigation.json.header.freeAccount': 'Compte gratuit — découvrir Premium',
    'navigation.json.header.coin': 'Coin',
    'navigation.json.header.manager': 'Manager',
    'navigation.json.footer.description': 'ProPeloton Manager est un jeu de gestion cycliste en ligne actuellement en développement actif.',
    'navigation.json.footer.navigation': 'Navigation du pied de page',
    'navigation.json.footer.terms': 'Conditions d’utilisation',
    'navigation.json.footer.support': 'Support',
    'navigation.json.footer.contact': 'Contact',
    'navigation.json.bugReport.sent': 'Rapport de bug envoyé.',
    'navigation.json.bugReport.uiLayout': 'Interface / mise en page',
    'navigation.json.bugReport.gameplayLogic': 'Gameplay / logique',
    'navigation.json.bugReport.expectedResult': 'Résultat attendu',
    'navigation.json.bugReport.expectedPlaceholder': 'Que devait-il se passer ?',
    'navigation.json.bugReport.actualResult': 'Résultat observé',
    'navigation.json.bugReport.actualPlaceholder': 'Que s’est-il passé à la place ?',
    'navigation.json.playerReport.checking': 'Vérification...',
    'navigation.json.playerReport.reason': 'Raison',
    'navigation.json.playerReport.cheating': 'Triche / Exploits',
    'navigation.json.playerReport.proofHelp': 'Ajoutez une image comme preuve. Taille maximale : {{size}} MB.',
    'navigation.json.playerReport.checkFailed': 'Impossible de vérifier si un signalement existe déjà.',
    'navigation.json.playerReport.sendFailed': 'Impossible d’envoyer le signalement.',

    # Infrastructure: the original MT model was particularly literal here.
    'infrastructure.json.page.description': 'Les bâtiments utilisent désormais des durées de construction basées sur le temps de jeu. L’infrastructure détermine la capacité du staff, les plafonds de ses effets, les limites de scouting et prépare les futurs systèmes d’équipement.',
    'infrastructure.json.page.refresh': 'Actualiser',
    'infrastructure.json.page.refreshing': 'Actualisation...',
    'infrastructure.json.page.currentGameDate': 'Date actuelle du jeu :',
    'infrastructure.json.page.staffContextError': 'L’infrastructure a été chargée, mais le contexte des effets du staff n’a pas pu être récupéré :',
    'infrastructure.json.common.saving': 'Enregistrement...',
    'infrastructure.json.common.support': 'Support',
    'infrastructure.json.common.owned': 'Possédé',
    'infrastructure.json.common.pending': 'En attente',
    'infrastructure.json.common.completes': 'Se termine',
    'infrastructure.json.common.upgrade': 'Améliorer',
    'infrastructure.json.common.slotsFull': 'Emplacements complets',
    'infrastructure.json.common.configMissing': 'Configuration manquante',
    'infrastructure.json.common.currentCoinBalance': 'Solde actuel de Coins :',
    'infrastructure.json.facilities.activeJobs': 'Travaux en cours',
    'infrastructure.json.facilities.noJobs': 'Aucun chantier d’infrastructure n’est actuellement en cours.',
    'infrastructure.json.facilities.active': 'actif',
    'infrastructure.json.facilities.open': 'libre',
    'infrastructure.json.facilities.jobsInProgress': '{{count}} travaux d’infrastructure en cours',
    'infrastructure.json.facilities.jobInProgress': '{{count}} chantier d’infrastructure en cours',
    'infrastructure.json.facilities.refundNow': 'Remboursement immédiat',
    'infrastructure.json.facilities.detailsTitle': 'Détails de l’installation',
    'infrastructure.json.facilities.imagePlaceholder': 'Emplacement de l’image',
    'infrastructure.json.facilities.currentImpact': 'Effet actuel',
    'infrastructure.json.facilities.jobProgress': 'Avancement des travaux',
    'infrastructure.json.facilities.fallbackRemaining': 'Temps réel restant :',
    'infrastructure.json.facilities.lockedDuringConstruction': 'Cette installation est indisponible pendant les travaux.',
    'infrastructure.json.facilities.costCharged': 'Le coût des travaux est débité immédiatement au démarrage.',
    'infrastructure.json.facilities.noUpgrade': 'Aucune amélioration n’est actuellement disponible.',
    'infrastructure.json.facilities.upgradeStarted': 'Amélioration/construction de {{name}} lancée.',
    'infrastructure.json.facilities.jobCancelled': 'Travaux d’infrastructure annulés et remboursement traité.',
    'infrastructure.json.facilityTypes.scouting': 'scouting',
    'infrastructure.json.facilityNames.clubHouse': 'Club House',
    'infrastructure.json.facilityNames.trainingCenter': 'Centre d’entraînement',
    'infrastructure.json.facilityNames.youthAcademy': 'Académie des jeunes',
    'infrastructure.json.facilityNames.mechanicsWorkshop': 'Atelier mécanique',
    'infrastructure.json.facilityNames.scoutingOffice': 'Bureau de scouting',
    'infrastructure.json.facilityDescriptions.trainingCenterShort': 'Centre d’entraînement principal pour le développement des coureurs et le travail quotidien du staff.',
    'infrastructure.json.facilityDescriptions.medicalCenterShort': 'Centre médical dédié à la prévention, aux soins, à la récupération et à la santé des coureurs.',
    'infrastructure.json.facilityDescriptions.scoutingOfficeShort': 'Centre de scouting et d’analyse pour les rapports, le marché et la détection de talents.',
    'infrastructure.json.assets.equipmentVan': 'Fourgon d’équipement',
    'infrastructure.json.assets.equipmentVans': 'Fourgons d’équipement',
    'infrastructure.json.assets.equipmentVanGarage': 'Garage des fourgons d’équipement',
    'infrastructure.json.assets.medicalVan': 'Fourgon médical',
    'infrastructure.json.assets.medicalVans': 'Fourgons médicaux',
    'infrastructure.json.assets.medicalVanGarage': 'Garage des fourgons médicaux',
    'infrastructure.json.assets.acquireEquipmentVan': 'Commander un fourgon d’équipement',
    'infrastructure.json.assets.acquireMedicalVan': 'Commander un fourgon médical',
    'infrastructure.json.assets.ownedPending': 'Possédés {{owned}} · En attente {{pending}}',
}


def parse_path(path: str) -> tuple[str, list[str | int]]:
    marker = '.json.'
    stem, rest = path.split(marker, 1)
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
    return stem + '.json', tokens


def set_path(data: Any, tokens: list[str | int], value: str) -> None:
    cursor = data
    for token in tokens[:-1]:
        cursor = cursor[token]
    cursor[tokens[-1]] = value


def clean_string(value: str) -> str:
    out = value
    for pattern, replacement in REPLACEMENTS:
        out = pattern.sub(replacement, out)
    out = re.sub(r'\s+([,.;:!?])', r'\1', out)
    out = re.sub(r' {2,}', ' ', out)
    return out


def walk(value: Any) -> tuple[Any, int]:
    if isinstance(value, dict):
        changed = 0
        out: dict[str, Any] = {}
        for key, item in value.items():
            new_item, count = walk(item)
            out[key] = new_item
            changed += count
        return out, changed
    if isinstance(value, list):
        changed = 0
        out_list: list[Any] = []
        for item in value:
            new_item, count = walk(item)
            out_list.append(new_item)
            changed += count
        return out_list, changed
    if isinstance(value, str):
        new_value = clean_string(value)
        return new_value, int(new_value != value)
    return value, 0


def main() -> None:
    changed_files: set[str] = set()
    changed_strings = 0

    # First apply safe global lexical cleanup to every French namespace.
    for path in sorted(FR.glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        updated, count = walk(data)
        if count:
            path.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            changed_files.add(path.name)
            changed_strings += count

    # Then apply context-sensitive human rewrites.
    for full_path, value in OVERRIDES.items():
        file_name, tokens = parse_path(full_path)
        path = FR / file_name
        data = json.loads(path.read_text(encoding='utf-8'))
        cursor: Any = data
        try:
            for token in tokens:
                cursor = cursor[token]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(f'Invalid French override path: {full_path}') from exc
        if cursor == value:
            continue
        set_path(data, tokens, value)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        changed_files.add(file_name)
        changed_strings += 1

    print(f'French human-quality polish changed {changed_strings} strings across {len(changed_files)} files.')


if __name__ == '__main__':
    main()
