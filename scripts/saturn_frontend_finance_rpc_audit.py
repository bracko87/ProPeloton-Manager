#!/usr/bin/env python3
"""Prevent frontend direct RPC calls to internal security-definer finance functions.

Run in CI against the whole src tree after checkout, not a partial GitHub
source excerpt. A browser must use authorized game actions, never these
unvalidated internal credit/bonus primitives.
"""
import pathlib
import re
import sys

root=pathlib.Path(__file__).resolve().parents[1]
front=root/"src"
targets=(
    "finance_grant_new_club_bonus",
    "finance_setup_new_club",
    "finance_credit_to_club",
    "finance_get_or_create_club_account",
)
patterns=[
    re.compile(r"\.rpc\s*\(\s*['"]"+re.escape(name)+r"['"]",re.I)
    for name in targets
]
files=[p for p in front.rglob("*") if p.is_file() and p.suffix in {".ts",".tsx",".js",".jsx"}]
if not files:
    raise SystemExit("Missing frontend sources; finance browser audit cannot pass")
violations=[]
for path in files:
    content=path.read_text(encoding="utf-8")
    for name,pattern in zip(targets,patterns):
        for match in pattern.finditer(content):
            line=content.count("\n",0,match.start())+1
            violations.append(f"{path.relative_to(root)}:{line}: direct .rpc({name})")
print(f"Reviewed {len(files)} frontend source files; {len(violations)} unsafe direct finance RPC references.")
if violations:
    print("\n".join(violations),file=sys.stderr)
    raise SystemExit("Replace unsafe browser invocation with an authorized game-specific RPC before finance privileges can be hardened")
