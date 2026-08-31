from __future__ import annotations

import shutil
from pathlib import Path

import add_russian_localization_20260831 as base

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.russian-merged'


def main() -> None:
    en_files = sorted(base.EN_DIR.glob('*.json'))
    generated_files = sorted(SOURCE.glob('*.json'))

    en_names = [path.name for path in en_files]
    generated_names = [path.name for path in generated_files]
    if en_names != generated_names:
        missing = sorted(set(en_names) - set(generated_names))
        extra = sorted(set(generated_names) - set(en_names))
        raise RuntimeError(f'Russian shard merge mismatch. Missing={missing}; extra={extra}')

    base.RU_DIR.mkdir(parents=True, exist_ok=True)
    for old in base.RU_DIR.glob('*.json'):
        old.unlink()

    for source in generated_files:
        target = base.RU_DIR / source.name
        shutil.copy2(source, target)
        base.validate_shape(base.load_json(base.EN_DIR / source.name), base.load_json(target), source.name)

    # Russian metadata/index wiring is already present on main. Re-validate the
    # shared wiring here without rewriting the full resource block.
    base.validate_wiring()

    ru_names = [path.name for path in sorted(base.RU_DIR.glob('*.json'))]
    if en_names != ru_names:
        raise RuntimeError('Assembled Russian locale filenames do not mirror English exactly')

    print(f'Assembled and validated Russian locale package: {len(ru_names)} files')


if __name__ == '__main__':
    main()
