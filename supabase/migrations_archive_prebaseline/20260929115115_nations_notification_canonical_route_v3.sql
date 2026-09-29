-- Keep every World Nations notification action on the canonical /dashboard/world-nations route.

create or replace function private.trg_notify_nations_round_draw_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item record;
begin
  if new.status='drawn'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    for v_item in
      select distinct
        ce.association_id,
        ce.country_code,
        g.group_label,
        g.planned_advance_count
      from public.nations_competition_groups g
      join public.nations_group_entries nge on nge.group_id=g.id
      join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
      where g.round_id=new.id
    loop
      perform private.notify_national_association_members_v1(
        v_item.association_id,
        'NATIONS_QUALIFICATION_DRAW',
        new.round_label||' draw confirmed',
        v_item.country_code||' has been drawn into '||v_item.group_label||
          '. '||v_item.planned_advance_count||' nation(s) advance from this group.',
        '/dashboard/world-nations',
        jsonb_build_object(
          'round_id',new.id,
          'round_label',new.round_label,
          'round_type',new.round_type,
          'group_label',v_item.group_label,
          'country_code',v_item.country_code,
          'advance_count',v_item.planned_advance_count
        ),
        'nations-draw:'||new.id::text||':'||v_item.association_id::text
      );
    end loop;
  end if;
  return new;
end;
$function$;

create or replace function private.trg_notify_nations_group_entry_outcome_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_round record;
  v_entry record;
  v_type text;
  v_title text;
  v_message text;
begin
  if tg_op<>'UPDATE'
     or old.status is not distinct from new.status
     or new.status not in ('advanced','eliminated') then
    return new;
  end if;

  select r.round_type,r.round_label,g.group_label
  into v_round
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  where g.id=new.group_id;

  if v_round.round_type='world_final' then
    return new;
  end if;

  select ce.association_id,ce.country_code,a.name as association_name
  into v_entry
  from public.nations_competition_entries ce
  join public.national_associations a on a.id=ce.association_id
  where ce.id=new.competition_entry_id;

  if new.status='advanced' and v_round.round_type='final_qualification' then
    v_type:='NATIONS_WORLD_FINAL_QUALIFIED';
    v_title:='Qualified for the World Nations Final';
    v_message:=v_entry.country_code||' has qualified for the 16-nation World Nations Final.';
  elsif new.status='advanced' then
    v_type:='NATIONS_ADVANCED';
    v_title:='Advanced in the World Nations Championship';
    v_message:=v_entry.country_code||' has advanced from '||v_round.round_label||'.';
  else
    v_type:='NATIONS_ELIMINATED';
    v_title:='World Nations Championship run ended';
    v_message:=v_entry.country_code||' has been eliminated in '||v_round.round_label||'.';
  end if;

  perform private.notify_national_association_members_v1(
    v_entry.association_id,
    v_type,
    v_title,
    v_message,
    '/dashboard/world-nations',
    jsonb_build_object(
      'group_entry_id',new.id,
      'round_type',v_round.round_type,
      'round_label',v_round.round_label,
      'group_label',v_round.group_label,
      'country_code',v_entry.country_code,
      'final_group_rank',new.final_group_rank,
      'total_points',new.total_points,
      'ttt_points',new.ttt_points,
      'flat_points',new.flat_points,
      'mountain_points',new.mountain_points
    ),
    'nations-outcome:'||new.id::text||':'||new.status
  );

  return new;
end;
$function$;
