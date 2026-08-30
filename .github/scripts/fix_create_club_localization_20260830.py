from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / 'src/pages/CreateClub.tsx'
LOCALES = ROOT / 'src/i18n/locales'

SR = {
  "page": {
    "title": "Kreirajte svoj tim",
    "subtitle": "Osmislite identitet svog tima i zakoračite u ProPeloton svet.",
    "teamName": "Naziv tima",
    "teamNamePlaceholder": "npr. Horizon Racing",
    "teamCountry": "Država tima",
    "countryFlag": "Zastava države",
    "noCountries": "Nema dostupnih država",
    "loadingCountries": "Učitavanje država...",
    "primaryColor": "Primarna boja",
    "secondaryColor": "Sekundarna boja",
    "motto": "Moto tima (opciono)",
    "mottoPlaceholder": "npr. Zajedno do cilja",
    "cancel": "Otkaži",
    "creating": "Kreiranje tima...",
    "createTeam": "Kreiraj tim",
    "chooseJerseyFirst": "Prvo izaberite dres tima",
    "backgroundAlt": "Biciklistička pozadina"
  },
  "jersey": {
    "title": "Dres tima",
    "description": "Izaberite jedan dres da biste mogli da kreirate tim. Kasnije ga možete promeniti u opciji Prilagodi tim.",
    "scrollLeft": "Pomeri dresove ulevo",
    "scrollRight": "Pomeri dresove udesno",
    "select": "Izaberi standardni dres {{index}}",
    "alt": "Standardni dres tima {{index}}",
    "required": "Morate izabrati dres pre nego što kreirate tim."
  },
  "preview": {
    "title": "Pregled tima",
    "description": "Dizajn i boje ažuriraju se uživo.",
    "customLogoAlt": "Pregled prilagođenog logotipa tima",
    "defaultTeam": "Moj tim",
    "logoSize": "Veličina logotipa",
    "smaller": "Manje",
    "larger": "Veće"
  },
  "patterns": {
    "title": "Dizajn grba",
    "description": "Izaberite kako će primarna i sekundarna boja biti raspoređene na grbu.",
    "customDescription": "Dizajn grba primenjuje se samo na automatski generisani grb tima.",
    "select": "Izaberi šaru {{pattern}}",
    "solid": "Jednobojno",
    "band": "Poprečna traka",
    "doubleBand": "Dupla poprečna traka",
    "verticalSplit": "Vertikalna podela",
    "horizontalSplit": "Horizontalna podela",
    "diagonalSash": "Dijagonalna traka",
    "diagonalSplit": "Dijagonalna podela",
    "verticalStripes": "Vertikalne pruge",
    "horizontalStripes": "Horizontalne pruge",
    "chevron": "Ševron",
    "centerStripe": "Centralna pruga",
    "quartered": "Podeljeno na četvrtine"
  },
  "logo": {
    "title": "Logo tima",
    "description": "Opciono. Otpremite logo ili unesite URL slike. Ako ništa ne izaberete, koristiće se automatski generisani grb iznad.",
    "useGenerated": "Koristi generisani grb",
    "fileHelp": "PNG, JPEG/JPG ili BMP · maksimalno 2 MB.",
    "orUrl": "ili koristite URL slike",
    "urlPlaceholder": "https://example.com/team-logo.png",
    "applying": "Primena...",
    "apply": "Primeni",
    "uploaded": "Izabran je otpremljeni logo: {{name}}",
    "urlApplied": "Logo sa URL-a je primenjen."
  },
  "errors": {
    "invalidType": "Logo mora biti PNG, JPEG/JPG ili BMP slika.",
    "tooLarge": "Fajl logotipa mora biti veličine 2 MB ili manji.",
    "pasteUrl": "Prvo unesite URL logotipa.",
    "invalidUrl": "Unesite ispravan URL logotipa.",
    "httpUrl": "URL logotipa mora počinjati sa http:// ili https://.",
    "loadUrl": "Logo nije moguće učitati sa ovog URL-a.",
    "countries": "Učitavanje država nije uspelo",
    "nameRequired": "Naziv tima je obavezan",
    "countryRequired": "Država tima je obavezna",
    "jerseyRequired": "Izaberite dres tima pre kreiranja tima.",
    "signIn": "Morate biti prijavljeni da biste kreirali tim.",
    "bucketMissing": "Storage bucket \"club-logos\" nije pronađen. Prvo ga kreirajte u Supabase Storage-u.",
    "uploadLogo": "Otpremanje logotipa tima nije uspelo",
    "saveBadge": "Čuvanje grba tima nije uspelo",
    "create": "Kreiranje tima nije uspelo",
    "unexpected": "Došlo je do neočekivane greške"
  }
}

DE = {
  "page": {
    "title": "Erstellen Sie Ihr Team",
    "subtitle": "Gestalten Sie die Identität Ihres Teams und betreten Sie die ProPeloton-Welt.",
    "teamName": "Teamname",
    "teamNamePlaceholder": "z. B. Horizon Racing",
    "teamCountry": "Land des Teams",
    "countryFlag": "Landesflagge",
    "noCountries": "Keine Länder verfügbar",
    "loadingCountries": "Länder werden geladen...",
    "primaryColor": "Primärfarbe",
    "secondaryColor": "Sekundärfarbe",
    "motto": "Teammotto (optional)",
    "mottoPlaceholder": "z. B. Gemeinsam zum Ziel",
    "cancel": "Abbrechen",
    "creating": "Team wird erstellt...",
    "createTeam": "Team erstellen",
    "chooseJerseyFirst": "Wählen Sie zuerst ein Teamtrikot aus",
    "backgroundAlt": "Radsport-Hintergrund"
  },
  "jersey": {
    "title": "Teamtrikot",
    "description": "Wählen Sie ein Trikot aus, um die Teamerstellung freizuschalten. Sie können es später unter „Team anpassen“ ändern.",
    "scrollLeft": "Trikots nach links scrollen",
    "scrollRight": "Trikots nach rechts scrollen",
    "select": "Standardtrikot {{index}} auswählen",
    "alt": "Standard-Teamtrikot {{index}}",
    "required": "Sie müssen ein Trikot auswählen, bevor Sie Ihr Team erstellen können."
  },
  "preview": {
    "title": "Teamvorschau",
    "description": "Design und Farben werden in Echtzeit aktualisiert.",
    "customLogoAlt": "Vorschau des eigenen Teamlogos",
    "defaultTeam": "Mein Team",
    "logoSize": "Logogröße",
    "smaller": "Kleiner",
    "larger": "Größer"
  },
  "patterns": {
    "title": "Wappenmuster",
    "description": "Wählen Sie aus, wie Primär- und Sekundärfarbe im Wappen aufgeteilt werden.",
    "customDescription": "Das Wappenmuster gilt nur für das automatisch erzeugte Teamwappen.",
    "select": "Muster {{pattern}} auswählen",
    "solid": "Einfarbig",
    "band": "Querbalken",
    "doubleBand": "Doppelter Querbalken",
    "verticalSplit": "Vertikale Teilung",
    "horizontalSplit": "Horizontale Teilung",
    "diagonalSash": "Diagonaler Balken",
    "diagonalSplit": "Diagonale Teilung",
    "verticalStripes": "Vertikale Streifen",
    "horizontalStripes": "Horizontale Streifen",
    "chevron": "Chevron",
    "centerStripe": "Mittelstreifen",
    "quartered": "Geviertelt"
  },
  "logo": {
    "title": "Teamlogo",
    "description": "Optional. Laden Sie ein Logo hoch oder verwenden Sie eine Bild-URL. Wenn Sie nichts auswählen, wird das automatisch erzeugte Teamwappen oben verwendet.",
    "useGenerated": "Erzeugtes Wappen verwenden",
    "fileHelp": "PNG, JPEG/JPG oder BMP · maximal 2 MB.",
    "orUrl": "oder Bild-URL verwenden",
    "urlPlaceholder": "https://example.com/team-logo.png",
    "applying": "Wird angewendet...",
    "apply": "Anwenden",
    "uploaded": "Hochgeladenes Logo ausgewählt: {{name}}",
    "urlApplied": "Logo aus der URL wurde übernommen."
  },
  "errors": {
    "invalidType": "Das Logo muss eine PNG-, JPEG/JPG- oder BMP-Datei sein.",
    "tooLarge": "Die Logo-Datei darf höchstens 2 MB groß sein.",
    "pasteUrl": "Geben Sie zuerst eine Logo-URL ein.",
    "invalidUrl": "Bitte geben Sie eine gültige Logo-URL ein.",
    "httpUrl": "Die Logo-URL muss mit http:// oder https:// beginnen.",
    "loadUrl": "Das Logo konnte von dieser URL nicht geladen werden.",
    "countries": "Die Länder konnten nicht geladen werden",
    "nameRequired": "Der Teamname ist erforderlich",
    "countryRequired": "Das Land des Teams ist erforderlich",
    "jerseyRequired": "Wählen Sie ein Teamtrikot aus, bevor Sie Ihr Team erstellen.",
    "signIn": "Sie müssen angemeldet sein, um ein Team zu erstellen.",
    "bucketMissing": "Der Storage-Bucket \"club-logos\" wurde nicht gefunden. Erstellen Sie ihn zuerst in Supabase Storage.",
    "uploadLogo": "Das Teamlogo konnte nicht hochgeladen werden",
    "saveBadge": "Das Teamwappen konnte nicht gespeichert werden",
    "create": "Das Team konnte nicht erstellt werden",
    "unexpected": "Ein unerwarteter Fehler ist aufgetreten"
  }
}


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


write_json(LOCALES / 'sr-Latn/createClub.json', SR)
write_json(LOCALES / 'de/createClub.json', DE)

text = PAGE.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        if new in text:
            return
        raise SystemExit(f'Missing CreateClub patch anchor: {label}')
    text = text.replace(old, new, 1)


replace_once(
    "import { applyPendingReferral, getPendingReferralCode } from '../lib/referrals'\n",
    "import { applyPendingReferral, getPendingReferralCode } from '../lib/referrals'\nimport LanguageSelector from '../components/i18n/LanguageSelector'\n",
    'LanguageSelector import',
)

replace_once(
    "export default function CreateClubPage(): JSX.Element {\n  const { t } = useTranslation('createClub')\n",
    "export default function CreateClubPage(): JSX.Element {\n  const { t, i18n } = useTranslation('createClub')\n",
    'page i18n access',
)

replace_once(
    "  const flagUrl = form.countryCode ? `https://flagcdn.com/w40/${form.countryCode.toLowerCase()}.png` : ''\n\n  return (\n",
    "  const flagUrl = form.countryCode ? `https://flagcdn.com/w40/${form.countryCode.toLowerCase()}.png` : ''\n"
    "  const countryDisplayNames = React.useMemo(() => {\n"
    "    const language = i18n.resolvedLanguage ?? i18n.language\n"
    "    const locale = language.startsWith('sr')\n"
    "      ? 'sr-Latn-RS'\n"
    "      : language.startsWith('de')\n"
    "        ? 'de-DE'\n"
    "        : 'en-GB'\n\n"
    "    try {\n"
    "      return new Intl.DisplayNames([locale], { type: 'region' })\n"
    "    } catch {\n"
    "      return null\n"
    "    }\n"
    "  }, [i18n.language, i18n.resolvedLanguage])\n\n"
    "  return (\n",
    'localized country display names',
)

replace_once(
    "                              {c.name}\n",
    "                              {countryDisplayNames?.of(c.code.toUpperCase()) || c.name}\n",
    'country option localization',
)

replace_once(
    "          alt=\"background\"\n",
    "          alt={t('page.backgroundAlt')}\n",
    'background alt localization',
)

replace_once(
    "      <div className=\"relative z-10 max-w-7xl w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6 lg:p-8 space-y-6\">\n        <div className=\"rounded-xl border-2 border-emerald-400 bg-white/95 overflow-hidden\">\n",
    "      <div className=\"relative z-10 max-w-7xl w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6 lg:p-8 space-y-4\">\n"
    "        <div className=\"flex justify-end\">\n"
    "          <LanguageSelector\n"
    "            compact\n"
    "            className=\"rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm\"\n"
    "            selectClassName=\"border-0 bg-transparent text-slate-800 shadow-none focus:ring-1\"\n"
    "          />\n"
    "        </div>\n"
    "        <div className=\"rounded-xl border-2 border-emerald-400 bg-white/95 overflow-hidden\">\n",
    'visible language selector',
)

# Do not expose raw English implementation/backend error text in the localized UI.
replace_once(
    "      setError(err?.message ?? t('errors.unexpected'))\n",
    "      console.error('Create team failed', err)\n      setError(t('errors.unexpected'))\n",
    'localized fallback error',
)

PAGE.write_text(text, encoding='utf-8')
print('Create Club localization patched for Serbian and German with locale-aware country names.')
