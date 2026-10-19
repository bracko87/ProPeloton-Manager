-- Safely separate six legacy Association technical identities from ordinary
-- AI clubs. Preserve all historical ordinary race results and current AI rosters.
-- Only upcoming draft Nations competition data is rekeyed as one transaction.
do $migration$
declare
  v_def text;
  v_start integer;
  v_end integer;
  v_row record;
  v_count integer;
begin
  create temporary table pg_temp.na_identity_split_v1 on commit drop as
  select i.association_id, i.technical_club_id as old_club_id,
         gen_random_uuid() as new_club_id,
         upper(i.country_code) as country_code,
         upper(i.country_code)||' National Association Selection' as new_name
  from public.national_association_race_team_identities i
  where i.identity_source='existing_national_team_pool';

  select count(*) into v_count from pg_temp.na_identity_split_v1;
  if v_count > 6 then
    raise exception 'Unexpectedly large National Association identity migration: %', v_count;
  end if;

  if exists (
    select 1
    from public.race_team_entries e
    join pg_temp.na_identity_split_v1 m on e.club_id=m.old_club_id
    join public.races r on r.id=e.race_id
    join public.nations_group_events ng on ng.race_id=r.id
    where e.entry_source='national_team'
      and (r.status not in ('draft','scheduled') or
           r.start_date <= public.get_current_game_date_date())
  ) then
    raise exception 'National Association identity migration is unsafe: non-future event exists';
  end if;

  if exists (
    select 1 from public.race_stage_results sr
    join public.race_stages st on st.id=sr.stage_id
    join public.race_team_entries e on e.race_id=st.race_id
    join pg_temp.na_identity_split_v1 m on m.old_club_id=e.club_id
    where e.entry_source='national_team'
  ) then
    raise exception 'National Association competition results already exist';
  end if;

  insert into public.clubs(
    id,owner_user_id,name,country_code,primary_color,secondary_color,logo_path,
    motto,crest_style,world_tier,reputation,cash_balance,club_tier,
    amateur_division,season_points,is_ai,is_active,club_type,
    created_game_date,inactivity_status,inactive_ai_controlled
  )
  select m.new_club_id,null,m.new_name,m.country_code,'#1D4ED8','#FACC15',
    'https://flagcdn.com/w160/'||lower(m.country_code)||'.png',
    'National Association Selection',null,3,0,0,'amateur'::public.club_tier,
    coalesce(public.safe_get_amateur_division_for_country(m.country_code),'INTERNATIONAL'),
    0,true,false,'main',public.get_current_game_date_date(),'active',false
  from pg_temp.na_identity_split_v1 m;

  -- All Nations-competition references refer to association IDs externally.
  -- Their future technical race / prep / snapshot rows are migrated together.
  update public.race_participant_riders p
  set team_id=m.new_club_id,team_name_snapshot=m.new_name
  from pg_temp.na_identity_split_v1 m
  where p.team_id=m.old_club_id
    and exists(
      select 1 from public.nations_group_events ng
      join public.race_team_entries e on e.race_id=ng.race_id
      where ng.race_id=p.race_id and e.club_id=m.old_club_id
        and e.entry_source='national_team'
    );

  update public.race_team_entries e
  set club_id=m.new_club_id,participating_club_id=m.new_club_id,
      updated_at=now()
  from pg_temp.na_identity_split_v1 m
  where e.club_id=m.old_club_id
    and e.entry_source='national_team'
    and exists(select 1 from public.nations_group_events ng
               where ng.race_id=e.race_id);

  update public.race_participant_teams pt
  set team_id=m.new_club_id,team_name_snapshot=m.new_name
  from pg_temp.na_identity_split_v1 m
  where pt.team_id=m.old_club_id
    and exists(
      select 1 from public.nations_group_events ng
      join public.race_team_entries e on e.race_id=ng.race_id
      where ng.race_id=pt.race_id and e.club_id=m.new_club_id
        and e.entry_source='national_team'
    );

  update public.race_preparations pr
  set club_id=m.new_club_id
  from pg_temp.na_identity_split_v1 m
  where pr.club_id=m.old_club_id
    and exists (
      select 1 from public.nations_group_events ng
      join public.race_team_entries e on e.race_id=ng.race_id
      where ng.race_id=pr.race_id and e.club_id=m.new_club_id
        and e.entry_source='national_team'
    );

  update public.national_association_race_team_identities i
  set technical_club_id=m.new_club_id,
      identity_source='generated_hidden_national_team',
      updated_at=now()
  from pg_temp.na_identity_split_v1 m
  where i.association_id=m.association_id
    and i.technical_club_id=m.old_club_id;

  -- Give the new association selection its own configured jersey and gear.
  for v_row in select * from pg_temp.na_identity_split_v1 loop
    perform private.ensure_national_team_standard_presets_v1(v_row.new_club_id);
    perform private.ensure_national_team_standard_cars_v1(v_row.new_club_id);
    perform private.sync_national_association_identity_v1(v_row.association_id);
  end loop;

  -- Future national associations must NEVER reuse an existing AI roster ID.
  select pg_get_functiondef(
    'private.ensure_national_association_race_team_v1(uuid)'::regprocedure)
    into v_def;
  v_start := strpos(v_def,'  select c.id into v_club_id');
  v_end := strpos(v_def,'  if v_club_id is null then');
  if v_start=0 or v_end<=v_start then
    raise exception 'National Association allocator version not recognized';
  end if;
  v_def := substr(v_def,1,v_start-1)
    || '  -- Independent association identity: never reuse ordinary AI club.' || E'\n'
    || '  v_club_id := null;' || E'\n\n'
    || substr(v_def,v_end);
  v_def := replace(v_def,
    'v_name:=upper(v_assoc.country_code)||'' National Team'';',
    'v_name:=upper(v_assoc.country_code)||'' National Association Selection'';');
  execute v_def;

  if exists (
    select 1 from public.national_association_race_team_identities
    where identity_source='existing_national_team_pool'
  ) then raise exception 'A shared identity remains'; end if;
end $migration$;
