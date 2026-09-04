from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALE_ROOT = ROOT / "src/i18n/locales"
LOCALES = ["en", "sr-Latn", "de", "hr", "es", "it", "fr", "ru"]


def flatten(value, prefix=""):
    out = {}
    if isinstance(value, dict):
        for key, nested in value.items():
            path = f"{prefix}.{key}" if prefix else key
            out.update(flatten(nested, path))
    else:
        out[prefix] = value
    return out


def load_locale(locale: str):
    path = LOCALE_ROOT / locale / "tutorials.json"
    return json.loads(path.read_text(encoding="utf-8"))


def tutorial_namespace_keys_from_source():
    keys = set()
    for path in ROOT.joinpath("src").rglob("*.ts*"):
        text = path.read_text(encoding="utf-8")
        if not re.search(r"useTranslation\(\s*['\"]tutorials['\"]\s*\)", text):
            continue
        for match in re.finditer(r"\bt\(\s*['\"]([^'\"]+)['\"]", text):
            keys.add(match.group(1))
    return keys


def placeholders(text):
    if not isinstance(text, str):
        return set()
    return set(re.findall(r"{{\s*([A-Za-z0-9_]+)\s*}}", text))


bundles = {locale: load_locale(locale) for locale in LOCALES}
flat = {locale: flatten(bundle) for locale, bundle in bundles.items()}
english_keys = set(flat["en"])
used_keys = tutorial_namespace_keys_from_source()

print("=== Tutorial localization structural audit ===")
print(f"English tutorial resource leaf keys: {len(english_keys)}")
print(f"Direct tutorial namespace keys used by UI: {len(used_keys)}")
print("Direct keys:")
for key in sorted(used_keys):
    print(f"  {key}")

problems = 0
for locale in LOCALES:
    locale_keys = set(flat[locale])
    missing = sorted(english_keys - locale_keys)
    missing_used = sorted(key for key in used_keys if key not in locale_keys)
    empty = sorted(
        key for key, value in flat[locale].items()
        if isinstance(value, str) and not value.strip()
    )
    placeholder_mismatch = []
    for key in sorted(english_keys & locale_keys):
        if placeholders(flat["en"].get(key)) != placeholders(flat[locale].get(key)):
            placeholder_mismatch.append(key)

    print(f"\n[{locale}]")
    print(f"  leaf keys: {len(locale_keys)}")
    if missing:
        problems += len(missing)
        print(f"  missing vs English ({len(missing)}):")
        for key in missing:
            print(f"    - {key}")
    else:
        print("  missing vs English: none")
    if missing_used:
        problems += len(missing_used)
        print(f"  MISSING DIRECT UI KEYS ({len(missing_used)}):")
        for key in missing_used:
            print(f"    - {key}")
    else:
        print("  missing direct UI keys: none")
    if empty:
        problems += len(empty)
        print(f"  empty translations ({len(empty)}):")
        for key in empty:
            print(f"    - {key}")
    if placeholder_mismatch:
        problems += len(placeholder_mismatch)
        print(f"  placeholder mismatches ({len(placeholder_mismatch)}):")
        for key in placeholder_mismatch:
            print(f"    - {key}")

if problems:
    print(f"\nAUDIT FOUND {problems} localization issue(s).")
else:
    print("\nAUDIT PASSED: all tutorial resource keys and direct UI keys are present in all locales.")
