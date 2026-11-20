-- SAT-08: read-only inventory of potentially mutating PUBLIC SECURITY
-- DEFINER functions reachable by database role authenticated or anon.
-- The SQL text heuristic is for TRIAGE, not evidence of exploitability.
-- Categorize server-only race/season/scheduler functions separately from
-- legitimate player-facing actions. Never blindly REVOKE or rewrite all.
with routines as (
 select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) arguments,
        p.prosecdef,pg_get_functiondef(p.oid) source,
        has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
), candidates as (
 select *,
   (source ~* '(insert[[:space:]]+into|update[[:space:]]+[a-z_]|delete[[:space:]]+from|perform[[:space:]]+(public|finance)[.])') as mutation_signal,
   (source ilike '%saturn_test_account_requires_guard_v1%'
    or source ilike '%saturn_test_account_can_mutate_v1%') as has_saturn_source_guard,
   (source ~* '(auth.uid[(][)]|auth.role[(][)])') as references_caller_identity,
   case
    when proname ~* '^(execute_|process_|reconcile_|auto_|assign_ai_|fill_race_ai_|race_engine_|game_world_|apply_race_stage_|complete_overdue_|cleanup_|_finance_process_)'
      then 'scheduler_or_engine_review'
    when proname ~* '(finance|coin|loan|sponsor|reward|premium)'
      then 'player_finance_and_rewards_review'
    when proname ~* '(equipment|maintenance|supply|setup|restock)'
      then 'player_equipment_review'
    when proname ~* '(training|staff|rider|contract|transfer|scout|academy)'
      then 'player_roster_training_review'
    when proname ~* '(race|competition|application|startlist|strategy)'
      then 'player_competition_review'
    else 'other_review'
   end as review_group
 from routines
 where prosecdef and (anon_execute or authenticated_execute)
)
select review_group,proname,arguments,anon_execute,authenticated_execute,
       mutation_signal,has_saturn_source_guard,references_caller_identity
from candidates
where mutation_signal
order by
 case review_group
 when 'player_finance_and_rewards_review' then 1
 when 'player_competition_review' then 2
 when 'player_equipment_review' then 3
 when 'player_roster_training_review' then 4
 when 'scheduler_or_engine_review' then 5
 else 6 end,
 proname,arguments;
