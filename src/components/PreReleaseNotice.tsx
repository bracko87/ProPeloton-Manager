/**
 * Public pre-release notice: signups are allowed during the final test,
 * but the official release has NOT happened. Show before registration
 * and on the homepage/sign-in page so no one mistakes the test for launch.
 */
import React from 'react'
import { useTranslation } from 'react-i18next'

type Copy = { title: string; description: string; accounts: string }

const COPY: Record<string, Copy> = {
  en: {
    title: 'Pre-release test — one more reset before launch',
    description:
      'Registration is open for testing. ProPeloton Manager will restart once more before its official release. All test-season game progress, race results, rankings, training and team finances will be reset.',
    accounts:
      'Your account and team identity will remain. The official release date has not been announced yet.',
  },
  de: {
    title: 'Testphase — ein weiterer Neustart vor dem offiziellen Start',
    description:
      'Die Registrierung ist für die Testphase geöffnet. Vor der offiziellen Veröffentlichung wird ProPeloton Manager noch einmal zurückgesetzt. Spielfortschritt, Rennergebnisse, Ranglisten, Training und Teamfinanzen aus der Testphase werden zurückgesetzt.',
    accounts:
      'Dein Konto und die Identität deines Teams bleiben erhalten. Ein offizielles Veröffentlichungsdatum steht noch nicht fest.',
  },
  'sr-latn': {
    title: 'Test faza — još jedno resetovanje pre zvaničnog izlaska',
    description:
      'Registracija je otvorena za testiranje. ProPeloton Manager će biti resetovan još jednom pre zvaničnog izlaska. Napredak u igri, rezultati trka, rang-liste, treninzi i finansije timova iz test sezone biće resetovani.',
    accounts:
      'Tvoj nalog i identitet tima ostaju sačuvani. Datum zvaničnog izlaska još nije objavljen.',
  },
  hr: {
    title: 'Testna faza — još jedno resetiranje prije izlaska',
    description:
      'Registracija je otvorena za testiranje. ProPeloton Manager ponovno će se pokrenuti prije službenog izlaska. Napredak, rezultati utrka, poretci, treninzi i financije timova iz testne sezone bit će resetirani.',
    accounts:
      'Vaš račun i identitet tima ostat će sačuvani. Datum službenog izlaska još nije objavljen.',
  },
  es: {
    title: 'Prueba previa al lanzamiento — habrá un último reinicio',
    description:
      'El registro está abierto para las pruebas. ProPeloton Manager se reiniciará una vez más antes del lanzamiento oficial. Se restablecerán el progreso, los resultados, las clasificaciones, los entrenamientos y las finanzas de los equipos de esta temporada de prueba.',
    accounts:
      'Tu cuenta y la identidad de tu equipo se conservarán. Aún no se ha anunciado la fecha de lanzamiento oficial.',
  },
  fr: {
    title: 'Phase de test — une dernière réinitialisation avant la sortie',
    description:
      'Les inscriptions sont ouvertes pour les tests. ProPeloton Manager sera réinitialisé une dernière fois avant sa sortie officielle. La progression, les résultats des courses, les classements, les entraînements et les finances des équipes de la saison de test seront remis à zéro.',
    accounts:
      'Votre compte et l’identité de votre équipe seront conservés. La date de sortie officielle n’a pas encore été annoncée.',
  },
  it: {
    title: 'Fase di test — un ultimo azzeramento prima del lancio',
    description:
      'Le registrazioni sono aperte per i test. ProPeloton Manager verrà azzerato ancora una volta prima del lancio ufficiale. Progressi, risultati delle gare, classifiche, allenamenti e finanze delle squadre della stagione di prova verranno azzerati.',
    accounts:
      'Il tuo account e l’identità della squadra resteranno. La data di lancio ufficiale non è ancora stata annunciata.',
  },
  ru: {
    title: 'Тестовый период — ещё один сброс перед выпуском',
    description:
      'Регистрация открыта для тестирования. Перед официальным выпуском ProPeloton Manager будет сброшен ещё раз. Прогресс тестового сезона, результаты гонок, рейтинги, тренировки и финансы команд будут обнулены.',
    accounts:
      'Ваша учётная запись и название команды сохранятся. Дата официального выпуска пока не объявлена.',
  },
}

export default function PreReleaseNotice({
  variant = 'light',
}: {
  variant?: 'light' | 'dark'
}): JSX.Element {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
  const key = language.startsWith('sr')
    ? 'sr-latn'
    : language.split('-')[0]
  const copy = COPY[key] || COPY.en
  const dark = variant === 'dark'

  return (
    <aside
      role="note"
      aria-label={copy.title}
      className={
        dark
          ? 'rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm leading-6 text-yellow-50'
          : 'rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950'
      }
      data-testid="pre-release-reset-notice"
    >
      <p className="font-bold">{copy.title}</p>
      <p className="mt-1">{copy.description}</p>
      <p className="mt-1 font-medium">{copy.accounts}</p>
    </aside>
  )
}
