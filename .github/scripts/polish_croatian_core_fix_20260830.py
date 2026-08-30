from __future__ import annotations

import json
from pathlib import Path

path = Path('src/i18n/locales/hr/appShell.json')
data = json.loads(path.read_text(encoding='utf-8'))
data['restartWelcome']['body2'] = (
    'Ime kluba, logo, dres, država i mjesto u natjecanju ostaju zadržani. '
    'Stari vozači postali su slobodni igrači, a klub je spreman za novi početak.'
)
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Refined Croatian restart welcome wording.')
