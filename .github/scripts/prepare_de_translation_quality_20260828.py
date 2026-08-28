from pathlib import Path

path = Path('.github/scripts/localize_full_de_20260828.py')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        if new in text:
            return
        raise SystemExit(f'Missing German generator patch anchor ({label}): {old[:120]!r}')
    text = text.replace(old, new, 1)


replace_once(
    "MODEL_NAME = 'Helsinki-NLP/opus-mt-en-de'",
    "MODEL_NAME = 'facebook/nllb-200-distilled-600M'",
    'NLLB German model',
)
replace_once('BATCH_SIZE = 48', 'BATCH_SIZE = 12', 'NLLB batch size')

if 'POLISHED_FILES = {' not in text:
    replace_once(
        'BATCH_SIZE = 12\n',
        "BATCH_SIZE = 12\n\nPOLISHED_FILES = {\n"
        "    'common.json',\n"
        "    'auth.json',\n"
        "    'calendarPage.json',\n"
        "    'navigation.json',\n"
        "    'home.json',\n"
        "    'overview.json',\n"
        "    'squad.json',\n"
        "    'developingTeam.json',\n"
        "    'racePreparation.json',\n"
        "    'raceDetail.json',\n"
        "    'training.json',\n"
        "    'equipment.json',\n"
        "    'infrastructure.json',\n"
        "}\n",
        'polished file protection',
    )

replace_once(
    "    'Next': 'Nächste',\n}",
    "    'Next': 'Nächste',\n"
    "    'Coins': 'Coins',\n"
    "    'Season': 'Saison',\n"
    "    'Seasons': 'Saisons',\n"
    "    'Training Camp': 'Trainingslager',\n"
    "    'Training Camps': 'Trainingslager',\n"
    "    'Race Calendar': 'Rennkalender',\n"
    "    'Race Schedule': 'Rennplan',\n"
    "    'Stage Race': 'Etappenrennen',\n"
    "    'Stage race': 'Etappenrennen',\n"
    "    'One Day': 'Eintagesrennen',\n"
    "    'One-day race': 'Eintagesrennen',\n"
    "    'Country': 'Land',\n"
    "    'Countries': 'Länder',\n"
    "    'Manager': 'Manager',\n"
    "    'Club': 'Club',\n"
    "    'Application': 'Bewerbung',\n"
    "    'Applications': 'Bewerbungen',\n"
    "    'Notification': 'Benachrichtigung',\n"
    "    'Notifications': 'Benachrichtigungen',\n"
    "    'Scouting Office': 'Scouting-Büro',\n"
    "    'Scout': 'Scout',\n"
    "    'Scouts': 'Scouts',\n"
    "    'Training Center': 'Trainingszentrum',\n"
    "    'Medical Center': 'Medizinisches Zentrum',\n"
    "    'Youth Academy': 'Nachwuchsakademie',\n"
    "    'Mechanics Workshop': 'Mechanikerwerkstatt',\n"
    "    'Head Coach': 'Cheftrainer',\n"
    "    'Sport Director': 'Sportdirektor',\n"
    "    'Team Doctor': 'Teamarzt',\n"
    "    'Mechanic': 'Mechaniker',\n"
    "    'Nutritionist': 'Ernährungsberater',\n"
    "    'January': 'Januar',\n"
    "    'February': 'Februar',\n"
    "    'March': 'März',\n"
    "    'April': 'April',\n"
    "    'May': 'Mai',\n"
    "    'June': 'Juni',\n"
    "    'July': 'Juli',\n"
    "    'August': 'August',\n"
    "    'September': 'September',\n"
    "    'October': 'Oktober',\n"
    "    'November': 'November',\n"
    "    'December': 'Dezember',\n"
    "    'Monday': 'Montag',\n"
    "    'Tuesday': 'Dienstag',\n"
    "    'Wednesday': 'Mittwoch',\n"
    "    'Thursday': 'Donnerstag',\n"
    "    'Friday': 'Freitag',\n"
    "    'Saturday': 'Samstag',\n"
    "    'Sunday': 'Sonntag',\n"
    "    'Main club update failed.': 'Aktualisierung des Hauptclubs fehlgeschlagen.',\n"
    "    'Needs attention': 'Aufmerksamkeit erforderlich',\n"
    "    '🏁 Mountain finish': '🏁 Bergankunft',\n"
    "    '{{age}} yrs': '{{age}} J.',\n"
    "    'Could not load scout task.': 'Scout-Aufgabe konnte nicht geladen werden.',\n"
    "    '{{count}} pts': '{{count}} Pkt.',\n"
    "    'Using team defaults': 'Team-Standardwerte werden verwendet',\n"
    "    '© ProPeloton Manager. All rights reserved by Next Quest Studio.': '© ProPeloton Manager. Alle Rechte vorbehalten – Next Quest Studio.',\n"
    "    'Startlist, logistics and stage plans': 'Startlist, Logistik und Stage Plans',\n"
    "}",
    'German exact overrides',
)

replace_once(
    "def postprocess(value: str) -> str:\n    # Cycling-specific corrections for common generic MT choices.\n",
    "def postprocess(value: str) -> str:\n"
    "    # Repair occasional mojibake emitted by translation models.\n"
    "    for broken, fixed in (('Ã¤','ä'),('Ã¶','ö'),('Ã¼','ü'),('ÃŸ','ß'),('Ã„','Ä'),('Ã–','Ö'),('Ãœ','Ü')):\n"
    "        value = value.replace(broken, fixed)\n"
    "    # Cycling-specific corrections for common generic MT choices.\n",
    'mojibake repair',
)

replace_once(
    "    for pattern, replacement in replacements:\n        value = re.sub(pattern, replacement, value)",
    "    replacements.extend([\n"
    "        (r'\\bJahreszeiten\\b', 'Saisons'),\n"
    "        (r'\\bJahreszeit\\b', 'Saison'),\n"
    "        (r'\\bSchulungslager\\b', 'Trainingslager'),\n"
    "        (r'\\bTrainingscamp\\b', 'Trainingslager'),\n"
    "        (r'\\bPfadfindern\\b', 'Scouts'),\n"
    "        (r'\\bPfadfinder\\b', 'Scout'),\n"
    "        (r'\\bRassen\\b', 'Rennen'),\n"
    "        (r'\\bRasse\\b', 'Rennen'),\n"
    "        (r'\\bBewerberteam\\b', 'bewerbendes Team'),\n"
    "    ])\n"
    "    for pattern, replacement in replacements:\n        value = re.sub(pattern, replacement, value)",
    'German semantic postprocessing',
)

replace_once(
    "        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)\n"
    "        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)\n"
    "        self.model.eval()",
    "        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, src_lang='eng_Latn')\n"
    "        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)\n"
    "        self.target_lang_id = self.tokenizer.convert_tokens_to_ids('deu_Latn')\n"
    "        if self.target_lang_id is None or self.target_lang_id == self.tokenizer.unk_token_id:\n"
    "            raise SystemExit('Could not resolve NLLB German language token deu_Latn')\n"
    "        self.model.eval()",
    'NLLB tokenizer setup',
)

replace_once(
    "                    max_new_tokens=512,\n                    num_beams=1,",
    "                    max_new_tokens=256,\n"
    "                    forced_bos_token_id=self.target_lang_id,\n"
    "                    num_beams=1,",
    'NLLB target language generation',
)

replace_once(
    "        for phrase in PROTECTED_PHRASES:\n"
    "            if phrase in source and phrase not in target:\n"
    "                problems.append(f'{path}: protected term lost: {phrase}')",
    "        for phrase in PROTECTED_PHRASES:\n"
    "            phrase_pattern = rf'(?<!\\w){re.escape(phrase)}(?!\\w)'\n"
    "            if re.search(phrase_pattern, source) and not re.search(phrase_pattern, target):\n"
    "                problems.append(f'{path}: protected term lost: {phrase}')",
    'protected phrase boundaries',
)

replace_once(
    "                if re.search(r'\\b(?:Reiter|Reitern|Reiters|Bühne|Bühnen)\\b', dst):\n"
    "                    problems.append(f'{name}:{path}: non-cycling MT terminology in {dst!r}')",
    "                if re.search(r'\\b(?:Reiter|Reitern|Reiters|Bühne|Bühnen)\\b', dst):\n"
    "                    problems.append(f'{name}:{path}: non-cycling MT terminology in {dst!r}')\n"
    "                if re.search(r'\\b(?:Jahreszeit|Jahreszeiten|Schulungslager|Pfadfinder|Pfadfindern|Rasse|Rassen)\\b', dst):\n"
    "                    problems.append(f'{name}:{path}: bad German game terminology in {dst!r}')\n"
    "                if re.search(r'\\bstages?\\b', src, flags=re.IGNORECASE) and re.search(r'\\bStufe(?:n)?\\b', dst):\n"
    "                    problems.append(f'{name}:{path}: stage translated as Stufe in {dst!r}')",
    'semantic validation',
)

replace_once(
    "    sources = {path.name: load_json(path) for path in en_paths}\n    translator = Translator()",
    "    sources = {path.name: load_json(path) for path in en_paths}\n"
    "    translation_sources = {name: data for name, data in sources.items() if name not in POLISHED_FILES}\n"
    "    translator = Translator()",
    'translation source split',
)
replace_once(
    "    for data in sources.values():\n        for value in iter_strings(data):",
    "    for data in translation_sources.values():\n        for value in iter_strings(data):",
    'skip polished chunks',
)
replace_once(
    "    DE_DIR.mkdir(parents=True, exist_ok=True)\n"
    "    for old in DE_DIR.glob('*.json'):\n"
    "        old.unlink()\n\n"
    "    for name, source in sources.items():\n"
    "        translated = translate_value(source, translator)\n"
    "        save_json(DE_DIR / name, translated)\n"
    "        print('Wrote', name)",
    "    DE_DIR.mkdir(parents=True, exist_ok=True)\n"
    "    for old in DE_DIR.glob('*.json'):\n"
    "        if old.name not in sources:\n"
    "            old.unlink()\n\n"
    "    for name, source in sources.items():\n"
    "        if name in POLISHED_FILES:\n"
    "            if not (DE_DIR / name).exists():\n"
    "                raise SystemExit(f'Polished German resource missing: {name}')\n"
    "            print('Preserved polished', name)\n"
    "            continue\n"
    "        translated = translate_value(source, translator)\n"
    "        save_json(DE_DIR / name, translated)\n"
    "        print('Wrote', name)",
    'preserve polished files',
)

path.write_text(text, encoding='utf-8')
print(f'Prepared NLLB German translation pass; preserved {len(POLISHED_FILES) if "POLISHED_FILES" in globals() else 13} polished resources.')
