from pathlib import Path

path = Path('.github/scripts/localize_full_de_20260828.py')
text = path.read_text(encoding='utf-8')

replacements = [
    ("BATCH_SIZE = 48", "BATCH_SIZE = 72"),
    (
        "    'Next': 'Nächste',\n}",
        "    'Next': 'Nächste',\n"
        "    \"Today's races\": 'Heutige Rennen',\n"
        "    \"Today's races help users see what is happening now.\": "
        "'Die heutigen Rennen helfen den Nutzern zu sehen, was gerade passiert.',\n}"
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
