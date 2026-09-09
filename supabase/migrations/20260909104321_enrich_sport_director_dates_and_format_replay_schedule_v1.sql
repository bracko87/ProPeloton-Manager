create or replace function public.staff_advisory_notification_game_date_label_v1(p_date date)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select format('Season %s, %s', extract(year from p_date)::int - 1999, to_char(p_date, 'DD.MM'));
$$;

create or replace function public.enrich_sport_director_startlist_notification_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type_code text;
  v_data jsonb;
  v_race_id uuid;
  v_club_id uuid;
  v_race_start date;
  v_race_end date;
  v_stage_date date;
  v_race_category text;
  v_next_future_race_id uuid;
  v_next_future_race_name text;
  v_next_future_race_start date;
  v_deadline_raw text;
  v_deadline_date date;
  v_deadline_display text;
begin
  if new.payload_json is null or jsonb_typeof(new.payload_json) <> 'object' then
    return new;
  end if;

  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT'
     or coalesce(new.payload_json ->> 'report_code', '') <> 'sd_startlist_deadline_alert' then
    return new;
  end if;

  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  begin
    v_race_id := nullif(v_data ->> 'next_race_id', '')::uuid;
  exception when others then
    v_race_id := null;
  end;

  begin
    v_club_id := nullif(new.payload_json ->> 'club_id', '')::uuid;
  exception when others then
    v_club_id := null;
  end;

  if v_race_id is not null then
    select r.start_date::date, r.end_date::date, r.category
      into v_race_start, v_race_end, v_race_category
    from public.races r
    where r.id = v_race_id;

    select min(rs.stage_date)::date
      into v_stage_date
    from public.race_stages rs
    where rs.race_id = v_race_id;
  end if;

  if v_club_id is not null and v_race_start is not null then
    select r2.id, r2.name, r2.start_date::date
      into v_next_future_race_id, v_next_future_race_name, v_next_future_race_start
    from public.race_team_entries rte2
    join public.races r2 on r2.id = rte2.race_id
    where rte2.club_id = v_club_id
      and rte2.status = 'accepted'
      and r2.start_date::date > v_race_start
    order by r2.start_date::date, r2.name, r2.id
    limit 1;
  end if;

  v_deadline_raw := nullif(v_data ->> 'rider_submission_deadline_on', '');
  if v_deadline_raw ~ '^\d{4}-\d{2}-\d{2}' then
    begin
      v_deadline_date := substring(v_deadline_raw from 1 for 10)::date;
    exception when others then
      v_deadline_date := null;
    end;
  end if;

  if v_deadline_date is not null then
    v_deadline_display := public.staff_advisory_notification_game_date_label_v1(v_deadline_date);
    v_data := v_data
      || jsonb_build_object(
        'rider_submission_deadline_on_raw', v_deadline_date::text,
        'rider_submission_deadline_on', v_deadline_display
      );
    if new.message is not null then
      new.message := replace(new.message, v_deadline_raw, v_deadline_display);
    end if;
  end if;

  if v_race_start is not null then
    v_data := v_data || jsonb_build_object(
      'race_start_date_raw', v_race_start::text,
      'race_start_date', public.staff_advisory_notification_game_date_label_v1(v_race_start)
    );
  end if;

  if v_race_end is not null then
    v_data := v_data || jsonb_build_object(
      'race_end_date_raw', v_race_end::text,
      'race_end_date', public.staff_advisory_notification_game_date_label_v1(v_race_end)
    );
  end if;

  if v_stage_date is not null then
    v_data := v_data || jsonb_build_object(
      'stage_date_raw', v_stage_date::text,
      'stage_date', public.staff_advisory_notification_game_date_label_v1(v_stage_date)
    );
  end if;

  if v_race_category is not null then
    v_data := v_data || jsonb_build_object('race_category', v_race_category);
  end if;

  if v_next_future_race_start is not null then
    v_data := v_data || jsonb_build_object(
      'next_future_race_id', v_next_future_race_id,
      'next_future_race_name', v_next_future_race_name,
      'next_future_race_start_date_raw', v_next_future_race_start::text,
      'next_future_race_start_date', public.staff_advisory_notification_game_date_label_v1(v_next_future_race_start)
    );
  end if;

  new.payload_json := jsonb_set(new.payload_json, '{data}', v_data, true);
  return new;
end;
$$;

drop trigger if exists trg_enrich_sport_director_startlist_notification_v1 on public.notifications;
create trigger trg_enrich_sport_director_startlist_notification_v1
before insert or update of payload_json on public.notifications
for each row execute function public.enrich_sport_director_startlist_notification_v1();

update public.notifications n
set payload_json = n.payload_json
from public.notification_types nt
where nt.id = n.type_id
  and nt.code = 'ADVISOR_SPORT_DIRECTOR_REPORT'
  and n.payload_json ->> 'report_code' = 'sd_startlist_deadline_alert';

update public.staff_advisory_reports ar
set report_json = n.payload_json,
    summary = n.message
from public.notifications n
where ar.notification_id = n.id
  and ar.report_code = 'sd_startlist_deadline_alert';

alter function public.get_universal_race_stage_replay_payload_v1(uuid)
  rename to get_universal_race_stage_replay_payload_v1_raw_20260909;

create or replace function public.get_universal_race_stage_replay_payload_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_raw text;
  v_match text[];
  v_year integer;
  v_display text;
begin
  v_payload := public.get_universal_race_stage_replay_payload_v1_raw_20260909(p_stage_id);
  v_raw := nullif(v_payload ->> 'replay_opens_game_at', '');

  if v_raw is not null then
    v_match := regexp_match(v_raw, '^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?');
    if v_match is not null then
      v_year := v_match[1]::integer;
      v_display := format(
        'Season %s, %s-%s, %s:%s:%s',
        greatest(1, v_year - 1999),
        v_match[2], v_match[3], v_match[4], v_match[5], coalesce(v_match[6], '00')
      );
      v_payload := jsonb_set(v_payload, '{replay_opens_game_at}', to_jsonb(v_display), true);
      v_payload := v_payload || jsonb_build_object('replay_opens_game_at_raw', v_raw);
    end if;
  end if;

  return v_payload;
end;
$$;

grant execute on function public.get_universal_race_stage_replay_payload_v1(uuid) to anon, authenticated, service_role;
