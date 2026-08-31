from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import add_russian_localization_20260831 as base
from add_russian_localization_v3_20260831 import NllbTranslator


def text_weight(value: Any) -> int:
    if isinstance(value, str):
        return max(1, len(value))
    if isinstance(value, list):
        return sum(text_weight(item) for item in value)
    if isinstance(value, dict):
        return sum(text_weight(item) for item in value.values())
    return 0


def balanced_assignments(files: list[Path], shard_count: int) -> list[list[Path]]:
    weighted: list[tuple[int, Path]] = []
    for path in files:
        weighted.append((text_weight(base.load_json(path)), path))
    weighted.sort(key=lambda item: (-item[0], item[1].name))

    shards: list[list[Path]] = [[] for _ in range(shard_count)]
    totals = [0 for _ in range(shard_count)]
    for weight, path in weighted:
        shard = min(range(shard_count), key=lambda idx: (totals[idx], idx))
        shards[shard].append(path)
        totals[shard] += weight

    for shard in shards:
        shard.sort(key=lambda path: path.name)
    return shards


def main() -> None:
    shard_index = int(os.environ['RU_SHARD_INDEX'])
    shard_count = int(os.environ['RU_SHARD_COUNT'])
    output_dir = Path(os.environ.get('RU_SHARD_OUTPUT', '.russian-shard'))

    if shard_count < 1 or not 0 <= shard_index < shard_count:
        raise RuntimeError(f'Invalid Russian shard {shard_index}/{shard_count}')

    en_files = sorted(base.EN_DIR.glob('*.json'))
    if not en_files:
        raise RuntimeError('No English locale resources found')

    assignments = balanced_assignments(en_files, shard_count)
    selected = assignments[shard_index]
    print(
        f'Russian shard {shard_index + 1}/{shard_count}: '
        f'{len(selected)} files: {", ".join(path.name for path in selected)}',
        flush=True,
    )

    loaded: dict[str, Any] = {}
    sources: list[str] = []
    for path in selected:
        data = base.load_json(path)
        loaded[path.name] = data
        base.collect_strings(data, sources)

    translator = NllbTranslator()
    translator.translate_many(sources)

    output_dir.mkdir(parents=True, exist_ok=True)
    for path in selected:
        generated = base.translate_tree(loaded[path.name], translator)
        base.validate_shape(loaded[path.name], generated, path.name)
        base.save_json(output_dir / path.name, generated)

    print(
        f'Russian shard {shard_index + 1}/{shard_count} complete: '
        f'{len(selected)} files written to {output_dir}',
        flush=True,
    )


if __name__ == '__main__':
    main()
