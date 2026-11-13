-- Sponsor goal progress and payouts never include national/individual/nations-only races.
-- Read-only count functions and race event processors share the club-race eligibility helper.
-- This migration never changes historic sponsor payouts or competition results.

-- public.sponsor_process_objectives_for_race_v1(uuid,boolean)
CREATE OR REPLACE FUNCTION public.sponsor_process_objectives_for_race_v1(p_race_id uuid, p_force_evaluation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_race public.races%rowtype;
  v_objective record;
  v_eval_result jsonb;
  v_pay_result jsonb;
  v_results jsonb := '[]'::jsonb;

  v_processed integer := 0;
  v_checked integer := 0;
  v_waiting integer := 0;
  v_failed integer := 0;
  v_completed integer := 0;
  v_paid integer := 0;
  v_payment_skipped integer := 0;
  v_total_paid bigint := 0;

  v_current_game_date date;
begin
  if p_race_id is null then
    raise exception 'Race id is required.';
  end if;

  select *
  into v_race
  from public.races r
  where r.id = p_race_id;

  if not found then
    raise exception 'Race not found.';
  end if;

  if not public.sponsor_race_allowed_for_club_objective_v1(p_race_id) then
    return jsonb_build_object(
      'status','skipped','reason','national_or_individual_event',
      'race_id',p_race_id,'processed',0
    );
  end if;

  v_current_game_date := public.get_current_game_date_safe_v1();

  for v_objective in
    select
      o.id as objective_id,
      o.club_sponsor_id,
      o.reward_amount,
      o.target_check_game_date,
      cs.club_id,
      cs.name as sponsor_name
    from public.club_sponsor_objectives o
    join public.club_sponsors cs on cs.id = o.club_sponsor_id
    where o.status = 'active'
      and o.target_race_id = p_race_id
      and o.check_state in ('scheduled', 'waiting_for_result')
      and o.objective_result_state = 'pending'
      and (
        p_force_evaluation = true
        or o.target_check_game_date is null
        or o.target_check_game_date <= v_current_game_date
      )
      and (
        auth.uid() is null
        or finance.is_club_member_or_owner(cs.club_id, auth.uid())
      )
    order by
      o.reward_amount desc nulls last,
      o.created_at asc
  loop
    v_processed := v_processed + 1;

    v_eval_result := public.sponsor_evaluate_objective_v1(
      v_objective.objective_id,
      p_force_evaluation
    );

    v_pay_result := jsonb_build_object(
      'status', 'skipped',
      'reason', 'objective_not_completed'
    );

    if v_eval_result ->> 'status' = 'checked' then
      v_checked := v_checked + 1;

      if v_eval_result ->> 'objective_result_state' = 'completed' then
        v_completed := v_completed + 1;

        v_pay_result := public.sponsor_pay_completed_objective_bonus_v1(
          v_objective.objective_id
        );

        if v_pay_result ->> 'status' = 'paid' then
          v_paid := v_paid + 1;
          v_total_paid := v_total_paid + coalesce((v_pay_result ->> 'amount')::bigint, 0);
        else
          v_payment_skipped := v_payment_skipped + 1;
        end if;
      elsif v_eval_result ->> 'objective_result_state' = 'failed' then
        v_failed := v_failed + 1;
      end if;

    elsif v_eval_result ->> 'status' = 'waiting' then
      v_waiting := v_waiting + 1;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'objective_id', v_objective.objective_id,
        'club_sponsor_id', v_objective.club_sponsor_id,
        'sponsor_name', v_objective.sponsor_name,
        'club_id', v_objective.club_id,
        'evaluation', v_eval_result,
        'payment', v_pay_result
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'race_id', p_race_id,
    'race_name', v_race.name,
    'race_status', v_race.status,
    'current_game_date', v_current_game_date,
    'force_evaluation', p_force_evaluation,
    'processed_count', v_processed,
    'checked_count', v_checked,
    'waiting_count', v_waiting,
    'completed_count', v_completed,
    'failed_count', v_failed,
    'paid_count', v_paid,
    'payment_skipped_count', v_payment_skipped,
    'total_paid', v_total_paid,
    'results', v_results
  );
end;
$function$;

-- public.sponsor_process_visibility_objectives_for_race_v1(uuid,boolean)
CREATE OR REPLACE FUNCTION public.sponsor_process_visibility_objectives_for_race_v1(p_race_id uuid, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_date date;
  v_race_country text;
  v_race_category text;
  v_results jsonb := '[]'::jsonb;
  rec record;
  v_progress jsonb;
  v_current_value integer;
  v_target_value integer;
  v_completed boolean;
  v_due boolean;
  v_target_check_date date;
  v_payout_id uuid;
begin
  select
    coalesce(r.end_date, r.start_date),
    r.country_code,
    r.category
  into
    v_race_date,
    v_race_country,
    v_race_category
  from public.races r
  where r.id = p_race_id;

  if v_race_date is null then
    return jsonb_build_object(
      'status', 'error',
      'message', 'race_not_found',
      'race_id', p_race_id::text
    );
  end if;

  if not public.sponsor_race_allowed_for_club_objective_v1(p_race_id) then
    return jsonb_build_object(
      'status','skipped','reason','national_or_individual_event',
      'race_id',p_race_id,'processed',0
    );
  end if;

  for rec in
    select
      o.id as objective_id,
      o.club_sponsor_id,
      cs.club_id,
      cs.name as sponsor_name,
      o.objective_code,
      o.reward_amount,
      o.target_value,
      o.current_value,
      o.check_state,
      o.objective_result_state,
      o.payout_transaction_id,
      o.metadata,
      nullif(coalesce(o.metadata->>'target_race_id', to_jsonb(o)->>'target_race_id'), '') as target_race_id_text,
      coalesce(o.metadata->>'target_country_code', o.metadata->>'target_race_country', to_jsonb(o)->>'country_code') as target_country_code,
      coalesce(o.metadata->>'target_category', o.metadata->>'target_race_category') as target_category,
      nullif(coalesce(o.metadata->>'target_check_game_date', o.metadata->>'eligible_to_game_date'), '') as target_check_date_text
    from public.club_sponsor_objectives o
    join public.club_sponsors cs
      on cs.id = o.club_sponsor_id
    where cs.status = 'active'
      and o.objective_code in (
        'race_start',
        'target_race_visibility',
        'country_visibility',
        'category_visibility',
        'season_country_starts',
        'season_category_starts'
      )
      and coalesce(o.objective_result_state, 'pending') <> 'completed'
      and coalesce(o.status, 'active') = 'active'
      and (
        (
          o.objective_code in ('race_start', 'target_race_visibility')
          and nullif(coalesce(o.metadata->>'target_race_id', to_jsonb(o)->>'target_race_id'), '') = p_race_id::text
        )
        or (
          o.objective_code in ('country_visibility', 'season_country_starts')
          and coalesce(o.metadata->>'target_country_code', o.metadata->>'target_race_country', to_jsonb(o)->>'country_code') = v_race_country
        )
        or (
          o.objective_code in ('category_visibility', 'season_category_starts')
          and coalesce(o.metadata->>'target_category', o.metadata->>'target_race_category') = v_race_category
        )
        or (
          nullif(coalesce(o.metadata->>'target_check_game_date', o.metadata->>'eligible_to_game_date'), '') is not null
          and nullif(coalesce(o.metadata->>'target_check_game_date', o.metadata->>'eligible_to_game_date'), '')::date <= v_race_date
        )
      )
  loop
    v_progress := public.sponsor_count_visibility_progress_v1(rec.objective_id, p_race_id);
    v_current_value := coalesce((v_progress->>'current_value')::integer, 0);
    v_target_value := greatest(1, coalesce((v_progress->>'target_value')::integer, rec.target_value, 1));
    v_completed := v_current_value >= v_target_value;

    begin
      v_target_check_date := rec.target_check_date_text::date;
    exception when others then
      v_target_check_date := null;
    end;

    v_due :=
      (
        rec.objective_code in ('race_start', 'target_race_visibility')
        and rec.target_race_id_text = p_race_id::text
      )
      or (
        v_target_check_date is not null
        and v_race_date >= v_target_check_date
      );

    v_payout_id := rec.payout_transaction_id;

    if v_completed then
      if not p_dry_run
         and v_payout_id is null
         and coalesce(rec.reward_amount, 0) > 0 then
        select public.finance_grant_sponsor_contract_payment(
          rec.club_id,
          rec.club_sponsor_id,
          rec.reward_amount::bigint,
          jsonb_build_object(
            'source', 'sponsor_visibility_objective_processor',
            'club_sponsor_id', rec.club_sponsor_id::text,
            'sponsor_name', rec.sponsor_name,
            'objective_id', rec.objective_id::text,
            'objective_code', rec.objective_code,
            'race_id', p_race_id::text,
            'reward_amount', rec.reward_amount,
            'progress', v_progress,
            'processed_at', now()
          )
        )
        into v_payout_id;
      end if;

      if not p_dry_run then
        update public.club_sponsor_objectives
        set
          current_value = v_current_value,
          check_state = 'checked',
          objective_result_state = 'completed',
          payout_transaction_id = coalesce(v_payout_id, payout_transaction_id),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'last_visibility_progress', v_progress,
              'visibility_processor_completed', true,
              'visibility_processor_race_id', p_race_id::text,
              'visibility_processor_payout_transaction_id', coalesce(v_payout_id::text, null),
              'visibility_processor_checked_at', now()
            ),
          updated_at = now()
        where id = rec.objective_id;
      end if;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'objective_id', rec.objective_id::text,
          'objective_code', rec.objective_code,
          'result', 'completed',
          'current_value', v_current_value,
          'target_value', v_target_value,
          'payout_transaction_id', coalesce(v_payout_id::text, null),
          'dry_run', p_dry_run
        )
      );

    elsif v_due then
      if not p_dry_run then
        update public.club_sponsor_objectives
        set
          current_value = v_current_value,
          check_state = 'checked',
          objective_result_state = 'failed',
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'last_visibility_progress', v_progress,
              'visibility_processor_failed', true,
              'visibility_processor_race_id', p_race_id::text,
              'visibility_processor_checked_at', now()
            ),
          updated_at = now()
        where id = rec.objective_id;
      end if;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'objective_id', rec.objective_id::text,
          'objective_code', rec.objective_code,
          'result', 'failed',
          'current_value', v_current_value,
          'target_value', v_target_value,
          'dry_run', p_dry_run
        )
      );

    else
      if not p_dry_run then
        update public.club_sponsor_objectives
        set
          current_value = greatest(coalesce(current_value, 0), v_current_value),
          check_state = 'scheduled',
          objective_result_state = 'pending',
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'last_visibility_progress', v_progress,
              'visibility_processor_progress_updated', true,
              'visibility_processor_race_id', p_race_id::text,
              'visibility_processor_checked_at', now()
            ),
          updated_at = now()
        where id = rec.objective_id;
      end if;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'objective_id', rec.objective_id::text,
          'objective_code', rec.objective_code,
          'result', 'progress_updated',
          'current_value', v_current_value,
          'target_value', v_target_value,
          'dry_run', p_dry_run
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'race_id', p_race_id::text,
    'race_date', v_race_date,
    'processed_count', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$function$;

-- public.sponsor_count_market_result_progress_v1(uuid,date)
CREATE OR REPLACE FUNCTION public.sponsor_count_market_result_progress_v1(p_objective_id uuid, p_until_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club uuid; v_country text; v_group text; v_code text; v_target int; v_from date; v_to date; v_until date;
  v_value int:=0; v_races jsonb:='[]'::jsonb;
begin
  select s.club_id,upper(coalesce(s.country_code,s.metadata->>'company_country_code')),o.objective_code,coalesce(o.target_value,1),
         coalesce(o.eligible_from_game_date,s.started_at),coalesce(o.eligible_to_game_date,s.ends_at)
  into v_club,v_country,v_code,v_target,v_from,v_to
  from public.club_sponsor_objectives o join public.club_sponsors s on s.id=o.club_sponsor_id where o.id=p_objective_id;
  if v_club is null then return jsonb_build_object('error','objective_not_found','current_value',0,'target_value',1); end if;
  select group_code into v_group from public.country_market_group_members where upper(country_code)=v_country limit 1;
  v_until:=coalesce(p_until_date,public.get_current_game_date_date());

  with eligible_clubs as (
    select v_club club_id union select c.id from public.clubs c where c.parent_club_id=v_club and c.club_type='developing'
  ), market_races as (
    select distinct r.id,r.name,r.country_code,r.category,coalesce(r.end_date,r.start_date) race_date
    from public.races r left join public.country_market_group_members gm on upper(gm.country_code)=upper(r.country_code)
    where public.sponsor_race_allowed_for_club_objective_v1(r.id)
      and coalesce(r.end_date,r.start_date)<=v_until
      and (v_from is null or coalesce(r.end_date,r.start_date)>=v_from)
      and (v_to is null or coalesce(r.end_date,r.start_date)<=v_to)
      and (upper(r.country_code)=v_country or (v_group is not null and gm.group_code=v_group))
  ), scored as (
    select mr.*,
      case
        when v_code='sponsor_market_starts' then case when exists(select 1 from public.race_participant_teams_v1 rpt where rpt.race_id=mr.id and rpt.club_id in(select club_id from eligible_clubs)) then 1 else 0 end
        when v_code='sponsor_country_win_or_podium' then case when exists(
          select 1 from public.race_classification_standings cs where cs.race_id=mr.id
            and public.sponsor_is_general_classification_row_v1(to_jsonb(cs))
            and public.sponsor_result_position_v1(to_jsonb(cs))<=3
            and exists(select 1 from eligible_clubs ec where public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),ec.club_id))
        ) then 1 else 0 end
        when v_code='sponsor_market_top5_results' then (
          select count(*)::int from public.race_classification_standings cs where cs.race_id=mr.id
            and public.sponsor_is_general_classification_row_v1(to_jsonb(cs))
            and public.sponsor_result_position_v1(to_jsonb(cs))<=5
            and exists(select 1 from eligible_clubs ec where public.sponsor_result_row_belongs_to_club_v1(to_jsonb(cs),ec.club_id))
        )
        else 0 end as contribution
    from market_races mr
  )
  select coalesce(sum(contribution),0)::int,
         coalesce(jsonb_agg(jsonb_build_object('race_id',id,'race_name',name,'race_date',race_date,'country_code',country_code,'contribution',contribution) order by race_date) filter(where contribution>0),'[]'::jsonb)
  into v_value,v_races from scored;
  return jsonb_build_object('objective_id',p_objective_id,'objective_code',v_code,'target_value',v_target,'current_value',v_value,
    'sponsor_country_code',v_country,'market_group',v_group,'until_date',v_until,'qualifying_races',v_races);
end;$function$;

-- public.sponsor_count_visibility_progress_v1(uuid,uuid)
CREATE OR REPLACE FUNCTION public.sponsor_count_visibility_progress_v1(p_objective_id uuid, p_until_race_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid; v_objective_code text; v_metadata_code text; v_target_value integer:=1;
  v_target_race_text text; v_target_race_id uuid; v_target_country_code text; v_target_category text;
  v_from_text text; v_to_text text; v_from_date date; v_to_date date; v_until_date date;
  v_current_value integer:=0; v_rider_rows integer:=0; v_races jsonb:='[]'::jsonb;
begin
  select cs.club_id,o.objective_code,o.metadata->>'objective_code',coalesce(o.target_value,1),
         coalesce(o.metadata->>'target_race_id',to_jsonb(o)->>'target_race_id'),
         coalesce(o.metadata->>'target_country_code',o.metadata->>'target_race_country',to_jsonb(o)->>'country_code'),
         coalesce(o.metadata->>'target_category',o.metadata->>'target_race_category'),
         coalesce(to_jsonb(o)->>'eligible_from_game_date',o.metadata->>'eligible_from_game_date',o.metadata->>'contract_start_game_date'),
         coalesce(to_jsonb(o)->>'eligible_to_game_date',o.metadata->>'eligible_to_game_date',o.metadata->>'target_check_game_date',o.metadata->>'contract_end_game_date')
  into v_club_id,v_objective_code,v_metadata_code,v_target_value,v_target_race_text,v_target_country_code,v_target_category,v_from_text,v_to_text
  from public.club_sponsor_objectives o join public.club_sponsors cs on cs.id=o.club_sponsor_id where o.id=p_objective_id;
  if v_club_id is null then return jsonb_build_object('objective_id',p_objective_id::text,'error','objective_not_found','current_value',0,'target_value',1); end if;

  -- Preview objective rows retain their semantic code in metadata.
  if v_metadata_code in ('race_start','target_race_visibility','country_visibility','season_country_starts','category_visibility','season_category_starts') then
    v_objective_code:=v_metadata_code;
  elsif v_objective_code ilike '%target_race_visibility%' then
    v_objective_code:='target_race_visibility';
  elsif v_objective_code ilike '%category_visibility%' then
    v_objective_code:='category_visibility';
  end if;

  begin if nullif(v_target_race_text,'') is not null then v_target_race_id:=v_target_race_text::uuid; end if; exception when others then v_target_race_id:=null; end;
  begin if nullif(v_from_text,'') is not null then v_from_date:=v_from_text::date; end if; exception when others then v_from_date:=null; end;
  begin if nullif(v_to_text,'') is not null then v_to_date:=v_to_text::date; end if; exception when others then v_to_date:=null; end;
  if p_until_race_id is not null then select coalesce(r.end_date,r.start_date) into v_until_date from public.races r where r.id=p_until_race_id; end if;
  if v_until_date is null then v_until_date:=public.get_current_game_date_date(); end if;

  with eligible_clubs as (
    select v_club_id as club_id union select c.id from public.clubs c where c.parent_club_id=v_club_id and c.club_type='developing'
  ), qualifying as (
    select rpt.race_id,max(r.name) race_name,max(r.country_code) country_code,max(r.category) category,
           max(coalesce(r.end_date,r.start_date)) race_date,
           (select count(*) from public.race_participant_riders_v1 rpr where rpr.race_id=rpt.race_id and rpr.club_id in(select club_id from eligible_clubs))::int rider_rows
    from public.race_participant_teams_v1 rpt join public.races r on r.id=rpt.race_id
    where public.sponsor_race_allowed_for_club_objective_v1(r.id)
      and rpt.club_id in(select club_id from eligible_clubs)
      and coalesce(r.end_date,r.start_date)<=v_until_date
      and (v_from_date is null or coalesce(r.end_date,r.start_date)>=v_from_date)
      and (v_to_date is null or coalesce(r.end_date,r.start_date)<=v_to_date)
      and (
        (v_objective_code in ('race_start','target_race_visibility') and v_target_race_id is not null and rpt.race_id=v_target_race_id)
        or (v_objective_code in ('country_visibility','season_country_starts') and v_target_country_code is not null and r.country_code=v_target_country_code)
        or (v_objective_code in ('category_visibility','season_category_starts') and v_target_category is not null and r.category=v_target_category)
      )
    group by rpt.race_id
  )
  select count(*)::int,coalesce(sum(q.rider_rows),0)::int,
         coalesce(jsonb_agg(jsonb_build_object('race_id',q.race_id::text,'race_name',q.race_name,'race_date',q.race_date,'country_code',q.country_code,'category',q.category,'rider_rows',q.rider_rows) order by q.race_date),'[]'::jsonb)
  into v_current_value,v_rider_rows,v_races from qualifying q;
  return jsonb_build_object('objective_id',p_objective_id::text,'objective_code',v_objective_code,'club_id',v_club_id::text,
    'target_value',greatest(1,coalesce(v_target_value,1)),'current_value',coalesce(v_current_value,0),'participant_found',coalesce(v_current_value,0)>0,
    'rider_rows',coalesce(v_rider_rows,0),'target_race_id',v_target_race_id::text,'target_country_code',v_target_country_code,
    'target_category',v_target_category,'until_date',v_until_date,'qualifying_races',v_races);
end;$function$;

-- public.sponsor_suggest_visibility_target_value_v1(date,date,text,text)
CREATE OR REPLACE FUNCTION public.sponsor_suggest_visibility_target_value_v1(p_contract_start date, p_contract_end date, p_visibility_kind text, p_target_code text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_available integer := 0;
  v_days integer;
  v_target integer;
begin
  if p_contract_start is null or p_contract_end is null then
    return 1;
  end if;

  v_days := greatest(1, p_contract_end - p_contract_start + 1);

  if p_visibility_kind in ('target_race_visibility', 'race_start') then
    return 1;
  end if;

  if p_visibility_kind in ('country_visibility', 'season_country_starts') then
    select count(*)
    into v_available
    from public.races r
    where public.sponsor_race_allowed_for_club_objective_v1(r.id)
      and coalesce(r.end_date, r.start_date) between p_contract_start and p_contract_end
      and r.country_code = p_target_code;
  elsif p_visibility_kind in ('category_visibility', 'season_category_starts') then
    select count(*)
    into v_available
    from public.races r
    where public.sponsor_race_allowed_for_club_objective_v1(r.id)
      and coalesce(r.end_date, r.start_date) between p_contract_start and p_contract_end
      and r.category = p_target_code;
  else
    return 1;
  end if;

  if v_available <= 0 then
    return 1;
  end if;

  v_target := case
    when v_days <= 70 then least(2, greatest(1, ceil(v_available * 0.25)::integer))
    when v_days <= 180 then least(4, greatest(1, ceil(v_available * 0.30)::integer))
    else least(8, greatest(1, ceil(v_available * 0.35)::integer))
  end;

  return greatest(1, v_target);
end;
$function$;
