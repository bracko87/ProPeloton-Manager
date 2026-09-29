begin;

-- Equipment-specific Premium templates were removed from the product.
-- Retire any stale user data first so the tightened constraints can be applied safely.
delete from public.premium_manager_automation_rules_v1 r
using public.premium_manager_templates_v1 t
where r.template_id = t.id
  and (r.rule_type = 'equipment_prefill' or t.template_type = 'equipment');

delete from public.premium_manager_automation_rules_v1
where rule_type = 'equipment_prefill';

delete from public.premium_manager_templates_v1
where template_type = 'equipment';

alter table public.premium_manager_templates_v1
  drop constraint if exists premium_manager_templates_type_chk;

alter table public.premium_manager_templates_v1
  add constraint premium_manager_templates_type_chk
  check (template_type in (
    'race_strategy',
    'training',
    'financial_scenario',
    'season_plan'
  ));

alter table public.premium_manager_automation_rules_v1
  drop constraint if exists premium_manager_automation_type_chk;

alter table public.premium_manager_automation_rules_v1
  add constraint premium_manager_automation_type_chk
  check (rule_type in ('strategy_prefill','training_prefill'));

create or replace function public.premium_save_template_v1(
  p_club_id uuid,
  p_template_id uuid,
  p_template_type text,
  p_name text,
  p_payload_json jsonb,
  p_is_default boolean default false
)
returns public.premium_manager_templates_v1
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_id uuid;
  v_row public.premium_manager_templates_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_template_type not in ('race_strategy','training','financial_scenario','season_plan') then
    raise exception 'Unsupported template type.' using errcode='22023';
  end if;

  if nullif(btrim(p_name),'') is null then
    raise exception 'Template name is required.' using errcode='22023';
  end if;

  if coalesce(p_is_default,false) then
    update public.premium_manager_templates_v1
    set is_default=false, updated_at=now()
    where club_id=p_club_id
      and user_id=auth.uid()
      and template_type=p_template_type;
  end if;

  if p_template_id is null then
    insert into public.premium_manager_templates_v1(
      club_id,user_id,template_type,name,payload_json,is_default
    )
    values(
      p_club_id,auth.uid(),p_template_type,btrim(p_name),
      coalesce(p_payload_json,'{}'::jsonb),coalesce(p_is_default,false)
    )
    returning id into v_id;
  else
    update public.premium_manager_templates_v1
    set
      template_type=p_template_type,
      name=btrim(p_name),
      payload_json=coalesce(p_payload_json,'{}'::jsonb),
      is_default=coalesce(p_is_default,false),
      updated_at=now()
    where id=p_template_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Template not found.' using errcode='P0002';
    end if;
  end if;

  select *
  into v_row
  from public.premium_manager_templates_v1
  where id=v_id;

  return v_row;
end;
$$;

create or replace function public.premium_save_automation_rule_v1(
  p_club_id uuid,
  p_rule_id uuid,
  p_rule_type text,
  p_name text,
  p_template_id uuid,
  p_match_json jsonb,
  p_is_enabled boolean default true
)
returns public.premium_manager_automation_rules_v1
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_id uuid;
  v_template_type text;
  v_row public.premium_manager_automation_rules_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_rule_type not in ('strategy_prefill','training_prefill') then
    raise exception 'Unsupported automation rule type.' using errcode='22023';
  end if;

  select t.template_type
  into v_template_type
  from public.premium_manager_templates_v1 t
  where t.id=p_template_id
    and t.club_id=p_club_id
    and t.user_id=auth.uid();

  if v_template_type is null then
    raise exception 'Template not found.' using errcode='P0002';
  end if;

  if (p_rule_type='strategy_prefill' and v_template_type<>'race_strategy')
     or (p_rule_type='training_prefill' and v_template_type<>'training') then
    raise exception 'Automation rule and template type do not match.' using errcode='22023';
  end if;

  if p_rule_id is null then
    insert into public.premium_manager_automation_rules_v1(
      club_id,user_id,rule_type,name,template_id,match_json,is_enabled
    )
    values(
      p_club_id,auth.uid(),p_rule_type,btrim(p_name),p_template_id,
      coalesce(p_match_json,'{}'::jsonb),coalesce(p_is_enabled,true)
    )
    returning id into v_id;
  else
    update public.premium_manager_automation_rules_v1
    set
      rule_type=p_rule_type,
      name=btrim(p_name),
      template_id=p_template_id,
      match_json=coalesce(p_match_json,'{}'::jsonb),
      is_enabled=coalesce(p_is_enabled,true),
      updated_at=now()
    where id=p_rule_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Automation rule not found.' using errcode='P0002';
    end if;
  end if;

  select *
  into v_row
  from public.premium_manager_automation_rules_v1
  where id=v_id;

  return v_row;
end;
$$;

commit;
