from __future__ import annotations

import re

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

import add_russian_localization_20260831 as base
import add_russian_localization_v2_20260831 as robust

MODEL_NAME = 'facebook/nllb-200-distilled-600M'
SRC_LANG = 'eng_Latn'
TGT_LANG = 'rus_Cyrl'


class NllbTranslator:
    def __init__(self) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, src_lang=SRC_LANG)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
        self.model.eval()
        torch.set_num_threads(max(1, min(8, torch.get_num_threads())))
        self.target_bos = self.tokenizer.convert_tokens_to_ids(TGT_LANG)
        self.cache: dict[str, str] = {}

    @staticmethod
    def _batch_size(segment: str) -> int:
        # Keep similarly sized strings together so short UI labels do not wait on
        # long manual/help paragraphs. This is substantially faster on CPU while
        # leaving the model and translation quality unchanged.
        size = len(segment)
        if size <= 45:
            return 64
        if size <= 110:
            return 40
        if size <= 260:
            return 24
        if size <= 600:
            return 12
        return 6

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

            chunks = robust.split_protected(source)
            source_chunks[source] = chunks
            for protected, segment in chunks:
                if not protected and robust._needs_translation(segment):
                    pending_segments.append(segment)

        segment_cache: dict[str, str] = {}
        # Deduplicate and length-sort to minimize padding and decoder waste.
        pending = sorted(dict.fromkeys(pending_segments), key=len)
        translated_count = 0
        start = 0

        while start < len(pending):
            batch_size = self._batch_size(pending[start])
            # Avoid mixing very different string sizes in the same batch.
            first_len = len(pending[start])
            end = min(start + batch_size, len(pending))
            while end > start + 1 and len(pending[end - 1]) > max(first_len * 2, first_len + 80):
                end -= 1

            batch = pending[start:end]
            encoded = self.tokenizer(
                batch,
                return_tensors='pt',
                padding=True,
                truncation=True,
                max_length=512,
            )
            with torch.inference_mode():
                output = self.model.generate(
                    **encoded,
                    forced_bos_token_id=self.target_bos,
                    max_new_tokens=512,
                    num_beams=1,
                    use_cache=True,
                )
            decoded = self.tokenizer.batch_decode(output, skip_special_tokens=True)
            for segment, translated in zip(batch, decoded):
                leading = re.match(r'^\s*', segment).group(0)
                trailing = re.search(r'\s*$', segment).group(0)
                core = base.postprocess(translated)
                segment_cache[segment] = f'{leading}{core}{trailing}'

            translated_count += len(batch)
            print(f'Translated {translated_count}/{len(pending)} NLLB Russian segments', flush=True)
            start = end

        for source, chunks in source_chunks.items():
            assembled: list[str] = []
            for protected, segment in chunks:
                if protected or not robust._needs_translation(segment):
                    assembled.append(segment)
                else:
                    assembled.append(segment_cache.get(segment, segment))
            self.cache[source] = base.postprocess(''.join(assembled))

    def translate(self, source: str) -> str:
        return self.cache.get(source, source)


base.Translator = NllbTranslator

if __name__ == '__main__':
    base.main()
