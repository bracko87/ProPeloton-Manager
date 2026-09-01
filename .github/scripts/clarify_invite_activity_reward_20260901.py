from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "src" / "i18n" / "locales"

COPY = {
    "en": {
        "v2Subtitle": "Earn a one-time reward of 2 Coins when an invited player becomes genuinely active, plus 40 Coins if that player later buys Premium or their first Coin package.",
        "v2Step3": "Once your friend has been active on 3 separate real days in total, you receive a single one-time reward of 2 Coins.",
        "v2ActivityCompletedDescription": "The player was active on 3 separate real days. A single one-time 2-Coin activity reward was granted.",
    },
    "sr-Latn": {
        "v2Subtitle": "Dobijaš jednokratnu nagradu od 2 Coins kada pozvani igrač postane zaista aktivan, plus 40 Coins ako kasnije kupi Premium ili svoj prvi Coin paket.",
        "v2Step3": "Kada prijatelj zabeleži aktivnost u ukupno 3 različita realna dana, dobijaš jednu jednokratnu nagradu od 2 Coins.",
        "v2ActivityCompletedDescription": "Igrač je zabeležio aktivnost u 3 različita realna dana. Dodeljena je jedna jednokratna nagrada od 2 Coins za aktivnost.",
    },
    "de": {
        "v2Subtitle": "Du erhältst einmalig 2 Coins, sobald ein eingeladener Spieler wirklich aktiv wird, plus 40 Coins, wenn dieser Spieler später Premium oder sein erstes Coin-Paket kauft.",
        "v2Step3": "Sobald dein Freund an insgesamt 3 verschiedenen realen Tagen aktiv war, erhältst du einmalig 2 Coins.",
        "v2ActivityCompletedDescription": "Der Spieler war an 3 verschiedenen realen Tagen aktiv. Die einmalige Aktivitätsbelohnung von 2 Coins wurde gutgeschrieben.",
    },
    "hr": {
        "v2Subtitle": "Dobivaš jednokratnu nagradu od 2 Coins kada pozvani igrač postane stvarno aktivan, plus 40 Coins ako kasnije kupi Premium ili svoj prvi Coin paket.",
        "v2Step3": "Kada prijatelj bude aktivan tijekom ukupno 3 različita stvarna dana, dobivaš jednu jednokratnu nagradu od 2 Coins.",
        "v2ActivityCompletedDescription": "Igrač je bio aktivan tijekom 3 različita stvarna dana. Dodijeljena je jedna jednokratna nagrada od 2 Coins za aktivnost.",
    },
    "es": {
        "v2Subtitle": "Obtienes una recompensa única de 2 Coins cuando un jugador invitado se vuelve realmente activo, además de 40 Coins si después compra Premium o su primer paquete de Coins.",
        "v2Step3": "Cuando tu amigo haya estado activo en un total de 3 días reales distintos, recibes una única recompensa de 2 Coins.",
        "v2ActivityCompletedDescription": "El jugador estuvo activo en 3 días reales distintos. Se concedió una única recompensa de actividad de 2 Coins.",
    },
    "it": {
        "v2Subtitle": "Ricevi una ricompensa una tantum di 2 Coins quando un giocatore invitato diventa realmente attivo, più 40 Coins se in seguito acquista Premium o il suo primo pacchetto di Coins.",
        "v2Step3": "Quando il tuo amico risulta attivo in un totale di 3 giorni reali distinti, ricevi una sola ricompensa una tantum di 2 Coins.",
        "v2ActivityCompletedDescription": "Il giocatore è stato attivo in 3 giorni reali distinti. È stata assegnata una sola ricompensa una tantum di 2 Coins per l'attività.",
    },
    "fr": {
        "v2Subtitle": "Vous recevez une récompense unique de 2 Coins lorsqu’un joueur invité devient réellement actif, plus 40 Coins s’il achète ensuite Premium ou son premier pack de Coins.",
        "v2Step3": "Lorsque votre ami a été actif pendant un total de 3 jours réels distincts, vous recevez une seule récompense de 2 Coins.",
        "v2ActivityCompletedDescription": "Le joueur a été actif pendant 3 jours réels distincts. Une seule récompense d’activité de 2 Coins a été accordée.",
    },
    "ru": {
        "v2Subtitle": "Вы получаете единовременную награду в 2 Coins, когда приглашённый игрок становится действительно активным, а также 40 Coins, если позже он покупает Premium или свой первый пакет Coins.",
        "v2Step3": "Когда ваш друг будет активен в общей сложности в 3 разные реальные дни, вы получите одну единовременную награду в 2 Coins.",
        "v2ActivityCompletedDescription": "Игрок был активен в 3 разные реальные дни. Была начислена одна единовременная награда в 2 Coins за активность.",
    },
}

for locale, updates in COPY.items():
    path = LOCALES / locale / "accountPages.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    invite = data.setdefault("invite", {})
    for key, value in updates.items():
        invite[key] = value
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(f"Updated one-time activity reward wording in {len(COPY)} locales.")
