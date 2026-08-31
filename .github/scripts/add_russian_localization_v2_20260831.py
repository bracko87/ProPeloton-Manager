from __future__ import annotations

import re

import torch

import add_russian_localization_20260831 as base

# Company names are user-visible proper names and must remain unchanged in every locale.
# Add this at the protected-safe wrapper layer so the translation model never sees it.
if 'Next Quest Studio' not in base.PROTECTED_PHRASES:
    base.PROTECTED_PHRASES.append('Next Quest Studio')


def _overlaps(start: int, end: int, spans: list[tuple[int, int, str]]) -> bool:
    return any(start < old_end and end > old_start for old_start, old_end, _ in spans)


def split_protected(source: str) -> list[tuple[bool, str]]:
    """Split source into translatable and protected chunks.

    Placeholders, URLs, backend/code identifiers and function names are protected first
    and carried through byte-for-byte. Product/game terminology is matched only after
    those spans are reserved, so words such as ``coins`` inside ``{{coins}}`` cannot be
    mistaken for the protected visible term ``Coins``.
    """
    spans: list[tuple[int, int, str]] = []

    # Structured tokens must win over ordinary protected words.
    for pattern in (base.PLACEHOLDER_RE, base.URL_RE, base.CODE_RE, base.FUNC_RE):
        for match in pattern.finditer(source):
            start, end = match.span()
            if not _overlaps(start, end, spans):
                spans.append((start, end, match.group(0)))

    for phrase in sorted(base.PROTECTED_PHRASES, key=len, reverse=True):
        for match in re.finditer(rf'(?<!\w){re.escape(phrase)}(?!\w)', source, flags=re.I):
            start, end = match.span()
            if not _overlaps(start, end, spans):
                spans.append((start, end, phrase))

    if not spans:
        return [(False, source)]

    spans.sort(key=lambda item: item[0])
    chunks: list[tuple[bool, str]] = []
    cursor = 0
    for start, end, replacement in spans:
        if cursor < start:
            chunks.append((False, source[cursor:start]))
        chunks.append((True, replacement))
        cursor = end
    if cursor < len(source):
        chunks.append((False, source[cursor:]))
    return chunks


def _needs_translation(segment: str) -> bool:
    # Preserve whitespace/punctuation-only chunks exactly. Tiny connector chunks are
    # still translated because Russian grammar often needs them around protected terms.
    return bool(re.search(r'[A-Za-z]', segment)) and base.should_translate(segment)


class RobustTranslator(base.Translator):
    def translate_many(self, sources: list[str]) -> None:
        unique_sources = list(dict.fromkeys(sources))
        source_chunks: dict[str, list[tuple[bool, str]]] = {}
        pending_segments: list[str] = []

        for source in unique_sources:
            stripped = source.strip()
            if stripped in base.EXACT_OVERRIDES:
                self.cache[source] = base.EXACT_OVERRIDES[stripped]
                continue
            if not base.should_translate(source):
                self.cache[source] = source
                continue

            chunks = split_protected(source)
            source_chunks[source] = chunks
            for protected, segment in chunks:
                if not protected and _needs_translation(segment):
                    pending_segments.append(segment)

        segment_cache: dict[str, str] = {}
        pending = list(dict.fromkeys(pending_segments))
        for start in range(0, len(pending), base.BATCH_SIZE):
            batch = pending[start:start + base.BATCH_SIZE]
            encoded = self.tokenizer(
                batch,
                return_tensors='pt',
                padding=True,
                truncation=True,
                max_length=512,
            )
            with torch.inference_mode():
                output = self.model.generate(**encoded, max_new_tokens=512, num_beams=1)
            decoded = self.tokenizer.batch_decode(output, skip_special_tokens=True)
            for segment, translated in zip(batch, decoded):
                # Preserve leading/trailing whitespace from the English segment because
                # it separates exact protected tokens from surrounding Russian text.
                leading = re.match(r'^\s*', segment).group(0)
                trailing = re.search(r'\s*$', segment).group(0)
                core = base.postprocess(translated)
                segment_cache[segment] = f'{leading}{core}{trailing}'
            print(f'Translated {min(start + len(batch), len(pending))}/{len(pending)} protected-safe Russian segments')

        for source, chunks in source_chunks.items():
            assembled: list[str] = []
            for protected, segment in chunks:
                if protected or not _needs_translation(segment):
                    assembled.append(segment)
                else:
                    assembled.append(segment_cache.get(segment, segment))
            self.cache[source] = base.postprocess(''.join(assembled))


base.Translator = RobustTranslator

if __name__ == '__main__':
    base.main()
