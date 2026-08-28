from pathlib import Path

path = Path('.github/scripts/localize_full_manual_sr_latn_20260828.py')
text = path.read_text(encoding='utf-8')

replacements = [
    ('BATCH_SIZE = 12', 'BATCH_SIZE = 24'),
    ('num_beams=3', 'num_beams=1'),
    ('                candidate = self.memory[source]\n', '                candidate = postprocess(self.memory[source])\n'),
    ("    for bad_word in ('jahač', 'rasni svet', 'zxq', 'zik'):\n", "    for bad_word in ('jahač', 'rasni svet', 'zxq'):\n"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Missing translator anchor: {old}')
    text = text.replace(old, new, 1)

glossary_anchor = 'CODE_PATTERNS = ['
glossary_extra = "\n".join([
    'GLOSSARY.update({',
    "    'First Squad': 'Prvi tim',",
    "    'Developing Team': 'Razvojni tim',",
    "    'Form & Development': 'Forma i razvoj',",
    "    'Sport Director': 'Sportski direktor',",
    "    'Team Doctor': 'Doktor tima',",
    "    'Physio': 'Fizioterapeut',",
    "    'Nutritionist': 'Nutricionista',",
    "    'Mechanic': 'Mehaničar',",
    "    'Scout / Analyst': 'Skaut / Analitičar',",
    "    'U23 Head Coach': 'U23 Glavni trener',",
    "    'Head Coach': 'Glavni trener',",
    "    'Training Center': 'Trening centar',",
    "    'Medical Center': 'Medicinski centar',",
    "    'Mechanics Workshop': 'Mehaničarska radionica',",
    "    'Scouting Office': 'Skauting kancelarija',",
    "    'Time Trial': 'Hronometar',",
    "    'Race IQ': 'Race IQ',",
    "    'Overall': 'Overall',",
    '})',
    '',
    '',
])
if glossary_anchor not in text:
    raise SystemExit('Missing glossary anchor')
text = text.replace(glossary_anchor, glossary_extra + glossary_anchor, 1)

memory_anchor = '    memory = build_translation_memory()\n'
memory_extra = "\n".join([
    '    memory = build_translation_memory()',
    '    memory.update({',
    "        'Inbox': 'Sanduče',",
    "        'Footer': 'Podnožje',",
    "        'Referral URL': 'URL preporuke',",
    "        'Display names': 'Nazivi za prikaz',",
    "        'Forum': 'Forum',",
    "        'Plan': 'Plan',",
    '    })',
    '',
])
if memory_anchor not in text:
    raise SystemExit('Missing translation memory anchor')
text = text.replace(memory_anchor, memory_extra, 1)

validation_anchor = "    if len(english_fallbacks) > 3:\n        problems.extend(f'English fallback: {item}' for item in english_fallbacks[:20])"
validation_extra = "\n".join([
    '    allowed_technical = (',
    "        'JPG, PNG, WEBP', 'create-coin-checkout Edge Function',",
    "        'WorldTeam, ProTeam, Continental, Amateur', 'ProTeam West, ProTeam East',",
    "        'Forum', 'Plan', '/#/referral/:code', '/dashboard/teams/:clubId',",
    "        'coin_packages', 'get_my_coin_status', 'create-coin-checkout',",
    '        "user_coin_ledger reason=\'purchase\'", \'club-logos\', \'club_branding_lock_status_v1\',',
    '    )',
    '    english_fallbacks = [',
    '        item for item in english_fallbacks',
    '        if not any(item.endswith(marker) for marker in allowed_technical)',
    '    ]',
    '    if len(english_fallbacks) > 3:',
    "        problems.extend(f'English fallback: {item}' for item in english_fallbacks[:20])",
])
if validation_anchor not in text:
    raise SystemExit('Missing English fallback validation anchor')
text = text.replace(validation_anchor, validation_extra, 1)

path.write_text(text, encoding='utf-8')
print('Prepared NLLB srp_Cyrl -> Serbian Latin manual translator.')
