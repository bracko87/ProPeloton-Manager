begin;

create or replace function public.rider_potential_headroom_multiplier_v1(p_rider_id uuid)
returns numeric language sql stable security definer set search_path=public as $$
select case
  when r.id is null or r.potential is null then 1.0000::numeric
  when coalesce(r.overall,0) <= r.potential-15 then 1.0000
  when coalesce(r.overall,0) <= r.potential-10 then 0.9000
  when coalesce(r.overall,0) <= r.potential-6 then 0.7500
  when coalesce(r.overall,0) <= r.potential-3 then 0.5500
  when coalesce(r.overall,0) <= r.potential then 0.3500
  when coalesce(r.overall,0) <= r.potential+4 then 0.1800
  when coalesce(r.overall,0) <= r.potential+8 then 0.0800
  else 0.0300 end::numeric
from public.riders r where r.id=p_rider_id
union all select 1.0000::numeric
where not exists(select 1 from public.riders r where r.id=p_rider_id)
limit 1;
$$;

create or replace function public.add_rider_attribute_progress_delta(p_rider_id uuid,p_attribute_code text,p_delta numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_delta numeric;
begin
  if p_delta is null or p_delta=0 then return; end if;
  if p_attribute_code not in ('sprint','climbing','time_trial','endurance','flat','recovery','resistance','race_iq','teamwork')
    then raise exception 'Unsupported attribute code: %',p_attribute_code; end if;
  v_delta:=case when p_delta>0 then p_delta*public.rider_potential_headroom_multiplier_v1(p_rider_id) else p_delta end;
  insert into public.rider_attribute_progress_bank(rider_id,attribute_code,progress_points,updated_at,created_at)
  values(p_rider_id,p_attribute_code,v_delta,now(),now())
  on conflict(rider_id,attribute_code) do update
  set progress_points=public.rider_attribute_progress_bank.progress_points+excluded.progress_points,updated_at=now();
end;
$$;

create or replace function public.apply_race_development_progress_bank_v1(
 p_simulation_run_id uuid default null,p_stage_id uuid default null,p_rider_id uuid default null,
 p_max_events integer default 10000,p_force boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_event_count integer:=0;v_progress_rows integer:=0;v_total_progress numeric:=0;
begin
 with target_events as(
  select ev.* from public.rider_race_development_events ev
  where (p_force=true or ev.applied_to_progress_bank=false)
   and (p_simulation_run_id is null or ev.simulation_run_id=p_simulation_run_id)
   and (p_stage_id is null or ev.stage_id=p_stage_id)
   and (p_rider_id is null or ev.rider_id=p_rider_id)
  order by ev.stage_date nulls last,ev.created_at,ev.id limit greatest(1,coalesce(p_max_events,10000))
 ),progress_rows as(
  select ev.id event_id,ev.rider_id,key attribute_code,
   (greatest(0,value::numeric)*public.rider_potential_headroom_multiplier_v1(ev.rider_id))::numeric progress_points
  from target_events ev cross join lateral jsonb_each_text(coalesce(ev.progress_json,'{}'::jsonb))
  where key in('sprint','climbing','time_trial','endurance','flat','recovery','resistance','race_iq','teamwork')
   and value~'^-?[0-9]+(\\.[0-9]+)?$' and value::numeric<>0
 ),upserted_bank as(
  insert into public.rider_attribute_progress_bank(rider_id,attribute_code,progress_points,updated_at,created_at)
  select rider_id,attribute_code,sum(progress_points),now(),now() from progress_rows group by rider_id,attribute_code
  on conflict(rider_id,attribute_code) do update
  set progress_points=public.rider_attribute_progress_bank.progress_points+excluded.progress_points,updated_at=now()
  returning rider_id
 ),event_progress_summary as(
  select event_id,jsonb_object_agg(attribute_code,round(progress_points,4) order by attribute_code) applied_progress_json,
   sum(progress_points)::numeric(10,4) applied_total_progress
  from progress_rows group by event_id
 ),marked as(
  update public.rider_race_development_events ev set applied_to_progress_bank=true,progress_bank_applied_at=now(),
   progress_bank_progress_json=coalesce(eps.applied_progress_json,'{}'::jsonb),
   progress_bank_metadata=coalesce(ev.progress_bank_metadata,'{}'::jsonb)||jsonb_build_object(
    'source','apply_race_development_progress_bank_v1','applied_total_progress',coalesce(eps.applied_total_progress,0),
    'applied_at',now(),'force',p_force,'skipped_attributes',jsonb_build_array('morale'),
    'potential_headroom_model','soft_ceiling_v1','potential_headroom_multiplier',public.rider_potential_headroom_multiplier_v1(ev.rider_id)),
   updated_at=now()
  from event_progress_summary eps where eps.event_id=ev.id
  returning ev.id,coalesce(eps.applied_total_progress,0) applied_total_progress
 )
 select (select count(*) from target_events),(select count(*) from progress_rows),
  coalesce((select sum(applied_total_progress) from marked),0)
 into v_event_count,v_progress_rows,v_total_progress;
 return jsonb_build_object('status','completed','simulation_run_id',p_simulation_run_id,'stage_id',p_stage_id,
  'rider_id',p_rider_id,'force',p_force,'target_event_count',v_event_count,'progress_rows',v_progress_rows,
  'total_progress_added_to_bank',round(v_total_progress,4),'potential_headroom_model','soft_ceiling_v1');
end;
$$;

create or replace function public.trg_apply_race_result_morale_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_delta integer:=0;v_before integer;v_after integer;v_status text:=lower(coalesce(new.finish_status,''));
begin
 if v_status in('dnf','abandoned','did_not_finish','otl') then v_delta:=-1;
 elsif new.finish_rank=1 then v_delta:=3;
 elsif new.finish_rank between 2 and 3 then v_delta:=2;
 elsif new.finish_rank between 4 and 10 then v_delta:=1; end if;
 if v_delta=0 then return new; end if;
 select coalesce(morale,50) into v_before from public.riders where id=new.rider_id for update;
 if not found then return new; end if;
 v_after:=greatest(0,least(100,v_before+v_delta));
 update public.riders set morale=v_after,
  morale_updated_on=case when new.stage_date is null then morale_updated_on else greatest(coalesce(morale_updated_on,new.stage_date),new.stage_date) end
 where id=new.rider_id;
 update public.rider_race_development_events set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'result_morale_rule_version','race_result_morale_v1','result_morale_delta',v_delta,
  'result_morale_before',v_before,'result_morale_after',v_after) where id=new.id;
 return new;
end;
$$;
drop trigger if exists trg_apply_race_result_morale_v1 on public.rider_race_development_events;
create trigger trg_apply_race_result_morale_v1 after insert on public.rider_race_development_events
for each row execute function public.trg_apply_race_result_morale_v1();

create or replace function public.get_race_plan_bonus_preview_v2(
 p_club_id uuid,p_staff_ids uuid[] default '{}'::uuid[],p_asset_assignments jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_base jsonb;v_staff jsonb:='[]'::jsonb;v_live_staff jsonb:='[]'::jsonb;
begin
 v_base:=public.get_race_plan_bonus_preview_v1(p_club_id,coalesce(p_staff_ids,'{}'::uuid[]),coalesce(p_asset_assignments,'[]'::jsonb));
 select coalesce(jsonb_agg(value),'[]'::jsonb) into v_staff
 from jsonb_array_elements(coalesce(v_base->'staff','[]'::jsonb))
 where coalesce(value->>'source_key','') not in('sport_director','u23_head_coach','nutritionist');
 with candidates as(
  select cs.id,cs.role_type,cs.staff_name,
   greatest(0,least(100,coalesce(cs.expertise,50)*.35+coalesce(cs.experience,50)*.15+coalesce(cs.potential,50)*.10+
    coalesce(cs.leadership,50)*.20+coalesce(cs.efficiency,50)*.15+coalesce(cs.loyalty,50)*.05)) quality,
   public.get_staff_assignment_availability_factor(cs.id,public.get_current_game_date_date()) availability
  from public.club_staff cs where cs.club_id=p_club_id and cs.id=any(coalesce(p_staff_ids,'{}'::uuid[]))
   and cs.is_active=true and cs.role_type='sport_director'
  union all
  select cs.id,cs.role_type,cs.staff_name,
   greatest(0,least(100,coalesce(cs.expertise,50)*.35+coalesce(cs.experience,50)*.10+coalesce(cs.potential,50)*.10+
    coalesce(cs.leadership,50)*.10+coalesce(cs.efficiency,50)*.25+coalesce(cs.loyalty,50)*.10)) quality,
   public.get_staff_assignment_availability_factor(cs.id,public.get_current_game_date_date()) availability
  from public.club_staff cs where cs.club_id=p_club_id and cs.is_active=true and cs.role_type='nutritionist'
  order by quality desc limit 1
 ),rows as(
  select case when role_type='sport_director' then jsonb_build_object('source_type','staff','source_key','sport_director',
   'source_label','Sport Director: '||staff_name,'effects',jsonb_build_array(jsonb_build_object(
    'effect_key','tactical_support_pct','label','Race tactics & execution','value','+'||
    round(greatest(0,least(8,(quality-35)*.12))*greatest(0,least(1,availability)),1)::text||'%')))
  when role_type='nutritionist' then jsonb_build_object('source_type','staff','source_key','nutritionist',
   'source_label','Nutritionist: '||staff_name,'effects',jsonb_build_array(
    jsonb_build_object('effect_key','feeding_support_pct','label','Race feeding support','value','+'||
      round(greatest(0,least(3.5,(quality-35)*.055))*greatest(0,least(1,availability)),1)::text||'%'),
    jsonb_build_object('effect_key','hydration_support_bonus_pct','label','Hydration / fatigue control','value','+'||
      round(greatest(0,least(4,(quality-35)*.065))*greatest(0,least(1,availability)),1)::text||'%'),
    jsonb_build_object('effect_key','recovery_comfort_bonus_pct','label','Post-stage nutrition recovery','value','+'||
      round(greatest(0,least(4,(quality-35)*.065))*greatest(0,least(1,availability)),1)::text||'%'),
    jsonb_build_object('effect_key','minor_injury_risk_reduction_pct','label','Health protection','value','-'||
      round(greatest(0,least(2.5,(quality-35)*.040))*greatest(0,least(1,availability)),1)::text||'%')))
  end row_json from candidates
 )
 select coalesce(jsonb_agg(row_json) filter(where row_json is not null),'[]'::jsonb) into v_live_staff from rows;
 return jsonb_set(coalesce(v_base,'{}'::jsonb),'{staff}',v_staff||v_live_staff,true);
end;
$$;

create or replace function public.quote_race_preparation_with_bonus_v1(
 p_race_id uuid,p_club_id uuid,p_rider_ids uuid[] default '{}'::uuid[],p_staff_ids uuid[] default '{}'::uuid[],
 p_asset_assignments jsonb default '[]'::jsonb,p_supply_reservations jsonb default '{}'::jsonb,
 p_default_equipment_setup_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_quote jsonb;v_bonus_preview jsonb;v_travel_fatigue_preview jsonb;v_travel_warning text;
begin
 v_quote:=public.quote_race_preparation_v1(p_race_id,p_club_id,coalesce(p_rider_ids,'{}'::uuid[]),
  coalesce(p_staff_ids,'{}'::uuid[]),coalesce(p_asset_assignments,'[]'::jsonb),
  coalesce(p_supply_reservations,'{}'::jsonb),p_default_equipment_setup_id);
 v_travel_fatigue_preview:=public.get_race_travel_fatigue_preview_v1(p_race_id,p_club_id);
 v_quote:=coalesce(v_quote,'{}'::jsonb)||jsonb_build_object('travel_fatigue_preview',coalesce(v_travel_fatigue_preview,'{}'::jsonb));
 if coalesce((v_travel_fatigue_preview->>'available')::boolean,false)
  and coalesce((v_travel_fatigue_preview->>'net_travel_fatigue')::integer,0)>0 then
  v_travel_warning:=nullif(v_travel_fatigue_preview->>'message','');
  if v_travel_warning is not null then v_quote:=jsonb_set(v_quote,'{warnings}',
   coalesce(v_quote->'warnings','[]'::jsonb)||jsonb_build_array(v_travel_warning),true); end if;
 end if;
 v_bonus_preview:=public.get_race_plan_bonus_preview_v2(p_club_id,coalesce(p_staff_ids,'{}'::uuid[]),coalesce(p_asset_assignments,'[]'::jsonb));
 v_quote:=coalesce(v_quote,'{}'::jsonb)||jsonb_build_object('bonus_preview',coalesce(v_bonus_preview,'{}'::jsonb));
 return public.race_quote_attach_standardized_bonus_v1(v_quote);
end;
$$;

create or replace function public.race_engine_get_stage_rider_preparation_modifiers_v2(p_stage_id uuid)
returns table(race_id uuid,stage_id uuid,rider_id uuid,team_id uuid,rider_name text,team_name text,preparation_id uuid,
 preparation_status text,preparation_applied boolean,race_support numeric,fatigue_control numeric,recovery_support numeric,
 health_protection numeric,mechanical_reliability numeric,in_stage_energy_cost_multiplier numeric,
 non_neutral_command_capability_bonus numeric,health_incident_risk_multiplier numeric,mechanical_incident_risk_multiplier numeric,
 mechanical_time_loss_multiplier numeric,post_stage_fatigue_multiplier numeric,post_stage_recovery_bonus_points numeric,
 preparation_model_version text)
language sql stable set search_path=public as $$
with rider_inputs as materialized(select * from public.race_engine_get_stage_rider_inputs_v1(p_stage_id)),
prep_keys as materialized(select distinct team_id,preparation_id from rider_inputs),
preparation_source as materialized(
 select k.team_id,k.preparation_id,lower(trim(coalesce(p.status,''))) preparation_status,
  (k.preparation_id is not null and lower(trim(coalesce(p.status,''))) in('submitted','locked','final','finalized','completed')) preparation_applied,
  p.validation_snapshot_json from prep_keys k left join public.race_preparations p on p.id=k.preparation_id),
u23_staff_bonus as materialized(
 select k.team_id,k.preparation_id,case when coalesce(a.is_enabled,false) and a.planner_staff_id is not null
  and cs.id is not null and coalesce(cs.is_active,false) then round(greatest(0,least(6.5,
   ((coalesce(cs.expertise,50)*.30+coalesce(cs.experience,50)*.15+coalesce(cs.potential,50)*.15+
     coalesce(cs.leadership,50)*.20+coalesce(cs.efficiency,50)*.15+coalesce(cs.loyalty,50)*.05)-35)*.10))
   *greatest(0,least(1,public.get_staff_assignment_availability_factor(cs.id,public.get_current_game_date_date()))),4)
  else 0::numeric end u23_race_support
 from prep_keys k left join public.race_preparation_stage_plan_automation a
  on a.race_preparation_id=k.preparation_id and a.planner_role='u23_head_coach'
 left join public.club_staff cs on cs.id=a.planner_staff_id),
raw_bonus_totals as materialized(
 select ps.*,
  case when ps.preparation_applied then coalesce(nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'race_support','')::numeric,
   nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'race_support','')::numeric,0)+coalesce(u23.u23_race_support,0) else 0 end race_support,
  case when ps.preparation_applied then coalesce(nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'fatigue_control','')::numeric,
   nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'fatigue_control','')::numeric,0) else 0 end fatigue_control,
  case when ps.preparation_applied then coalesce(nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'recovery_support','')::numeric,
   nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'recovery_support','')::numeric,0) else 0 end recovery_support,
  case when ps.preparation_applied then coalesce(nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'health_protection','')::numeric,
   nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'health_protection','')::numeric,0) else 0 end health_protection,
  case when ps.preparation_applied then coalesce(nullif(ps.validation_snapshot_json->'standardized_bonus_totals'->>'mechanical_reliability','')::numeric,
   nullif(ps.validation_snapshot_json->'standardized_bonus'->'totals'->>'mechanical_reliability','')::numeric,0) else 0 end mechanical_reliability
 from preparation_source ps left join u23_staff_bonus u23 on u23.team_id=ps.team_id and u23.preparation_id is not distinct from ps.preparation_id),
team_penalties as materialized(select k.team_id,public.race_team_stage_jersey_shortage_penalty_v1(p_stage_id,k.team_id) jersey_penalty
 from(select distinct team_id from prep_keys) k),
adjusted as materialized(select rb.*,tp.jersey_penalty,greatest(0,1-coalesce((tp.jersey_penalty->>'preparation_bonus_reduction_pct')::numeric,0)/100) bonus_factor,
 coalesce((tp.jersey_penalty->>'energy_cost_penalty_pct')::numeric,0) energy_penalty_pct,
 coalesce((tp.jersey_penalty->>'post_stage_fatigue_penalty_pct')::numeric,0) fatigue_penalty_pct
 from raw_bonus_totals rb join team_penalties tp on tp.team_id=rb.team_id),
scaled as materialized(select a.*,
 case when a.race_support>0 then a.race_support*a.bonus_factor else a.race_support end s_race_support,
 case when a.fatigue_control>0 then a.fatigue_control*a.bonus_factor else a.fatigue_control end s_fatigue_control,
 case when a.recovery_support>0 then a.recovery_support*a.bonus_factor else a.recovery_support end s_recovery_support,
 case when a.health_protection>0 then a.health_protection*a.bonus_factor else a.health_protection end s_health_protection,
 case when a.mechanical_reliability>0 then a.mechanical_reliability*a.bonus_factor else a.mechanical_reliability end s_mechanical_reliability from adjusted a),
team_modifiers as materialized(select s.team_id,s.preparation_id,s.preparation_status,s.preparation_applied,s.energy_penalty_pct,s.fatigue_penalty_pct,m.*
 from scaled s cross join lateral public.race_engine_calculate_preparation_modifiers_v2(
 s.s_race_support,s.s_fatigue_control,s.s_recovery_support,s.s_health_protection,s.s_mechanical_reliability)m)
select ri.race_id,ri.stage_id,ri.rider_id,ri.team_id,ri.rider_name,ri.team_name,ri.preparation_id,
 nullif(tm.preparation_status,''),tm.preparation_applied,tm.race_support,tm.fatigue_control,tm.recovery_support,tm.health_protection,
 tm.mechanical_reliability,round(tm.in_stage_energy_cost_multiplier*(1+tm.energy_penalty_pct/100),6),
 tm.non_neutral_command_capability_bonus,tm.health_incident_risk_multiplier,tm.mechanical_incident_risk_multiplier,
 tm.mechanical_time_loss_multiplier,round(tm.post_stage_fatigue_multiplier*(1+tm.fatigue_penalty_pct/100),6),
 tm.post_stage_recovery_bonus_points,'preparation_modifiers_v3_live_staff_2026_09'::text
from rider_inputs ri join team_modifiers tm on tm.team_id=ri.team_id and tm.preparation_id is not distinct from ri.preparation_id
order by ri.team_name,ri.rider_name,ri.rider_id;
$$;

create or replace function public.trg_u23_stage_plan_on_race_plan_submit_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stage_id uuid;v_result jsonb;
begin
 if lower(coalesce(new.status,'')) not in('submitted','locked','final','finalized','completed')
  or lower(coalesce(old.status,'')) in('submitted','locked','final','finalized','completed') then return new; end if;
 if not exists(select 1 from public.race_preparation_stage_plan_automation a where a.race_preparation_id=new.id
  and a.is_enabled=true and a.planner_role='u23_head_coach' and a.planner_staff_id is not null) then return new; end if;
 select rsp.stage_id into v_stage_id from public.race_stage_plans rsp where rsp.race_preparation_id=new.id and rsp.status='draft'
  and rsp.locked_at is null and rsp.submitted_at is null and rsp.stage_id is not null
  and rsp.stage_date>=public.get_current_game_date_date() order by rsp.stage_number,rsp.stage_date,rsp.id limit 1;
 if v_stage_id is null then return new; end if;
 begin
  v_result:=public.apply_u23_stage_plan_automation_v1(new.id,v_stage_id,'race_plan_submitted');
  update public.race_preparation_stage_plan_automation set last_generation_status=coalesce(v_result->>'status','race_plan_submitted_processed'),
   last_generation_summary=coalesce(v_result,'{}'::jsonb),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
   'race_plan_submit_hook_installed',true,'last_race_plan_submit_hook_at',clock_timestamp()),updated_at=now()
  where race_preparation_id=new.id;
 exception when others then
  update public.race_preparation_stage_plan_automation set last_generation_status='race_plan_submit_hook_error',
   last_generation_summary=jsonb_build_object('status','error','message',sqlerrm,'stage_id',v_stage_id),
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('race_plan_submit_hook_installed',true,
    'last_race_plan_submit_hook_at',clock_timestamp()),updated_at=now() where race_preparation_id=new.id;
 end;
 return new;
end;
$$;
drop trigger if exists trg_u23_stage_plan_on_race_plan_submit_v1 on public.race_preparations;
create trigger trg_u23_stage_plan_on_race_plan_submit_v1 after update of status on public.race_preparations
for each row execute function public.trg_u23_stage_plan_on_race_plan_submit_v1();

create or replace function public.trg_mark_u23_submit_hook_installed_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('race_plan_submit_hook_installed',true);return new;end;$$;
drop trigger if exists trg_mark_u23_submit_hook_installed_v1 on public.race_preparation_stage_plan_automation;
create trigger trg_mark_u23_submit_hook_installed_v1 before insert or update on public.race_preparation_stage_plan_automation
for each row execute function public.trg_mark_u23_submit_hook_installed_v1();
update public.race_preparation_stage_plan_automation
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('race_plan_submit_hook_installed',true),updated_at=now();

commit;
