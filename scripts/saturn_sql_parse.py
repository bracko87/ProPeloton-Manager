#!/usr/bin/env python3
"""Parse all Saturn SQL migration statements with PostgreSQL's parser.

This runs OFFLINE against repository source, not Supabase. pglast uses the
PostgreSQL parser to validate top-level SQL only; PL/pgSQL bodies inside
CREATE FUNCTION are SQL string literals and need real staging compilation.
"""
from pathlib import Path
import sys

try:
    from pglast import parse_sql
except ImportError as exc:
    raise SystemExit("pglast is required: python -m pip install pglast") from exc

ROOT = Path(__file__).resolve().parents[1]
migration_files = sorted((ROOT / "supabase/migrations").glob("*saturn*.sql"))
audits = sorted((ROOT / "supabase/tests").glob("saturn*.sql"))
files = migration_files + audits
if not migration_files:
    raise SystemExit("Missing Saturn migrations; SQL parse gate is misconfigured")
if len(files) < 10:
    raise SystemExit(f"Expected full Saturn SQL suite, found only {len(files)} files")

errors = []
statements = 0
for path in files:
    source = path.read_text(encoding="utf-8")
    try:
        statements += len(parse_sql(source))
        print(f"OK {path.relative_to(ROOT)}")
    except Exception as error:
        print(f"FAIL {path.relative_to(ROOT)}: {error}", file=sys.stderr)
        errors.append(str(path.relative_to(ROOT)))

print(f"Parsed {statements} PostgreSQL statements in {len(files)} Saturn SQL files.")
if errors:
    raise SystemExit(f"Invalid SQL source in: {', '.join(errors)}")
