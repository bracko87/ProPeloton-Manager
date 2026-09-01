#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / 'src/pages/dashboard/RacePreparation.tsx'


def main() -> None:
    src = COMPONENT.read_text(encoding='utf-8')

    # The initial fixer handled quote errors/warnings when they were followed by a
    # newline. Cover every remaining JSX rendering occurrence so backend English
    # validation text cannot bypass the locale mapper.
    src = re.sub(
        r'(?<!localizeRacePrepBackendText\()\{error\}',
        '{localizeRacePrepBackendText(error)}',
        src,
    )
    src = re.sub(
        r'(?<!localizeRacePrepBackendText\()\{warning\}',
        '{localizeRacePrepBackendText(warning)}',
        src,
    )

    COMPONENT.write_text(src, encoding='utf-8')
    print('Race Preparation localization polish applied.')


if __name__ == '__main__':
    main()
