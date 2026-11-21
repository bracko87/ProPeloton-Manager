#!/usr/bin/env python3
"""Review browser and repository Edge Function references to internal finance RPCs.

Direct browser calls are forbidden. Other name references need human review;
an Edge Function may legitimately use a trusted server-only client. Static
source inspection cannot establish the authorization of dynamic invocations
or prove that the deployed Edge Function matches the repository.
"""
import pathlib
import re
import sys

root=pathlib.Path(__file__).resolve().parents[1]
targets=(
    "finance_grant_new_club_bonus",
    "finance_setup_new_club",
    "finance_credit_to_club",
    "finance_get_or_create_club_account",
    "finance_apply_club_house_tax_rebate_v1",
    "finance_charge_emergency_loan_weekly_payment",
    "finance_charge_race_cost",
    "finance_create_club_house_rebate_v1",
    "finance_force_transfer_club_to_club",
    "finance_issue_emergency_loan_non_ai_core_v1",
    "finance_run_monthly_tax_audit_for_club",
    "race_engine_refund_one_day_weather_cancelled_race_v1",
    "refund_one_day_weather_cancelled_race_v2",
    "finance_spend_from_club",
    "finance_spend_from_club_non_ai_core_v1",
    "finance_issue_emergency_loan",
    "finance_liquidate_club_for_insolvency",
    "finance_liquidate_club_for_insolvency_non_ai_core_v1",
    "finance_ensure_mandatory_funds",
    "finance_ensure_mandatory_funds_non_ai_core_v1",
    "finance_process_weekly_emergency_loan_repayments",
    "finance_run_due_monthly_tax_audits",
)
extensions={".ts",".tsx",".js",".jsx",".mjs",".cjs"}
patterns={}
for name in targets:
    escaped=re.escape(name)
    patterns[name]=re.compile(
        r"(?:\b(?:rpc)\s*(?:<[^;\n]*?>)?\s*\(\s*[\x27\x22\x60]"
        +escaped+r"[\x27\x22\x60]|/rest/v1/rpc/"+escaped+r"\b)",re.I
    )
references=re.compile(r"\b(?:"+"|".join(map(re.escape,targets))+r")\b",re.I)

def scan(folder):
    files=sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix in extensions)
    direct=[]
    other=[]
    for path in files:
        content=path.read_text(encoding="utf-8")
        direct_lines=set()
        for name,pattern in patterns.items():
            for match in pattern.finditer(content):
                line=content.count("\n",0,match.start())+1
                direct.append(f"{path.relative_to(root)}:{line}: {name}")
                direct_lines.add(line)
        for match in references.finditer(content):
            line=content.count("\n",0,match.start())+1
            if line not in direct_lines:
                other.append(f"{path.relative_to(root)}:{line}: {match.group()}")
    return files,direct,sorted(set(other))

# Self-check patterns against syntax variations before reviewing source.
for name,pattern in patterns.items():
    samples=[f'client.rpc("{name}")',f"rpc('{name}')",
        'client.rpc(\x60'+name+'\x60)',f'client.rpc<unknown>("{name}")',
        f'fetch("/rest/v1/rpc/{name}")']
    if not all(pattern.search(sample) for sample in samples):
        raise SystemExit("Finance audit pattern self-check failed")

files,violations,other=scan(root/"src")
if not files:
    raise SystemExit("Missing frontend sources; finance browser audit cannot pass")
print(f"Reviewed {len(files)} frontend source files; {len(violations)} unsafe direct finance RPC references.")
for item in other:
    print("BROWSER REFERENCE — review declaration, alias or dynamic call:",item)
edge_files,edge_direct,edge_other=scan(root/"supabase"/"functions")
print(f"Reviewed {len(edge_files)} repository Edge Function source files; {len(edge_direct)} direct references, {len(edge_other)} other references.")
for item in edge_direct+edge_other:
    print("SERVER REFERENCE — verify trusted client and request authorization:",item)
if violations:
    print("\n".join(violations),file=sys.stderr)
    raise SystemExit("Replace unsafe browser invocation with an authorized game-specific RPC before finance privileges can be hardened")
print("Static audit only: indirect/dynamic references and deployed server authorization remain release checks.")
