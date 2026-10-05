
create or replace function public.update_my_youth_academy_settings_v3(
  p_recruitment_decider text default null,
  p_race_entry_decider text default null,
  p_race_squad_decider text default null,
  p_camp_decider text default null,
  p_equipment_decider text default null,
  p_recruitment_negotiation_decider text default null,
  p_scouting_range text default null,
  p_season_budget bigint default null,
  p_auto_recruit_min_band text default null,
  p_auto_recruit_max_stipend_weekly integer default null,
  p_auto_recruit_max_compensation bigint default null,
  p_auto_recruit_min_free_slots smallint default null,
  p_training_decider text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_training_decider is not null
     and p_training_decider not in ('manager','u16_head_coach') then
    raise exception 'Invalid Youth Academy training responsibility';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated';
  end if;

  if p_training_decider is not null then
    update public.youth_academy_settings
    set training_decider=p_training_decider,
        updated_at=now()
    where academy_id=v_academy_id;
  end if;

  return public.update_my_youth_academy_settings_v2(
    p_recruitment_decider,
    p_race_entry_decider,
    p_race_squad_decider,
    p_camp_decider,
    p_equipment_decider,
    p_recruitment_negotiation_decider,
    p_scouting_range,
    p_season_budget,
    p_auto_recruit_min_band,
    p_auto_recruit_max_stipend_weekly,
    p_auto_recruit_max_compensation,
    p_auto_recruit_min_free_slots
  );
end;
$function$;

revoke all on function public.update_my_youth_academy_settings_v3(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint,text
) from public,anon;
grant execute on function public.update_my_youth_academy_settings_v3(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint,text
) to authenticated;
