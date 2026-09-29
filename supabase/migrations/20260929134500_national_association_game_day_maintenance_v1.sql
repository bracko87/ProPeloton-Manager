-- Automatic National Association / National Team maintenance on game-date changes.
-- This is deliberately isolated from the main daily tick so a failure in this
-- subsystem cannot block the game clock.

create table if not exists public.national_association_maintenance_log (
  id bigint generated always as identity primary key,
  game_date date,
  task_key text not null,
  status text not null check (status in ('ok','error')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists national_association_maintenance_log_date_idx
  on public.national_association_maintenance_log(game_date desc,created_at desc);

create or replace function public.refresh_national_association_statuses_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date:=public.get_current_game_date_date();
  v_month integer;
  v_day integer;
  v_minimum integer;
  v_activated integer:=0;
  v_inactivated integer:=0;
begin
  select month_number::integer,day_number::integer
  into v_month,v_day
  from public.game_state
  where id=true;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  -- Forming/inactive Associations activate as soon as the minimum eligible
  -- manager count is restored. There is no Coin renewal or treasury payment.
  update public.national_associations a
  set status='active',
      activated_on_game_date=coalesce(a.activated_on_game_date,v_today),
      inactive_on_game_date=null,
      last_status_change_on_game_date=v_today,
      updated_at=now()
  where a.status in ('forming','inactive')
    and private.national_association_active_member_count_v1(a.id)>=coalesce(v_minimum,5);

  get diagnostics v_activated=row_count;

  -- Existing active Associations are not dissolved mid-season if a manager
  -- leaves. Eligibility is revalidated at the annual January checkpoint.
  if v_month=1 and v_day=1 then
    update public.national_associations a
    set status='inactive',
        inactive_on_game_date=v_today,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where a.status='active'
      and private.national_association_active_member_count_v1(a.id)<coalesce(v_minimum,5);

    get diagnostics v_inactivated=row_count;

    update public.national_coach_terms t
    set status='ineligible',
        term_end_game_date=greatest(t.term_start_game_date,v_today),
        updated_at=now()
    where t.status='active'
      and exists(
        select 1
        from public.national_associations a
        where a.id=t.association_id
          and a.status='inactive'
      );
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'activated',v_activated,
    'inactivated_at_annual_checkpoint',v_inactivated,
    'minimum_members',coalesce(v_minimum,5)
  );
end;
$$;

create or replace function private.national_association_run_game_day_maintenance_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date:=public.get_current_game_date_date();
  v_result jsonb:='{}'::jsonb;
  v_task jsonb;
  v_expired integer;
begin
  begin
    v_task:=public.refresh_national_association_statuses_v1();
    v_result:=v_result||jsonb_build_object('association_statuses',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'association_statuses','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'association_statuses','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('association_statuses_error',sqlerrm);
  end;

  begin
    v_task:=public.process_national_coach_elections_v1();
    v_result:=v_result||jsonb_build_object('coach_elections',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'coach_elections','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'coach_elections','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('coach_elections_error',sqlerrm);
  end;

  begin
    v_expired:=public.expire_national_team_callups_v1();
    v_task:=jsonb_build_object('expired',v_expired);
    v_result:=v_result||jsonb_build_object('callup_expiry',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'callup_expiry','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'callup_expiry','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('callup_expiry_error',sqlerrm);
  end;

  begin
    v_task:=public.refresh_national_team_duty_status_v1();
    v_result:=v_result||jsonb_build_object('national_duty',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'national_duty','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'national_duty','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('national_duty_error',sqlerrm);
  end;

  return v_result;
end;
$$;

create or replace function private.national_association_game_state_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_date date;
  v_new_date date;
begin
  v_old_date:=public.game_date_from_parts(
    old.season_number,
    old.month_number,
    old.day_number
  );
  v_new_date:=public.game_date_from_parts(
    new.season_number,
    new.month_number,
    new.day_number
  );

  if v_old_date is distinct from v_new_date then
    -- AFTER UPDATE: all game-date helpers already see NEW state.
    perform private.national_association_run_game_day_maintenance_v1();
  end if;

  return new;
exception when others then
  -- Never block the main game clock because of this subsystem.
  begin
    insert into public.national_association_maintenance_log(
      game_date,task_key,status,details
    )
    values(
      v_new_date,
      'game_state_trigger',
      'error',
      jsonb_build_object('message',sqlerrm)
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists national_association_game_day_maintenance
  on public.game_state;

create trigger national_association_game_day_maintenance
after update of season_number,month_number,day_number
on public.game_state
for each row
execute function private.national_association_game_state_trigger_v1();

alter table public.national_association_maintenance_log enable row level security;
revoke all on public.national_association_maintenance_log from anon,authenticated;

revoke all on function public.refresh_national_association_statuses_v1()
from public,anon,authenticated;
grant execute on function public.refresh_national_association_statuses_v1()
to service_role;
