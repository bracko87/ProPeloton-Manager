-- Keep the forward-only TypeScript race lifecycle aligned with canonical full
-- Game World Reset target S1 Jan 1 01:00. This prevents the previous cycle's
-- activation boundary from blocking January races after a reset.

create table if not exists public.race_timeline_rollback_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  rollback_game_at timestamp without time zone not null,
  reason text not null,
  affected_race_ids uuid[] not null default '{}',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function public.trg_game_world_reset_rebase_race_engine_activation_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.base_season=1
     and new.base_game_at=timestamp '2000-01-01 01:00:00'
     and new.is_paused=true
     and exists(select 1 from public.game_world_reset_runs r where r.status='source_frozen') then
    update public.race_engine_runtime_control_v1
    set typescript_activation_game_at=new.base_game_at,
        updated_at=clock_timestamp(),
        updated_by='game_world_reset_v1',
        notes=coalesce(notes,'') || E'\nFull Game World Reset: TypeScript race lifecycle activation rebased to S1 Jan 1 01:00.'
    where singleton_id=true
      and active_engine='typescript_v1'
      and coalesce(typescript_lifecycle_enabled,false)=true;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_game_world_reset_rebase_race_engine_activation_v1 on public.game_clock_config;
create trigger trg_game_world_reset_rebase_race_engine_activation_v1
after update of base_game_at,base_season,is_paused on public.game_clock_config
for each row execute function public.trg_game_world_reset_rebase_race_engine_activation_v1();
