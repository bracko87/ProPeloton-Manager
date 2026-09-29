create or replace function public.staff_advisory_format_game_dates_in_text_v2(
  p_text text,
  p_current_game_date date
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_result text := p_text;
  v_match text[];
  v_raw text;
  v_date date;
begin
  if p_text is null or btrim(p_text) = '' or p_current_game_date is null then
    return p_text;
  end if;

  for v_match in
    select regexp_matches(p_text, '([0-9]{4}-[0-9]{2}-[0-9]{2})', 'g')
  loop
    v_raw := v_match[1];
    begin
      v_date := v_raw::date;
    exception when others then
      continue;
    end;

    if abs(v_date - p_current_game_date) <= 400 then
      v_result := replace(
        v_result,
        v_raw,
        public.staff_advisory_notification_game_date_label_v1(v_date)
      );
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function public.enrich_sport_director_notification_context_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type_code text;
  v_report_code text;
  v_data jsonb;
  v_club_id uuid;
  v_race_id uuid;
  v_race_id_text text;
  v_stage_id uuid;
  v_stage_id_text text;
  v_current_game_date date;
  v_race_name text;
  v_race_start date;
  v_race_end date;
  v_race_category text;
  v_country_code text;
  v_host_city text;
  v_race_location text;
  v_prep_id uuid;
  v_prep_status text;
  v_startlist_status text;
  v_deadline date;
  v_stage_number integer;
  v_stage_date date;
  v_stage_start_label text;
  v_next_race_id uuid;
  v_next_race_name text;
  v_next_race_start date;
  v_management_count integer;
  v_missing_count integer := 0;
  v_problem_count integer := 0;
  v_summary text;
  v_recommendations jsonb;
  v_race_days integer;
begin
  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT' then
    return new;
  end if;

  v_report_code := coalesce(new.payload_json ->> 'report_code', '');
  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  begin
    v_club_id := nullif(new.payload_json ->> 'club_id', '')::uuid;
  exception when others then
    v_club_id := null;
  end;

  begin
    if coalesce(v_data ->> 'current_game_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_current_game_date := (v_data ->> 'current_game_date')::date;
    else
      v_current_game_date := null;
    end if;
  exception when others then
    v_current_game_date := null;
  end;

  v_race_id_text := coalesce(
    nullif(v_data ->> 'current_focus_race_id', ''),
    nullif(v_data ->> 'race_id', ''),
    nullif(v_data ->> 'next_race_id', ''),
    nullif(v_data ->> 'active_race_id', ''),
    nullif(v_data ->> 'next_future_race_id', '')
  );

  if v_race_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_race_id := v_race_id_text::uuid;
  end if;

  if v_race_id is not null then
    select r.name, r.start_date, r.end_date, r.category, r.country_code, r.host_city
      into v_race_name, v_race_start, v_race_end, v_race_category, v_country_code, v_host_city
    from public.races r
    where r.id = v_race_id;

    if v_race_name is not null then
      v_race_location := case
        when nullif(btrim(v_host_city), '') is not null and nullif(btrim(v_country_code), '') is not null
          then btrim(v_host_city) || ', ' || upper(btrim(v_country_code))
        when nullif(btrim(v_host_city), '') is not null then btrim(v_host_city)
        when nullif(btrim(v_country_code), '') is not null then upper(btrim(v_country_code))
        else null
      end;

      v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
        'race_id', v_race_id,
        'race_name', v_race_name,
        'race_start_date', v_race_start,
        'race_end_date', v_race_end,
        'race_category', v_race_category,
        'country_code', v_country_code,
        'race_location', v_race_location
      ));

      if v_current_game_date is not null and v_race_start is not null then
        v_race_days := v_race_start - v_current_game_date;
        v_data := v_data || jsonb_build_object(
          'race_urgency',
          case
            when v_race_days < 0 and v_current_game_date <= coalesce(v_race_end, v_race_start) then 'active'
            when v_race_days < 0 then 'completed'
            when v_race_days = 0 then 'today'
            when v_race_days = 1 then 'tomorrow'
            else format('in %s days', v_race_days)
          end
        );
      end if;
    end if;

    if v_club_id is not null then
      select rp.id, rp.status, rp.startlist_status, rp.rider_submission_deadline_on
        into v_prep_id, v_prep_status, v_startlist_status, v_deadline
      from public.race_preparations rp
      where rp.race_id = v_race_id
        and (rp.club_id = v_club_id or rp.participating_club_id = v_club_id)
      order by rp.updated_at desc nulls last, rp.created_at desc nulls last
      limit 1;

      if v_prep_id is not null then
        v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
          'race_preparation_id', v_prep_id,
          'race_preparation_status', v_prep_status,
          'preparation_status', v_prep_status,
          'startlist_status', v_startlist_status,
          'rider_submission_deadline_on', v_deadline
        ));
      end if;
    end if;

    v_stage_id_text := coalesce(
      nullif(v_data ->> 'stage_id', ''),
      nullif(v_data #>> '{next_missing_stage,stage_id}', ''),
      nullif(v_data #>> '{next_problem_stage,stage_id}', ''),
      nullif(v_data #>> '{missing_stage_details,0,stage_id}', ''),
      nullif(v_data #>> '{problem_stage_details,0,stage_id}', '')
    );

    if v_stage_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_stage_id := v_stage_id_text::uuid;
    end if;

    if v_stage_id is not null then
      select rs.stage_number, rs.stage_date, rs.planned_start_time_label
        into v_stage_number, v_stage_date, v_stage_start_label
      from public.race_stages rs
      where rs.id = v_stage_id;
    elsif v_report_code in (
      'sd_stage_plans_missing',
      'sd_stage_plans_incomplete',
      'sd_startlist_deadline_alert',
      'sd_race_preparation_missing',
      'sd_race_eligibility_critical'
    ) then
      select rs.id, rs.stage_number, rs.stage_date, rs.planned_start_time_label
        into v_stage_id, v_stage_number, v_stage_date, v_stage_start_label
      from public.race_stages rs
      where rs.race_id = v_race_id
      order by
        case when v_current_game_date is not null and rs.stage_date >= v_current_game_date then 0 else 1 end,
        rs.stage_date,
        rs.stage_number
      limit 1;
    end if;

    if v_stage_date is not null then
      v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
        'stage_id', v_stage_id,
        'stage_number', v_stage_number,
        'stage_date', v_stage_date,
        'stage_start_time_label', v_stage_start_label
      ));
    end if;

    if v_club_id is not null and v_race_start is not null then
      select r2.id, r2.name, r2.start_date
        into v_next_race_id, v_next_race_name, v_next_race_start
      from public.race_team_entries rte2
      join public.races r2 on r2.id = rte2.race_id
      where rte2.club_id = v_club_id
        and rte2.status = 'accepted'
        and r2.id <> v_race_id
        and r2.start_date > coalesce(v_race_end, v_race_start)
      order by r2.start_date, r2.name, r2.id
      limit 1;

      if v_next_race_id is not null then
        v_data := v_data || jsonb_build_object(
          'next_future_race_id', v_next_race_id,
          'next_future_race_name', v_next_race_name,
          'next_future_race_start_date', v_next_race_start
        );
      else
        v_data := v_data
          - 'next_future_race_id'
          - 'next_future_race_name'
          - 'next_future_race_start_date';
      end if;
    end if;
  end if;

  if jsonb_typeof(v_data -> 'missing_stage_details') = 'array' then
    v_missing_count := jsonb_array_length(v_data -> 'missing_stage_details');
  elsif coalesce(v_data ->> 'actionable_missing_stage_plans', '') ~ '^\d+$' then
    v_missing_count := (v_data ->> 'actionable_missing_stage_plans')::integer;
  elsif coalesce(v_data ->> 'missing_stage_plans', '') ~ '^\d+$' then
    v_missing_count := (v_data ->> 'missing_stage_plans')::integer;
  end if;

  if jsonb_typeof(v_data -> 'problem_stage_details') = 'array' then
    v_problem_count := jsonb_array_length(v_data -> 'problem_stage_details');
  elsif coalesce(v_data ->> 'actionable_problem_stage_plans', '') ~ '^\d+$' then
    v_problem_count := (v_data ->> 'actionable_problem_stage_plans')::integer;
  elsif coalesce(v_data ->> 'problem_stage_plans', '') ~ '^\d+$' then
    v_problem_count := (v_data ->> 'problem_stage_plans')::integer;
  end if;

  if coalesce(v_data ->> 'management_priority_count', '') ~ '^\d+$' then
    v_management_count := (v_data ->> 'management_priority_count')::integer;
  elsif jsonb_typeof(new.payload_json -> 'management_priorities') = 'array' then
    v_management_count := jsonb_array_length(new.payload_json -> 'management_priorities');
  elsif v_report_code in ('sd_stage_plans_missing','sd_stage_plans_incomplete') then
    v_management_count := v_missing_count + v_problem_count;
  elsif v_report_code in ('sd_startlist_deadline_alert','sd_race_preparation_missing','sd_race_eligibility_critical','sd_race_programme_gap') then
    v_management_count := 1;
  else
    v_management_count := 0;
  end if;

  v_data := v_data || jsonb_build_object('management_priority_count', v_management_count);

  new.payload_json := jsonb_set(
    coalesce(new.payload_json, '{}'::jsonb),
    '{data}',
    v_data,
    true
  );

  v_summary := nullif(new.payload_json ->> 'summary', '');
  if v_summary is not null then
    v_summary := public.staff_advisory_format_game_dates_in_text_v2(v_summary, v_current_game_date);
    new.payload_json := jsonb_set(new.payload_json, '{summary}', to_jsonb(v_summary), true);
    new.message := v_summary;
  end if;

  if jsonb_typeof(new.payload_json -> 'recommendations') = 'array' then
    select jsonb_agg(
      to_jsonb(public.staff_advisory_format_game_dates_in_text_v2(value, v_current_game_date))
      order by ord
    )
    into v_recommendations
    from jsonb_array_elements_text(new.payload_json -> 'recommendations') with ordinality as x(value, ord);

    if v_recommendations is not null then
      new.payload_json := jsonb_set(new.payload_json, '{recommendations}', v_recommendations, true);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enrich_sport_director_startlist_notification_v1 on public.notifications;
drop trigger if exists trg_enrich_sport_director_notification_context_v2 on public.notifications;
create trigger trg_enrich_sport_director_notification_context_v2
before insert or update of payload_json on public.notifications
for each row execute function public.enrich_sport_director_notification_context_v2();

update public.notifications n
set payload_json = n.payload_json
from public.notification_types nt
where nt.id = n.type_id
  and nt.code = 'ADVISOR_SPORT_DIRECTOR_REPORT';

update public.staff_advisory_reports ar
set report_json = n.payload_json,
    summary = n.message
from public.notifications n
where ar.notification_id = n.id
  and n.payload_json ->> 'advisor_role' = 'sport_director';