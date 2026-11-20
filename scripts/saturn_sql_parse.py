#!/usr/bin/env python3
"""Validate Saturn SQL and PL/pgSQL source syntax offline.

pglast/libpg_query parses both outer PostgreSQL statements and PL/pgSQL
function bodies; it cannot resolve live schema references, permissions,
triggers or transaction behavior, which still require isolated staging.
"""
from pathlib import Path
import re
import sys

try:
    from pglast import parse_sql, parse_plpgsql, split
except ImportError as exc:
    raise SystemExit("pglast is required: python -m pip install pglast") from exc

ROOT = Path(__file__).resolve().parents[1]
migration_files = sorted((ROOT / "supabase/migrations").glob("*saturn*.sql"))
audits = sorted((ROOT / "supabase/tests").glob("saturn*.sql"))
files = migration_files + audits
if not migration_files or len(files) < 10:
    raise SystemExit("Missing expected Saturn migration or SQL audit files")

errors: list[str] = []
statements = 0
functions = 0
for path in files:
    source = path.read_text(encoding="utf-8")
    label = str(path.relative_to(ROOT))
    try:
        statements += len(parse_sql(source))
        for stmt in split(source):
            # Input to parse_plpgsql MUST be the complete CREATE FUNCTION
            # statement, including its SQL signature, language and dollar body.
            if (re.search(r"\bcreate\s+(?:or\s+replace\s+)?function\b", stmt, re.I)
                    and re.search(r"\blanguage\s+plpgsql\b", stmt, re.I)):
                try:
                    parse_plpgsql(stmt)
                    functions += 1
                except Exception as exc:
                    raise ValueError(f"PL/pgSQL body: {exc}") from exc
        print(f"OK {label}")
    except Exception as exc:
        print(f"FAIL {label}: {exc}", file=sys.stderr)
        errors.append(label)

print(
    f"Parsed {statements} PostgreSQL statements and {functions} "
    f"PL/pgSQL function bodies in {len(files)} Saturn SQL files."
)
if errors:
    raise SystemExit(f"Invalid SQL/PLpgSQL source in: {', '.join(errors)}")
