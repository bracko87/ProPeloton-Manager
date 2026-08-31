from __future__ import annotations

import re

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

import add_russian_localization_20260831 as base
import add_russian_localization_v2_20260831 as robust

MODEL_NAME = 'facebook/nllb-200-distilled-600M'
BATCH_SIZE = 12
SRC_LANG = 'eng_Latn'
TGT_LANG = 'rus_Cyrl'


class NllbTranslator:
    def __init__(self) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, src_lang=SRC_LANG)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
        self.model.eval()
        torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
        self.target_bos = self.tokenizer.convert_tokens_to_ids(TGT_LANG)
        self.cache: dict[str, str] = {}

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
        pending = list(dict.fromkeys(pending_segments))
        for start in range(0, len(pending), BATCH_SIZE):
            batch = pending[start:start + BATCH_SIZE]
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
                )
            decoded = self.tokenizer.batch_decode(output, skip_special_tokens=True)
            for segment, translated in zip(batch, decoded):
                leading = re.match(r'^\s*', segment).group(0)
                trailing = re.search(r'\s*$', segment).group(0)
                core = base.postprocess(translated)
                segment_cache[segment] = f'{leading}{core}{trailing}'
            print(f'Translated {min(start + len(batch), len(pending))}/{len(pending)} NLLB Russian segments')

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
