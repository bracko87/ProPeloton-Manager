-- ProPeloton Manager. Keep all AI-controlled riders on basic regular training.
-- Already applied and verified in production 2026-11-17.
-- Human clubs are not changed. Races, sickness, injury and daily activity
-- take priority in the existing regular training processor.
create or replace function public.ppm_ai_training_default_row_guard_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
 if exists(select 1 from public.clubs c where c.id=new.club_id and c.is_ai=true) then
   new.team_scope:='all'; new.focus_code:='general';
   new.intensity:='normal'; new.auto_when_free:=true;
 end if;
 return new;
end $fn$;
revoke all on function public.ppm_ai_training_default_row_guard_v1() from public,anon,authenticated;
drop trigger if exists trg_ppm_ai_training_default_row_guard_v1 on public.club_regular_training_defaults;
create trigger trg_ppm_ai_training_default_row_guard_v1
before insert or update on public.club_regular_training_defaults for each row
execute function public.ppm_ai_training_default_row_guard_v1();

create or replace function public.ppm_ai_rider_training_plan_guard_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
 if exists(select 1 from public.clubs c where c.id=new.club_id and c.is_ai=true) then
   new.focus_code:='general'; new.intensity:='normal';
   new.is_active:=true; new.auto_when_free:=true;
   new.preferred_days:=null;
 end if;
 return new;
end $fn$;
revoke all on function public.ppm_ai_rider_training_plan_guard_v1() from public,anon,authenticated;
drop trigger if exists trg_ppm_ai_rider_training_plan_guard_v1 on public.rider_regular_training_plans;
create trigger trg_ppm_ai_rider_training_plan_guard_v1
before insert or update on public.rider_regular_training_plans for each row
execute function public.ppm_ai_rider_training_plan_guard_v1();

create or replace function public.ppm_ai_rider_training_management_guard_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
 if exists(select 1 from public.clubs c where c.id=new.club_id and c.is_ai=true) then
   new.management_mode:='inherit';
 end if;
 return new;
end $fn$;
revoke all on function public.ppm_ai_rider_training_management_guard_v1() from public,anon,authenticated;
drop trigger if exists trg_ppm_ai_rider_training_management_guard_v1 on public.rider_regular_training_management;
create trigger trg_ppm_ai_rider_training_management_guard_v1
before insert or update on public.rider_regular_training_management for each row
execute function public.ppm_ai_rider_training_management_guard_v1();

create or replace function public.ppm_seed_ai_training_default_on_club_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
 if new.is_ai=true then
   insert into public.club_regular_training_defaults
     (club_id,team_scope,focus_code,intensity,auto_when_free)
   values(new.id,'all','general','normal',true)
   on conflict (club_id) do update
   set team_scope='all',focus_code='general',intensity='normal',
       auto_when_free=true,updated_at=now()
   where (public.club_regular_training_defaults.team_scope,
          public.club_regular_training_defaults.focus_code,
          public.club_regular_training_defaults.intensity,
          public.club_regular_training_defaults.auto_when_free)
     is distinct from ('all','general','normal',true);
   if tg_op='UPDATE' then
     if old.is_ai is distinct from true then
       update public.rider_regular_training_plans p
          set focus_code='general',intensity='normal',
              is_active=true,auto_when_free=true,
              preferred_days=null,updated_at=now()
        where p.club_id=new.id;
       update public.rider_regular_training_management m
          set management_mode='inherit',updated_at=now()
        where m.club_id=new.id;
     end if;
   end if;
 end if;
 return new;
end $fn$;
revoke all on function public.ppm_seed_ai_training_default_on_club_v1() from public,anon,authenticated;
drop trigger if exists trg_ppm_seed_ai_training_default_on_club_insert_v1 on public.clubs;
create trigger trg_ppm_seed_ai_training_default_on_club_insert_v1
after insert on public.clubs for each row
execute function public.ppm_seed_ai_training_default_on_club_v1();
drop trigger if exists trg_ppm_seed_ai_training_default_on_club_ai_change_v1 on public.clubs;
create trigger trg_ppm_seed_ai_training_default_on_club_ai_change_v1
after update of is_ai on public.clubs for each row when (new.is_ai=true)
execute function public.ppm_seed_ai_training_default_on_club_v1();

insert into public.club_regular_training_defaults
  (club_id,team_scope,focus_code,intensity,auto_when_free)
select c.id,'all','general','normal',true from public.clubs c
 where c.is_ai=true and c.deleted_at is null
on conflict (club_id) do update
set team_scope='all',focus_code='general',intensity='normal',
    auto_when_free=true,updated_at=now()
where (public.club_regular_training_defaults.team_scope,
       public.club_regular_training_defaults.focus_code,
       public.club_regular_training_defaults.intensity,
       public.club_regular_training_defaults.auto_when_free)
   is distinct from ('all','general','normal',true);

update public.rider_regular_training_plans rp
set focus_code='general',intensity='normal',
    is_active=true,auto_when_free=true,
    preferred_days=null,updated_at=now()
from public.clubs c
where rp.club_id=c.id and c.is_ai=true
 and (rp.focus_code is distinct from 'general'
   or rp.intensity is distinct from 'normal'
   or rp.is_active is distinct from true
   or rp.auto_when_free is distinct from true
   or rp.preferred_days is not null);

update public.rider_regular_training_management m
set management_mode='inherit',updated_at=now()
from public.clubs c
where m.club_id=c.id and c.is_ai=true and m.management_mode<>'inherit';
