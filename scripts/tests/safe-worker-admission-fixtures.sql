-- Minimal claim queue used only in disposable PostgreSQL CI database.
CREATE TABLE public.race_stage_safe_calculation_v1 (
  stage_id uuid PRIMARY KEY,
  status text NOT NULL,
  lease_token uuid,
  lease_expires_at timestamptz
);
CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_safe_step_v2(
  p_worker_id text DEFAULT 'safe_edge_v2'::text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='public','pg_temp'
AS $function$
declare
  v_token uuid := gen_random_uuid();
  v_row public.race_stage_safe_calculation_v1%rowtype;
begin
  select *
    into v_row
  from public.race_stage_safe_calculation_v1 s
  where s.status='pending'
  order by s.stage_id
  for update skip locked
  limit 1;
  if not found then return jsonb_build_object('status','idle'); end if;
  update public.race_stage_safe_calculation_v1
     set status='running',lease_token=v_token,
         lease_expires_at=clock_timestamp()+interval '90 seconds'
   where stage_id=v_row.stage_id;
  return jsonb_build_object('status','claimed','stage_id',v_row.stage_id,'lease_token',v_token);
end $function$;
