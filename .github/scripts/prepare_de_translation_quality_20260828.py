from pathlib import Path

path = Path('.github/scripts/localize_full_de_20260828.py')
text = path.read_text(encoding='utf-8')

replacements = [
    ("BATCH_SIZE = 48", "BATCH_SIZE = 72"),
    (
        "    'Next': 'Nächste',\n}",
        "    'Next': 'Nächste',\n"
        "    'Coins': 'Coins',\n"
        "    'Coins, Coin Packages and Referral Rewards': 'Coins, Coin-Pakete und Empfehlungsprämien',\n"
        "    \"Today's races\": 'Heutige Rennen',\n"
        "    \"Today's races help users see what is happening now.\": "
        "'Die heutigen Rennen helfen den Nutzern zu sehen, was gerade passiert.',\n"
        "    \"Final GC, points, mountain and youth-classification honours will be added after their authoritative persisted result source is confirmed.\": "
        "'Finale GC-, Punkte-, Berg- und Nachwuchswertungen werden ergänzt, sobald ihre maßgebliche dauerhaft gespeicherte Ergebnisquelle bestätigt wurde.',\n"
        "    \"The game is still being tested and improved. If you would like to become a test player and help us test ProPeloton Manager, please contact us first in our Discord server. We will provide the next steps there.\": "
        "'Das Spiel wird weiterhin getestet und verbessert. Wenn du Testspieler werden und uns beim Testen von ProPeloton Manager helfen möchtest, kontaktiere uns bitte zuerst auf unserem Discord-Server. Dort erhältst du die nächsten Schritte.',\n"
        "    '© ProPeloton Manager. All rights reserved by Next Quest Studio.': "
        "'© ProPeloton Manager. Alle Rechte vorbehalten – Next Quest Studio.',\n"
        "    'Startlist, logistics and stage plans': 'Startlist, Logistik und Stage Plans',\n"
        "    \"We use technical and organizational measures to protect account, game, Premium, and transaction data. No online service can guarantee perfect security, but we work to keep the game reliable and safe.\": "
        "'Wir setzen technische und organisatorische Maßnahmen ein, um Konto-, Spiel-, Premium- und Transaktionsdaten zu schützen. Kein Onlinedienst kann vollständige Sicherheit garantieren, aber wir arbeiten daran, das Spiel zuverlässig und sicher zu halten.',\n}"
    ),
    (
        "def postprocess(value: str) -> str:\n    # Cycling-specific corrections for common generic MT choices.\n",
        "def postprocess(value: str) -> str:\n"
        "    # Repair occasional mojibake emitted by legacy Marian training data.\n"
        "    for broken, fixed in (('Ã¤','ä'),('Ã¶','ö'),('Ã¼','ü'),('ÃŸ','ß'),('Ã„','Ä'),('Ã–','Ö'),('Ãœ','Ü')):\n"
        "        value = value.replace(broken, fixed)\n"
        "    # Cycling-specific corrections for common generic MT choices.\n"
    ),
    (
        "                    max_new_tokens=512,\n                    num_beams=1,",
        "                    max_length=512,\n                    num_beams=1,"
    ),
    (
        "        for phrase in PROTECTED_PHRASES:\n"
        "            if phrase in source and phrase not in target:\n"
        "                problems.append(f'{path}: protected term lost: {phrase}')",
        "        for phrase in PROTECTED_PHRASES:\n"
        "            phrase_pattern = rf'(?<!\\w){re.escape(phrase)}(?!\\w)'\n"
        "            if re.search(phrase_pattern, source) and not re.search(phrase_pattern, target):\n"
        "                problems.append(f'{path}: protected term lost: {phrase}')"
    ),
]

for old, new in replacements:
    if old not in text:
        if new in text:
            continue
        raise SystemExit(f'Missing German generator patch anchor: {old[:80]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Prepared German translator quality fixes.')
