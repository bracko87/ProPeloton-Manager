CREATE OR REPLACE FUNCTION public.get_my_youth_graduations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then return '[]'::jsonb; end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',g.id,
      'youth_rider_id',r.id,
      'rider_name',r.display_name,
      'country_code',r.country_code,
      'role',r.role,
      'assessment_band',private.youth_potential_band_v1(r.hidden_potential),
      'became_eligible_on',g.became_eligible_on,
      'decision',g.decision,
      'pathway_expires_on',g.pathway_expires_on,
      'completed_on',g.completed_on,
      'professional_rider_id',g.professional_rider_id,
      'has_developing_team',exists(
        select 1 from public.clubs d
        join public.developing_team_season_access dsa
          on dsa.developing_club_id=d.id
        where d.parent_club_id=g.main_club_id
          and d.club_type='developing'
          and d.deleted_at is null and d.is_active
          and dsa.access_status='active' and dsa.expires_after_season>=coalesce(public.get_current_season_number(),1)
          and dsa.active_season=coalesce(public.get_current_season_number(),1)
      ),
      'developing_team_free_slots',coalesce((
        select greatest(0,10-count(*))::integer
        from public.clubs d
        left join public.club_riders cr on cr.club_id=d.id
        where d.parent_club_id=g.main_club_id
          and d.club_type='developing'
          and d.deleted_at is null
        group by d.id
        order by d.created_at asc
        limit 1
      ),0)
    ) order by g.completed_on nulls first,g.became_eligible_on desc),'[]'::jsonb)
    from public.youth_graduation_records g
    join public.youth_riders r on r.id=g.youth_rider_id
    where g.academy_id=v_academy_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.complete_youth_graduation_v1(p_youth_rider_id uuid, p_destination text, p_game_date date, p_actor text DEFAULT 'system'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_youth public.youth_riders%rowtype;
  v_academy public.youth_academies%rowtype;
  v_record public.youth_graduation_records%rowtype;
  v_professional_id uuid;
  v_developing_club_id uuid;
  v_salary integer;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_academy_name text;
begin
  if p_destination not in ('developing_team','release') then
    raise exception 'Unsupported Youth graduation destination';
  end if;

  select * into v_youth
  from public.youth_riders where id=p_youth_rider_id for update;
  if v_youth.id is null then raise exception 'Youth rider not found'; end if;

  select * into v_academy from public.youth_academies where id=v_youth.academy_id;
  select c.name into v_academy_name from public.clubs c where c.id=v_academy.club_id;

  insert into public.youth_graduation_records(
    youth_rider_id,academy_id,main_club_id,became_eligible_on,decision,metadata
  )
  values(
    p_youth_rider_id,v_academy.id,v_academy.club_id,p_game_date,'pending',
    jsonb_build_object(
      'academy_name',v_academy_name,
      'academy_member_from',v_youth.joined_game_date,
      'academy_member_until',p_game_date,
      'history_note','Youth Academy member'
    )
  )
  on conflict(youth_rider_id) do update
  set metadata=public.youth_graduation_records.metadata||excluded.metadata,
      updated_at=now();

  select * into v_record
  from public.youth_graduation_records
  where youth_rider_id=p_youth_rider_id
  for update;

  if v_record.completed_on is not null then return v_record.professional_rider_id; end if;

  v_professional_id:=private.create_professional_rider_from_youth_v1(p_youth_rider_id);

  if p_destination='developing_team' then
    select d.id into v_developing_club_id
    from public.clubs d
    where d.parent_club_id=v_academy.club_id
      and d.club_type='developing'
      and d.deleted_at is null
      and d.is_active
      and exists(select 1 from public.developing_team_season_access access_row
        where access_row.developing_club_id=d.id and access_row.access_status='active'
        and access_row.active_season=coalesce(public.get_current_season_number(),1)
        and access_row.expires_after_season>=coalesce(public.get_current_season_number(),1))
    order by d.created_at asc
    limit 1;

    if v_developing_club_id is null then
      raise exception 'An active Developing Team is required for this graduation route.';
    end if;

    if (
      select count(*) from public.club_riders cr
      where cr.club_id=v_developing_club_id
    )>=10 then
      raise exception 'Developing Team roster is full (10 riders).';
    end if;

    insert into public.club_riders(club_id,rider_id,assigned_role)
    values(
      v_developing_club_id,v_professional_id,
      private.youth_main_rider_role_v1(v_youth.role)
    );

    v_salary:=public.calculate_developing_rider_weekly_salary_v1(v_professional_id);

    update public.riders
    set salary=v_salary,
        contract_expires_at=public.get_game_date_for_season_end(v_season),
        contract_expires_season=v_season
    where id=v_professional_id;

    insert into public.rider_contracts(
      rider_id,club_id,salary_weekly,starts_on,expires_on,duration_seasons,
      status,start_season_number,end_season_number,notes_json
    )
    values(
      v_professional_id,v_developing_club_id,v_salary,p_game_date,
      public.get_game_date_for_season_end(v_season),1,'active',
      v_season,v_season,
      jsonb_build_object(
        'source','youth_academy_graduation',
        'youth_rider_id',p_youth_rider_id,
        'academy_name',v_academy_name
      )
    );

    update public.youth_riders
    set status='graduated',updated_at=now()
    where id=p_youth_rider_id;

    update public.youth_graduation_records
    set decision='developing_team',decided_on=p_game_date,
        professional_rider_id=v_professional_id,
        destination_club_id=v_developing_club_id,
        completed_on=p_game_date,
        metadata=metadata||jsonb_build_object(
          'actor',p_actor,'destination','developing_team',
          'academy_name',v_academy_name,
          'academy_member_until',p_game_date
        ),
        updated_at=now()
    where youth_rider_id=p_youth_rider_id;
  else
    v_salary:=public.calculate_developing_rider_weekly_salary_v1(v_professional_id);

    insert into public.rider_free_agents(
      rider_id,source_type,source_club_id,desired_tier,
      expected_salary_weekly,min_acceptable_salary_weekly,
      preferred_duration_seasons,available_from_game_date,
      expires_on_game_date,status
    )
    values(
      v_professional_id,'released',v_academy.club_id,'continental',
      v_salary,greatest(250,round(v_salary*0.85)::integer),1,p_game_date,
      p_game_date+90,'available'
    );

    update public.youth_riders
    set status='released',updated_at=now()
    where id=p_youth_rider_id;

    update public.youth_graduation_records
    set decision='release',decided_on=p_game_date,
        professional_rider_id=v_professional_id,
        destination_club_id=null,
        completed_on=p_game_date,
        metadata=metadata||jsonb_build_object(
          'actor',p_actor,'destination','free_agent',
          'free_agent_source_type','released',
          'academy_name',v_academy_name,
          'academy_member_until',p_game_date,
          'history_note','Youth Academy member released to Free Agents at age 16'
        ),
        updated_at=now()
    where youth_rider_id=p_youth_rider_id;
  end if;

  update public.youth_rider_agreements
  set status='ended',updated_at=now()
  where youth_rider_id=p_youth_rider_id and status='active';

  return v_professional_id;
end;
$function$;
