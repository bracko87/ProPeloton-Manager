-- National Team rider-pool metadata and regular January National Coach elections.

CREATE OR REPLACE FUNCTION public.get_my_national_team_squad_workspace_v1(p_cycle_key text DEFAULT 'season_main'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
  v_today date:=public.get_current_game_date_date();
  v_response_days integer:=7;
  v_target date;
  v_final_deadline date;
  v_selection public.national_team_selection_cycles%rowtype;
  v_squad public.national_team_squads%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    return jsonb_build_object(
      'allowed',false,
      'reason','not_active_national_coach'
    );
  end if;

  if v_cycle='' or char_length(v_cycle)>80 then
    raise exception 'Invalid National Team cycle key.';
  end if;

  select coalesce(callup_response_days,7)::integer
  into v_response_days
  from public.national_association_config
  where id=true;

  v_target:=private.national_team_selection_target_event_date_v1(v_ctx.season_number,v_cycle);
  v_final_deadline:=case
    when v_target is null then null
    else v_target-3
  end;

  insert into public.national_team_selection_cycles(
    association_id,season_number,cycle_key,status,selected_rider_ids,
    target_event_date,final_squad_deadline,created_by_user_id,updated_by_user_id
  )
  values(
    v_ctx.association_id,v_ctx.season_number,v_cycle,'draft','{}'::uuid[],
    v_target,v_final_deadline,v_uid,v_uid
  )
  on conflict(association_id,season_number,cycle_key) do update
  set target_event_date=excluded.target_event_date,
      final_squad_deadline=excluded.final_squad_deadline,
      updated_at=now();

  perform private.refresh_national_team_selection_cycle_v1(
    v_ctx.association_id,v_ctx.season_number,v_cycle
  );

  select * into v_selection
  from public.national_team_selection_cycles
  where association_id=v_ctx.association_id
    and season_number=v_ctx.season_number
    and cycle_key=v_cycle;

  select * into v_squad
  from public.national_team_squads
  where association_id=v_ctx.association_id
    and season_number=v_ctx.season_number
    and cycle_key=v_cycle
  limit 1;

  return jsonb_build_object(
    'allowed',true,
    'association_id',v_ctx.association_id,
    'country_code',v_ctx.country_code,
    'season_number',v_ctx.season_number,
    'cycle_key',v_cycle,
    'current_game_date',v_today,
    'timeline',jsonb_build_object(
      'target_event_date',v_selection.target_event_date,
      'recommended_selection_lock_date',
        case
          when v_selection.target_event_date is null then null
          else v_selection.target_event_date-(coalesce(v_response_days,7)*2)
        end,
      'callup_response_days',coalesce(v_response_days,7),
      'response_deadline',v_selection.response_deadline,
      'final_squad_deadline',v_selection.final_squad_deadline
    ),
    'selection',jsonb_build_object(
      'selection_id',v_selection.id,
      'status',v_selection.status,
      'selected_rider_ids',to_jsonb(v_selection.selected_rider_ids),
      'selected_count',coalesce(cardinality(v_selection.selected_rider_ids),0),
      'locked_on',v_selection.locked_on_game_date,
      'response_deadline',v_selection.response_deadline,
      'replacement_round',v_selection.replacement_round
    ),
    'callups',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'callup_id',c.id,
          'rider_id',c.rider_id,
          'rider_name',c.rider_name_snapshot,
          'club_id',c.club_id_snapshot,
          'club_name',c.club_name_snapshot,
          'club_owner_user_id',c.club_owner_user_id_snapshot,
          'status',c.status,
          'sent_on',c.sent_on_game_date,
          'response_deadline',c.response_deadline,
          'responded_on',c.responded_on_game_date,
          'selected',c.rider_id=any(v_selection.selected_rider_ids)
        )
        order by
          case c.status
            when 'accepted' then 0
            when 'auto_accepted' then 0
            when 'pending' then 1
            when 'declined' then 2
            else 3
          end,
          c.rider_name_snapshot
      )
      from public.national_team_callups c
      where c.association_id=v_ctx.association_id
        and c.season_number=v_ctx.season_number
        and c.cycle_key=v_cycle
    ),'[]'::jsonb),
    'squad',
      case
        when v_squad.id is null then null
        else jsonb_build_object(
          'squad_id',v_squad.id,
          'status',v_squad.status,
          'squad_size',v_squad.squad_size,
          'confirmed_on',v_squad.confirmed_on_game_date,
          'duty_start_date',v_squad.duty_start_date,
          'duty_end_date',v_squad.duty_end_date,
          'members',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'rider_id',m.rider_id,
                'rider_name',m.rider_name_snapshot,
                'club_id',m.club_id_snapshot,
                'club_name',m.club_name_snapshot,
                'squad_role',m.squad_role
              )
              order by m.rider_name_snapshot
            )
            from public.national_team_squad_members m
            where m.squad_id=v_squad.id
          ),'[]'::jsonb)
        )
      end,
    'riders',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rider_id',r.id,
          'rider_name',r.display_name,
          'image_url',r.image_url,
          'country_code',r.country_code,
          'role',r.role::text,
          'age_years',extract(year from age(v_today,r.birth_date))::integer,
          'club_id',r.club_id,
          'club_name',r.club_name,
          'club_country_code',(select c.country_code from public.clubs c where c.id=r.club_id),
          'club_is_ai',r.club_is_ai,
          'availability_status',r.availability_status,
          'fatigue',r.fatigue,
          'season_points',r.season_points_overall,
          'season_points_sprint',r.season_points_sprint,
          'season_points_climbing',r.season_points_climbing,
          'national_rank',rk.national_rank,
          'overall_range',jsonb_build_object(
            'min',lower(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_ctx.season_number
            )),
            'max',upper(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_ctx.season_number
            ))-1
          ),
          'skills',jsonb_build_object(
            'sprint',r.sprint,
            'climbing',r.climbing,
            'time_trial',r.time_trial,
            'endurance',r.endurance,
            'flat',r.flat,
            'recovery',r.recovery,
            'resistance',r.resistance,
            'race_iq',r.race_iq,
            'teamwork',r.teamwork
          ),
          'selection_scores',jsonb_build_object(
            'overall',
              round((
                r.flat*0.12+
                r.climbing*0.14+
                r.time_trial*0.12+
                r.sprint*0.10+
                r.endurance*0.14+
                r.recovery*0.10+
                r.resistance*0.10+
                r.race_iq*0.10+
                r.teamwork*0.08
              )::numeric,1),
            'flat',
              round((
                r.flat*0.35+
                r.sprint*0.20+
                r.endurance*0.20+
                r.race_iq*0.15+
                r.teamwork*0.10
              )::numeric,1),
            'climbing',
              round((
                r.climbing*0.40+
                r.endurance*0.25+
                r.recovery*0.15+
                r.race_iq*0.10+
                r.teamwork*0.10
              )::numeric,1),
            'time_trial',
              round((
                r.time_trial*0.45+
                r.flat*0.20+
                r.endurance*0.20+
                r.resistance*0.15
              )::numeric,1)
          ),
          'race_condition',jsonb_build_object(
            'race_sharpness',rc.race_sharpness,
            'last_raced_on',rc.last_raced_on,
            'race_days_last_14',rc.race_days_last_14
          ),
          'selected',r.id=any(v_selection.selected_rider_ids)
        )
        order by rk.national_rank nulls last,r.season_points_overall desc nulls last,r.display_name
      )
      from public.rider_statistics_page_view r
      left join public.rider_race_condition rc on rc.rider_id=r.id
      left join lateral (
        select p.national_rank
        from public.preview_national_ranking_v1(v_ctx.country_code,v_today) p
        where p.rider_id=r.id
        limit 1
      ) rk on true
      where upper(r.country_code)=v_ctx.country_code
    ),'[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_national_coach_election_v1(p_association_id uuid, p_season_number integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assoc public.national_associations%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_current_season integer;
  v_season integer;
  v_today date:=public.get_current_game_date_date();
  v_existing uuid;
  v_any_previous boolean:=false;
  v_kind text;
  v_reason text;
  v_registration_open date;
  v_registration_close date;
  v_round1_open date;
  v_round1_close date;
  v_id uuid;
  v_has_active_coach boolean:=false;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return null;
  end if;

  select season_number into v_current_season
  from public.game_state
  where id=true;

  if v_current_season is null then
    raise exception 'Game season is unavailable.';
  end if;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season<>v_current_season then
    raise exception 'National Coach elections can only be created for the current season.';
  end if;

  select e.id into v_existing
  from public.national_coach_elections e
  where e.association_id=p_association_id
    and e.season_number=v_season
    and e.status in ('candidate_registration','voting','runoff')
  order by e.created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  -- If this season already had a completed election, keep it as the season's
  -- settled result. The next regular election is prepared for January of the
  -- following season.
  select e.id into v_existing
  from public.national_coach_elections e
  where e.association_id=p_association_id
    and e.season_number=v_season
    and e.status='completed'
  order by e.completed_on_game_date desc nulls last,e.created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  select exists(
    select 1
    from public.national_coach_elections
    where association_id=p_association_id
  )
  into v_any_previous;

  if not v_any_previous then
    v_kind:='activation';
    v_reason:='first_association_coach_election';
    v_registration_open:=v_today;
    v_registration_close:=v_today+coalesce(v_cfg.activation_registration_days,10);
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+coalesce(v_cfg.activation_voting_days,10);
  else
    -- Keep the previous eligible coach only as caretaker during the January
    -- election. The annual election is still created and elects the new coach.
    perform public.carry_forward_national_coach_v1(p_association_id,v_season);

    select exists(
      select 1
      from public.national_coach_terms t
      where t.association_id=p_association_id
        and t.season_number=v_season
        and t.status='active'
        and private.national_association_member_is_eligible_v1(t.association_id,t.user_id)
    )
    into v_has_active_coach;

    v_registration_open:=public.game_date_from_parts(
      v_season,
      v_cfg.annual_registration_start_month,
      v_cfg.annual_registration_start_day
    );
    v_registration_close:=public.game_date_from_parts(
      v_season,
      v_cfg.annual_registration_close_month,
      v_cfg.annual_registration_close_day
    );
    v_round1_open:=v_registration_close;
    v_round1_close:=public.game_date_from_parts(
      v_season,
      v_cfg.annual_round1_close_month,
      v_cfg.annual_round1_close_day
    );

    -- Regular elections are opened in the agreed January registration window
    -- even when the previous coach is serving as caretaker.
    if v_today>=v_registration_open and v_today<=v_registration_close then
      v_kind:='annual';
      v_reason:='annual_january_election';
    elsif not v_has_active_coach then
      v_kind:='replacement';
      v_reason:='missing_coach_recovery';
      v_registration_open:=v_today;
      v_registration_close:=v_today+coalesce(v_cfg.activation_registration_days,10);
      v_round1_open:=v_registration_close;
      v_round1_close:=v_round1_open+coalesce(v_cfg.activation_voting_days,10);
    else
      return null;
    end if;
  end if;

  insert into public.national_coach_elections(
    association_id,season_number,election_kind,reason,status,
    registration_open_date,registration_close_date,
    round1_open_date,round1_close_date,current_round,
    current_round_open_date,current_round_close_date,
    runoff_registration_open
  )
  values(
    p_association_id,v_season,v_kind,v_reason,'candidate_registration',
    v_registration_open,v_registration_close,
    v_round1_open,v_round1_close,1,
    v_round1_open,v_round1_close,false
  )
  returning id into v_id;

  return v_id;
end;
$function$;
