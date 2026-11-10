import React from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

const policy = {
  en: {
    eyebrow: 'Legal information',
    title: 'Refund & Cancellation Policy',
    updated: 'Last updated: 10 November 2026',
    intro: 'This policy covers paid Premium memberships and purchased Coins in ProPeloton Manager. Mandatory consumer rights are never excluded.',
    sections: [
      {
        title: '1. Premium memberships',
        paragraphs: [
          'Premium is an optional paid subscription with monthly, three-month and yearly billing plans, where offered. The selected price, billing period, coin distribution, renewal terms and current access end date are shown in checkout and your membership details. Premium becomes available after successful payment confirmation.',
          'If your subscription renews automatically, you can cancel future renewals using Manage subscription. Cancelling renewal normally keeps Premium active until the end of the paid period. It does not automatically refund time already paid for. Your normal free game account continues after Premium expires.',
        ],
      },
      {
        title: '2. Purchased Coins',
        paragraphs: [
          'Paid coin packages are optional one-time purchases. Coins are credited to your game account after a confirmed purchase and are intended for eligible in-game features. Unused Coins have no scheduled expiration during normal account use and normally remain available even if you cancel Premium.',
          'Coins cannot normally be redeemed for cash, sold or transferred outside the game. Spending Coins on an in-game feature is generally irreversible. Coins linked to a refunded, reversed or fraudulent payment may be corrected, without limiting your statutory rights.',
        ],
      },
      {
        title: '3. Our general refund policy',
        paragraphs: [
          'We generally do not offer voluntary refunds for properly delivered and activated Premium access or Coins correctly credited to your account, for example when you change your mind, stop playing or leave purchased benefits unused.',
          'This is not an absolute ban on refunds. It does not take away any mandatory rights concerning withdrawal, missing or defective digital products, unauthorized charges, incorrect billing or other remedies required by applicable law.',
        ],
      },
      {
        title: '4. Statutory withdrawal rights',
        paragraphs: [
          'Consumers may have a statutory 14-day withdrawal right for online purchases. For certain digital content supplied immediately without a physical medium, that right may end once delivery begins only when all legal conditions have been met, including your prior express consent, acknowledgment and the required contract confirmation.',
          'An ongoing Premium subscription may be treated differently from a one-time digital-content purchase. Immediate access by itself does not automatically remove your withdrawal rights. We respect the rights that apply to each purchase under applicable law.',
        ],
      },
      {
        title: '5. Missing deliveries, errors and support',
        paragraphs: [
          'If your purchase did not arrive, the Coins are missing, Premium access is faulty or a charge looks incorrect or unauthorized, contact our support team. Include the purchase date, product, receipt or payment reference. Do not send passwords or full card details.',
          'We review billing and delivery problems and provide any correction, repair, restoration, refund or other remedy required by law. Chargebacks and disputes are handled under applicable law and the payment provider rules.',
        ],
      },
    ],
    contact: 'For cancellation, withdrawal or payment questions, contact',
    back: 'Back to Terms of Use',
    store: 'Premium & Coins',
  },
  de: {
    eyebrow: 'Rechtliche Informationen',
    title: 'Erstattungs- und Kündigungsrichtlinie',
    updated: 'Stand: 10. November 2026',
    intro: 'Diese Richtlinie gilt für kostenpflichtige Premium-Mitgliedschaften und gekaufte Coins in ProPeloton Manager. Zwingende Verbraucherrechte bleiben uneingeschränkt bestehen.',
    sections: [
      {
        title: '1. Premium-Mitgliedschaften',
        paragraphs: [
          'Premium ist ein optionales kostenpflichtiges Abonnement mit Monats-, Drei-Monats- und Jahresplänen, soweit angeboten. Preis, Abrechnungszeitraum, Coin-Verteilung, Verlängerungsbedingungen und Zugangsende werden vor dem Kauf und in den Mitgliedschaftsdaten angezeigt. Premium wird nach bestätigter Zahlung freigeschaltet.',
          'Eine automatische Verlängerung kann über „Abonnement verwalten“ für die Zukunft gekündigt werden. Der bereits bezahlte Premium-Zugang bleibt normalerweise bis zum Ende des laufenden Zeitraums aktiv. Die Kündigung führt nicht automatisch zu einer Erstattung des bezahlten Zeitraums. Danach bleibt das normale kostenlose Spielkonto bestehen.',
        ],
      },
      {
        title: '2. Gekaufte Coins',
        paragraphs: [
          'Kostenpflichtige Coin-Pakete sind optionale Einmalkäufe. Nach Zahlungsbestätigung werden Coins dem Spielkonto gutgeschrieben und können für vorgesehene Spielfunktionen verwendet werden. Nicht verbrauchte Coins haben bei normaler Kontonutzung kein festgelegtes Ablaufdatum und bleiben grundsätzlich auch nach einer Premium-Kündigung verfügbar.',
          'Coins können normalerweise nicht gegen Geld eingelöst, außerhalb des Spiels verkauft oder übertragen werden. Eine mit Coins gekaufte Spielfunktion kann normalerweise nicht rückgängig gemacht werden. Coins aus erstatteten, rückgebuchten oder betrügerischen Zahlungen dürfen berichtigt werden, ohne gesetzliche Ansprüche einzuschränken.',
        ],
      },
      {
        title: '3. Unsere allgemeine Erstattungsregel',
        paragraphs: [
          'Für ordnungsgemäß bereitgestellte und freigeschaltete Premium-Leistungen sowie korrekt gutgeschriebene Coins bieten wir grundsätzlich keine freiwillige Rückerstattung an, beispielsweise bei Meinungsänderung, Nichtnutzung oder Aufgabe des Spiels.',
          'Dies ist kein uneingeschränktes Erstattungsverbot. Gesetzlich vorgeschriebene Widerrufsrechte, Ansprüche bei fehlenden oder mangelhaften digitalen Produkten, unberechtigten Abbuchungen, Abrechnungsfehlern und andere zwingende Rechtsbehelfe bleiben bestehen.',
        ],
      },
      {
        title: '4. Gesetzliches Widerrufsrecht',
        paragraphs: [
          'Bei Online-Käufen kann ein gesetzliches Widerrufsrecht von 14 Tagen bestehen. Bei bestimmten sofort bereitgestellten digitalen Inhalten ohne körperlichen Datenträger kann dieses Recht mit Beginn der Bereitstellung erlöschen, wenn alle gesetzlichen Voraussetzungen erfüllt sind, insbesondere vorherige ausdrückliche Zustimmung, Kenntnisbestätigung und die erforderliche Vertragsbestätigung.',
          'Für laufende Premium-Abonnements können andere Regeln gelten als für einmalige digitale Inhalte. Die sofortige Freischaltung allein beseitigt das Widerrufsrecht nicht. Die jeweils anwendbaren gesetzlichen Rechte werden beachtet.',
        ],
      },
      {
        title: '5. Fehlende Leistungen, Fehler und Support',
        paragraphs: [
          'Wenn eine Zahlung nicht gutgeschrieben wurde, Coins fehlen, Premium nicht funktioniert oder eine Abbuchung fehlerhaft beziehungsweise nicht autorisiert erscheint, wende dich mit Kaufdatum, Produkt und Zahlungsbeleg oder Transaktionsreferenz an unseren Support. Bitte keine Passwörter oder vollständigen Kartendaten senden.',
          'Wir prüfen Zahlungs- und Bereitstellungsprobleme und gewähren gesetzlich vorgesehene Berichtigungen, Nachbesserungen, Bereitstellung, Erstattungen oder andere Abhilfen. Rückbuchungen und Streitfälle richten sich nach geltendem Recht und den Regeln des Zahlungsdienstleisters.',
        ],
      },
    ],
    contact: 'Bei Fragen zu Kündigung, Widerruf oder Zahlungen kontaktiere uns unter',
    back: 'Zurück zu den Nutzungsbedingungen',
    store: 'Premium & Coins',
  },
}

export default function RefundPolicyPage(): JSX.Element {
  const { i18n } = useTranslation()
  const copy = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith('de')
    ? policy.de
    : policy.en

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-950 px-6 py-14 text-white md:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-400">{copy.eyebrow}</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-200 md:text-lg">{copy.intro}</p>
        </div>
      </header>

      <div className="px-6 py-12">
        <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-sm text-slate-500">{copy.updated}</p>
          {copy.sections.map(section => (
            <section key={section.title} className="mt-8 space-y-3">
              <h2 className="text-xl font-bold">{section.title}</h2>
              {section.paragraphs.map(paragraph => (
                <p key={paragraph} className="leading-relaxed text-slate-700">{paragraph}</p>
              ))}
            </section>
          ))}

          <section className="mt-8 space-y-3">
            <h2 className="text-xl font-bold">{copy.contact}</h2>
            <p className="text-slate-700">
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-yellow-700 underline">{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <nav aria-label={copy.eyebrow} className="mt-10 flex flex-wrap gap-3">
            <Link to="/terms" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">{copy.back}</Link>
            <Link to="/dashboard/pro" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50">{copy.store}</Link>
          </nav>
        </article>
      </div>
    </main>
  )
}
