from __future__ import annotations

import finalize_french_quality_20260831 as base

base.OVERRIDES['tutorials.json.racePreparation.racePlan.body'] = (
    'L’onglet Race Plan sert à préparer votre équipe pour une course acceptée. Important : le temps de jeu avance plus vite que le temps réel. '
    'Une journée de jeu correspond à 12 heures réelles, donc deux jours de jeu correspondent à une journée réelle. Gardez cela à l’esprit lorsque '
    'vous vérifiez les fenêtres du Race Plan, les échéances de sélection des coureurs et les échéances des Stage Plans, avec un Stage Plan propre à '
    'chaque étape. Lorsque la fenêtre Race Plan est ouverte, vous pouvez choisir si votre équipe première ou Developing Team participera, si Developing '
    'Team est disponible. Vérifiez aussi l’échéance de sélection des coureurs. Jusqu’à cette date, vous pouvez choisir les coureurs participants. La page '
    'indique le nombre minimum et maximum de coureurs autorisés. La liste montre qui peut être sélectionné et qui est bloqué parce qu’il est déjà affecté '
    'à une autre course qui se chevauche. Vous pouvez également affecter le staff et les ressources de course disponibles.'
)

if __name__ == '__main__':
    base.main()
