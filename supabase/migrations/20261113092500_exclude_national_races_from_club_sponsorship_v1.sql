-- Sponsor objectives are strictly for races in which the club can compete.
-- Never assign National Championships, qualification rounds, World Road
-- Championships, or World Nations races to a club sponsor.
-- Captured from verified live Supabase definitions, 2026-11-13.
-- Season 1 historical contracts and payouts are not rewritten.
--

-- public.sponsor_race_allowed_for_club_objective_v1(uuid)
CREATE OR REPLACE FUNCTION public.sponsor_race_allowed_for_club_objective_v1(p_race_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.races r
  WHERE r.id=p_race_id
    AND r.category::text IN
      ('1.1','1.2','1.HC','1.Pro','1.UWT','2.1','2.2','2.HC','2.Pro','2.UWT')
    AND coalesce(lower(r.metadata->>'individual_only'),'false') <> 'true'
    AND coalesce(lower(r.metadata->>'national_championship'),'false') <> 'true'
    AND coalesce(lower(r.metadata->>'nations_competition'),'false') <> 'true'
    AND coalesce(lower(r.metadata->>'national_team_only'),'false') <> 'true'
 );
$function$;

-- public.sponsor_enforce_club_race_objective_v1()
CREATE OR REPLACE FUNCTION public.sponsor_enforce_club_race_objective_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_race_id uuid;
 v_meta_race text;
 v_stage_race uuid;
BEGIN
 IF NEW.status <> 'active' THEN RETURN NEW; END IF;
 IF coalesce(NEW.metadata->>'target_category',NEW.metadata->>'race_category','') IN
    ('NC','NCQ','WRC','WNF','WNQ') THEN
   RAISE EXCEPTION 'National and nations-only championships cannot be club sponsor goals' USING ERRCODE='23514';
 END IF;
 v_race_id:=NEW.target_race_id;
 v_meta_race:=coalesce(nullif(NEW.metadata->>'target_race_id',''),nullif(NEW.metadata->>'race_id',''));
 IF v_meta_race IS NOT NULL THEN
   IF v_meta_race !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN RAISE EXCEPTION 'Invalid sponsor target race identifier'; END IF;
   IF v_race_id IS NULL THEN v_race_id:=v_meta_race::uuid;
   ELSIF v_race_id<>v_meta_race::uuid THEN
      RAISE EXCEPTION 'Sponsor objective race identifier mismatch';
   END IF;
 END IF;
 IF NEW.target_stage_id IS NOT NULL THEN
   SELECT stage.race_id INTO v_stage_race FROM public.race_stages stage
   WHERE stage.id=NEW.target_stage_id;
   IF v_stage_race IS NULL OR (v_race_id IS NOT NULL AND v_race_id<>v_stage_race) THEN
     RAISE EXCEPTION 'Sponsor objective stage does not belong to the target race';
   END IF;
   v_race_id:=v_stage_race;
 END IF;
 IF v_race_id IS NOT NULL
   AND NOT public.sponsor_race_allowed_for_club_objective_v1(v_race_id)
 THEN
   RAISE EXCEPTION 'National and individual-only competitions cannot be club sponsor goals (race %)',v_race_id
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$function$;

-- public.sponsor_enforce_club_offer_preview_v1()
CREATE OR REPLACE FUNCTION public.sponsor_enforce_club_offer_preview_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE obj jsonb; v_code text; v_id text;
BEGIN
 IF NEW.sponsor_kind<>'main' OR NEW.status NOT IN ('offered','accepted')
    OR jsonb_typeof(NEW.metadata->'preview_objectives') IS DISTINCT FROM 'array'
 THEN RETURN NEW; END IF;
 FOR obj IN SELECT value FROM jsonb_array_elements(NEW.metadata->'preview_objectives')
 LOOP
  v_code:=coalesce(obj->>'target_category','');
  IF v_code IN ('NC','NCQ','WRC','WNF','WNQ') THEN
    RAISE EXCEPTION 'National/nations-only races cannot be main sponsor offer goals' USING ERRCODE='23514';
  END IF;
  v_id:=nullif(obj->>'target_race_id','');
  IF v_id IS NOT NULL THEN
    IF v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT public.sponsor_race_allowed_for_club_objective_v1(
          CASE WHEN v_id~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN v_id::uuid ELSE NULL END)
    THEN
      RAISE EXCEPTION 'Sponsor offer contains an ineligible individual/national race target' USING ERRCODE='23514';
    END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END
$function$;

-- public.sponsor_build_offer_preview_objectives_v1(uuid)
CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v1(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_club_country text;
  v_club_group text;
  v_sponsor_group text;
  v_bonus bigint := 0;

  v_reward_1 bigint := 0;
  v_reward_2 bigint := 0;
  v_reward_3 bigint := 0;
  v_reward_4 bigint := 0;
  v_reward_5 bigint := 0;

  v_race_1 jsonb;
  v_race_2 jsonb;
  v_race_3 jsonb;
  v_race_4 jsonb;
  v_race_5 jsonb;

  v_used uuid[] := array[]::uuid[];
begin
  select
    o.id,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    return '[]'::jsonb;
  end if;

  v_club_country := v_offer.club_country_code;
  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));

  select cgm.group_code
  into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_club_country
  limit 1;

  select cgm.group_code
  into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code
  limit 1;

  v_reward_1 := round(v_bonus::numeric * 0.28)::bigint;
  v_reward_2 := round(v_bonus::numeric * 0.24)::bigint;
  v_reward_3 := round(v_bonus::numeric * 0.20)::bigint;
  v_reward_4 := round(v_bonus::numeric * 0.16)::bigint;
  v_reward_5 := greatest(0, v_bonus - v_reward_1 - v_reward_2 - v_reward_3 - v_reward_4);

  -- 1) Sponsor-country race, if possible.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_1
  from public.races r
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and upper(r.country_code) = v_offer.sponsor_country_code
    and r.start_date is not null
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    r.start_date asc nulls last,
    random()
  limit 1;

  if v_race_1 ? 'race_id' then
    v_used := v_used || (v_race_1 ->> 'race_id')::uuid;
  end if;

  -- 2) Regional / sponsor-market race.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_2
  from public.races r
  left join public.country_market_group_members cgm
    on upper(cgm.country_code) = upper(r.country_code)
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date is not null
    and (v_sponsor_group is not null and cgm.group_code = v_sponsor_group)
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    random()
  limit 1;

  if v_race_2 ? 'race_id' then
    v_used := v_used || (v_race_2 ->> 'race_id')::uuid;
  end if;

  -- 3) Home-market race, usually Serbia for BK Novi Beograd.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_3
  from public.races r
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and upper(r.country_code) = v_club_country
    and r.start_date is not null
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    r.start_date asc nulls last,
    random()
  limit 1;

  if v_race_3 ? 'race_id' then
    v_used := v_used || (v_race_3 ->> 'race_id')::uuid;
  end if;

  -- 4) Prestige/global race.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_4
  from public.races r
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date is not null
    and not (r.id = any(v_used))
    and (
      r.category ilike '%UWT%'
      or r.category ilike '%Pro%'
      or r.category in ('2.1', '1.1')
    )
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    random()
  limit 1;

  if v_race_4 ? 'race_id' then
    v_used := v_used || (v_race_4 ->> 'race_id')::uuid;
  end if;

  -- 5) Any remaining useful race for classification / jersey visibility.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_5
  from public.races r
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date is not null
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 1
      when r.category ilike '%Pro%' then 2
      when r.category in ('2.1', '1.1') then 3
      else 4
    end,
    random()
  limit 1;

  -- Fallbacks in case the calendar has no perfect sponsor-country match.
  v_race_1 := coalesce(v_race_1, v_race_4, v_race_5, '{}'::jsonb);
  v_race_2 := coalesce(v_race_2, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_3 := coalesce(v_race_3, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_4 := coalesce(v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_5 := coalesce(v_race_5, v_race_4, v_race_1, '{}'::jsonb);

  return jsonb_build_array(
    jsonb_build_object(
      'title', coalesce(v_race_1 ->> 'race_name', 'Sponsor-market race') || ': start and visibility target',
      'description', 'Start this sponsor-market race and keep the sponsor visible in the team plan and race participation.',
      'target_race_id', v_race_1 ->> 'race_id',
      'target_race_name', v_race_1 ->> 'race_name',
      'target_country_code', v_race_1 ->> 'country_code',
      'target_category', v_race_1 ->> 'category',
      'check_date', v_race_1 ->> 'check_date',
      'required_result', 'race_start',
      'estimated_reward_amount', v_reward_1,
      'reward_label', '$' || to_char(v_reward_1, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_2 ->> 'race_name', 'Sponsor-connected event') || ': win or podium',
      'description', 'Deliver a headline result for the sponsor by winning or finishing on the podium in this sponsor-connected race.',
      'target_race_id', v_race_2 ->> 'race_id',
      'target_race_name', v_race_2 ->> 'race_name',
      'target_country_code', v_race_2 ->> 'country_code',
      'target_category', v_race_2 ->> 'category',
      'check_date', v_race_2 ->> 'check_date',
      'required_result', 'race_podium',
      'estimated_reward_amount', v_reward_2,
      'reward_label', '$' || to_char(v_reward_2, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_3 ->> 'race_name', 'Home-market event') || ': top-5 result',
      'description', 'The sponsor also expects strong visibility in the team’s home market. Finish top 5 in this race or a key stage.',
      'target_race_id', v_race_3 ->> 'race_id',
      'target_race_name', v_race_3 ->> 'race_name',
      'target_country_code', v_race_3 ->> 'country_code',
      'target_category', v_race_3 ->> 'category',
      'check_date', v_race_3 ->> 'check_date',
      'required_result', 'stage_top_5',
      'estimated_reward_amount', v_reward_3,
      'reward_label', '$' || to_char(v_reward_3, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_4 ->> 'race_name', 'Prestige race') || ': GC top 10',
      'description', 'For a top-tier team, the sponsor expects visibility in a high-prestige race. Finish top 10 in the final general classification.',
      'target_race_id', v_race_4 ->> 'race_id',
      'target_race_name', v_race_4 ->> 'race_name',
      'target_country_code', v_race_4 ->> 'country_code',
      'target_category', v_race_4 ->> 'category',
      'check_date', v_race_4 ->> 'check_date',
      'required_result', 'gc_top_10',
      'estimated_reward_amount', v_reward_4,
      'reward_label', '$' || to_char(v_reward_4, 'FM999,999,999')
    ),
    jsonb_build_object(
      'title', coalesce(v_race_5 ->> 'race_name', 'Classification race') || ': points or mountain jersey visibility',
      'description', 'Score visible classification points, fight for a jersey, or place a rider in the key breakaway battle for sponsor exposure.',
      'target_race_id', v_race_5 ->> 'race_id',
      'target_race_name', v_race_5 ->> 'race_name',
      'target_country_code', v_race_5 ->> 'country_code',
      'target_category', v_race_5 ->> 'category',
      'check_date', v_race_5 ->> 'check_date',
      'required_result', 'classification_visibility',
      'estimated_reward_amount', v_reward_5,
      'reward_label', '$' || to_char(v_reward_5, 'FM999,999,999')
    )
  );
end;
$function$;

-- public.sponsor_build_offer_preview_objectives_v2(uuid)
CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v2(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_club_country text;
  v_club_group text;
  v_sponsor_group text;
  v_bonus bigint := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;

  v_reward_1 bigint := 0;
  v_reward_2 bigint := 0;
  v_reward_3 bigint := 0;
  v_reward_4 bigint := 0;
  v_reward_5 bigint := 0;

  v_race_1 jsonb;
  v_race_2 jsonb;
  v_race_3 jsonb;
  v_race_4 jsonb;
  v_race_5 jsonb;
  v_used uuid[] := array[]::uuid[];
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    return '[]'::jsonb;
  end if;

  v_club_country := v_offer.club_country_code;
  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());

  select cgm.group_code
    into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_club_country
  limit 1;

  select cgm.group_code
    into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code
  limit 1;

  -- The five advertised rewards always add up to the full advertised bonus pool.
  v_reward_1 := round(v_bonus::numeric * 0.28)::bigint;
  v_reward_2 := round(v_bonus::numeric * 0.24)::bigint;
  v_reward_3 := round(v_bonus::numeric * 0.20)::bigint;
  v_reward_4 := round(v_bonus::numeric * 0.16)::bigint;
  v_reward_5 := greatest(0, v_bonus - v_reward_1 - v_reward_2 - v_reward_3 - v_reward_4);

  -- 1) Sponsor-country race; if unavailable, use sponsor-group or prestige fallback.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_1
  from public.races r
  left join public.country_market_group_members cgm
    on upper(cgm.country_code) = upper(r.country_code)
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and (
      upper(r.country_code) = v_offer.sponsor_country_code
      or (v_sponsor_group is not null and cgm.group_code = v_sponsor_group)
      or (
        v_offer.club_tier in ('worldteam','proteam')
        and (
          r.category ilike '%UWT%'
          or r.category ilike '%Pro%'
          or r.category in ('2.1','1.1')
        )
      )
    )
  order by
    case
      when upper(r.country_code) = v_offer.sponsor_country_code then 0
      when v_sponsor_group is not null and cgm.group_code = v_sponsor_group then 1
      else 2
    end,
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-1')
  limit 1;

  if coalesce(v_race_1, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_1 ->> 'race_id')::uuid;
  end if;

  -- 2) Another sponsor-market / prestige race for a podium target.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_2
  from public.races r
  left join public.country_market_group_members cgm
    on upper(cgm.country_code) = upper(r.country_code)
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
    and (
      (v_sponsor_group is not null and cgm.group_code = v_sponsor_group)
      or upper(r.country_code) = v_offer.sponsor_country_code
      or (
        v_offer.club_tier in ('worldteam','proteam')
        and (
          r.category ilike '%UWT%'
          or r.category ilike '%Pro%'
          or r.category in ('2.1','1.1')
        )
      )
    )
  order by
    case
      when v_sponsor_group is not null and cgm.group_code = v_sponsor_group then 0
      when upper(r.country_code) = v_offer.sponsor_country_code then 1
      else 2
    end,
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-2')
  limit 1;

  if coalesce(v_race_2, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_2 ->> 'race_id')::uuid;
  end if;

  -- 3) Home-market race, preferring a stage race for the stage top-5 target.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_3
  from public.races r
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and upper(r.country_code) = v_club_country
    and not (r.id = any(v_used))
  order by
    case when lower(coalesce(r.race_type,'')) = 'stage_race' then 0 else 1 end,
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-3')
  limit 1;

  if coalesce(v_race_3, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_3 ->> 'race_id')::uuid;
  end if;

  -- 4) Prestige stage race for a final GC top-10 target.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_4
  from public.races r
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
    and lower(coalesce(r.race_type,'')) = 'stage_race'
    and (
      r.category ilike '%UWT%'
      or r.category ilike '%Pro%'
      or r.category in ('2.1','1.1','2.2')
    )
  order by
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-4')
  limit 1;

  if coalesce(v_race_4, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_4 ->> 'race_id')::uuid;
  end if;

  -- 5) Remaining useful race for classification visibility.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_5
  from public.races r
  where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-5')
  limit 1;

  -- Fallbacks keep all five objectives concrete even in sparse national calendars.
  v_race_1 := coalesce(v_race_1, v_race_2, v_race_4, v_race_5, '{}'::jsonb);
  v_race_2 := coalesce(v_race_2, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_3 := coalesce(v_race_3, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_4 := coalesce(v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_5 := coalesce(v_race_5, v_race_4, v_race_1, '{}'::jsonb);

  return jsonb_build_array(
    jsonb_build_object(
      'objective_code', 'race_start',
      'title', coalesce(v_race_1 ->> 'race_name', 'Sponsor-market race') || ': start the race',
      'description', 'Start this sponsor-market race with your team. The objective is completed when your team appears on the race start list.',
      'target_race_id', v_race_1 ->> 'race_id',
      'target_race_name', v_race_1 ->> 'race_name',
      'target_country_code', v_race_1 ->> 'country_code',
      'target_category', v_race_1 ->> 'category',
      'target_race_type', v_race_1 ->> 'race_type',
      'check_date', v_race_1 ->> 'check_date',
      'target_check_game_date', v_race_1 ->> 'check_date',
      'required_result', 'race_start',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_start_count',
      'progress_source', 'race_entries',
      'estimated_reward_amount', v_reward_1,
      'reward_amount', v_reward_1,
      'reward_label', '$' || to_char(v_reward_1, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'race_podium',
      'title', coalesce(v_race_2 ->> 'race_name', 'Sponsor-connected event') || ': finish on the podium',
      'description', 'Deliver a headline result for the sponsor by finishing in the top 3 of this race.',
      'target_race_id', v_race_2 ->> 'race_id',
      'target_race_name', v_race_2 ->> 'race_name',
      'target_country_code', v_race_2 ->> 'country_code',
      'target_category', v_race_2 ->> 'category',
      'target_race_type', v_race_2 ->> 'race_type',
      'check_date', v_race_2 ->> 'check_date',
      'target_check_game_date', v_race_2 ->> 'check_date',
      'required_result', 'race_podium',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_final_result',
      'progress_source', 'race_results',
      'estimated_reward_amount', v_reward_2,
      'reward_amount', v_reward_2,
      'reward_label', '$' || to_char(v_reward_2, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'stage_top_5',
      'title', coalesce(v_race_3 ->> 'race_name', 'Home-market event') || ': stage top 5',
      'description', 'Give the sponsor strong home-market visibility by placing a rider in the top 5 of a stage in this race.',
      'target_race_id', v_race_3 ->> 'race_id',
      'target_race_name', v_race_3 ->> 'race_name',
      'target_country_code', v_race_3 ->> 'country_code',
      'target_category', v_race_3 ->> 'category',
      'target_race_type', v_race_3 ->> 'race_type',
      'check_date', v_race_3 ->> 'check_date',
      'target_check_game_date', v_race_3 ->> 'check_date',
      'required_result', 'stage_top_5',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'stage_result_count',
      'progress_source', 'stage_results',
      'estimated_reward_amount', v_reward_3,
      'reward_amount', v_reward_3,
      'reward_label', '$' || to_char(v_reward_3, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'gc_top_10',
      'title', coalesce(v_race_4 ->> 'race_name', 'Prestige stage race') || ': final GC top 10',
      'description', 'Finish a rider inside the final general-classification top 10 of this prestige stage race.',
      'target_race_id', v_race_4 ->> 'race_id',
      'target_race_name', v_race_4 ->> 'race_name',
      'target_country_code', v_race_4 ->> 'country_code',
      'target_category', v_race_4 ->> 'category',
      'target_race_type', v_race_4 ->> 'race_type',
      'check_date', v_race_4 ->> 'check_date',
      'target_check_game_date', v_race_4 ->> 'check_date',
      'required_result', 'gc_top_10',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_final_result',
      'progress_source', 'race_results',
      'estimated_reward_amount', v_reward_4,
      'reward_amount', v_reward_4,
      'reward_label', '$' || to_char(v_reward_4, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'classification_visibility',
      'title', coalesce(v_race_5 ->> 'race_name', 'Classification race') || ': classification visibility',
      'description', 'Place your team in the final published classifications of this race to deliver sponsor exposure.',
      'target_race_id', v_race_5 ->> 'race_id',
      'target_race_name', v_race_5 ->> 'race_name',
      'target_country_code', v_race_5 ->> 'country_code',
      'target_category', v_race_5 ->> 'category',
      'target_race_type', v_race_5 ->> 'race_type',
      'check_date', v_race_5 ->> 'check_date',
      'target_check_game_date', v_race_5 ->> 'check_date',
      'required_result', 'classification_visibility',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_final_result',
      'progress_source', 'race_results',
      'estimated_reward_amount', v_reward_5,
      'reward_amount', v_reward_5,
      'reward_label', '$' || to_char(v_reward_5, 'FM999,999,999')
    )
  );
end;
$function$;

-- public.sponsor_build_offer_preview_objectives_v3(uuid)
CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v3(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_bonus bigint := 0;
  v_objective_count integer := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;
  v_sponsor_group text;
  v_used uuid[] := array[]::uuid[];
  v_result jsonb := '[]'::jsonb;
  v_weights numeric[] := array[0.65, 0.75, 0.90, 1.00, 1.15, 1.30];
  v_weight_sum numeric := 0;
  v_index integer;
  v_weight numeric;
  v_reward bigint;
  v_allocated bigint := 0;
  v_race record;
  v_required_result text;
  v_title text;
  v_description text;
  v_evaluation_mode text;
  v_progress_source text;
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    return '[]'::jsonb;
  end if;

  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  if v_bonus <= 0 then
    return '[]'::jsonb;
  end if;

  -- Scale between three and six visible objectives. The current offer UI
  -- renders six objective cards, so every advertised target remains visible.
  v_objective_count := least(
    6,
    greatest(
      3,
      ceil(v_bonus::numeric / 90000.0)::integer
    )
  );

  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());

  select cgm.group_code
  into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code
  limit 1;

  select coalesce(sum(x), 0)
  into v_weight_sum
  from unnest(v_weights[1:v_objective_count]) as u(x);

  for v_index in 1..v_objective_count loop
    select
      r.id,
      r.name,
      r.start_date,
      coalesce(r.end_date, r.start_date) as end_date,
      r.country_code,
      r.category,
      r.race_type
    into v_race
    from public.races r
    left join public.country_market_group_members cgm
      on upper(cgm.country_code) = upper(r.country_code)
    where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
      and lower(coalesce(r.status::text, 'scheduled')) not in (
        'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
      )
      and not (r.id = any(v_used))
      and (
        v_index not in (3, 4, 6)
        or lower(coalesce(r.race_type, '')) = 'stage_race'
      )
    order by
      case
        when v_index = 1 and upper(r.country_code) = v_offer.sponsor_country_code then 0
        when v_index = 1 and v_sponsor_group is not null and cgm.group_code = v_sponsor_group then 1
        when v_index = 3 and upper(r.country_code) = v_offer.club_country_code then 0
        when v_index in (4, 5, 6) and r.category ilike '%UWT%' then 0
        when v_index in (4, 5, 6) and r.category ilike '%Pro%' then 1
        when v_index in (4, 5, 6) and r.category in ('2.1','1.1') then 2
        else 3
      end,
      md5(r.id::text || p_offer_id::text || '|objective-v3-' || v_index::text)
    limit 1;

    if not found and v_index not in (3, 4, 6) then
      select
        r.id,
        r.name,
        r.start_date,
        coalesce(r.end_date, r.start_date) as end_date,
        r.country_code,
        r.category,
        r.race_type
      into v_race
      from public.races r
      where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
        and lower(coalesce(r.status::text, 'scheduled')) not in (
          'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
        )
        and not (r.id = any(v_used))
      order by md5(r.id::text || p_offer_id::text || '|fallback-v3-' || v_index::text)
      limit 1;
    end if;

    if not found then
      exit;
    end if;

    v_used := v_used || v_race.id;

    case v_index
      when 1 then
        v_required_result := 'race_start';
        v_title := v_race.name || ': start the race';
        v_description := 'Start ' || v_race.name || ' with your team. The objective is completed when your team appears on the race start list.';
        v_evaluation_mode := 'race_start_count';
        v_progress_source := 'race_entries';
      when 2 then
        v_required_result := 'classification_visibility';
        v_title := v_race.name || ': appear in the final classification';
        v_description := 'Finish the race with at least one rider listed in the published final classifications.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 3 then
        v_required_result := 'stage_top_5';
        v_title := v_race.name || ': stage top 5';
        v_description := 'Place at least one rider in the top 5 of a stage in ' || v_race.name || '.';
        v_evaluation_mode := 'stage_result_count';
        v_progress_source := 'stage_results';
      when 4 then
        v_required_result := 'gc_top_10';
        v_title := v_race.name || ': final GC top 10';
        v_description := 'Finish at least one rider inside the final general-classification top 10 of ' || v_race.name || '.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 5 then
        v_required_result := 'race_podium';
        v_title := v_race.name || ': finish on the podium';
        v_description := 'Finish in the top 3 of ' || v_race.name || ' to deliver a headline result for the sponsor.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      else
        v_required_result := 'stage_win';
        v_title := v_race.name || ': win a stage';
        v_description := 'Win at least one stage of ' || v_race.name || '.';
        v_evaluation_mode := 'stage_result_count';
        v_progress_source := 'stage_results';
    end case;

    v_weight := v_weights[v_index];

    if v_index = v_objective_count then
      v_reward := greatest(0, v_bonus - v_allocated);
    else
      v_reward := round(v_bonus::numeric * v_weight / nullif(v_weight_sum, 0))::bigint;
      v_allocated := v_allocated + v_reward;
    end if;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'objective_code', v_required_result,
        'title', v_title,
        'description', v_description,
        'target_race_id', v_race.id::text,
        'target_race_name', v_race.name,
        'target_country_code', v_race.country_code,
        'target_category', v_race.category,
        'target_race_type', v_race.race_type,
        'target_race_start_date', v_race.start_date::text,
        'target_race_end_date', v_race.end_date::text,
        'check_date', v_race.end_date::text,
        'target_check_game_date', v_race.end_date::text,
        'required_result', v_required_result,
        'target_value', 1,
        'current_value', 0,
        'evaluation_mode', v_evaluation_mode,
        'progress_source', v_progress_source,
        'estimated_reward_amount', v_reward,
        'reward_amount', v_reward,
        'reward_label', '$' || to_char(v_reward, 'FM999,999,999'),
        'objective_number', v_index,
        'objective_count', v_objective_count,
        'bonus_pool_amount', v_bonus,
        'preview_policy_version', 'v3_scaled_exact_races_max6'
      )
    );
  end loop;

  return v_result;
end;
$function$;

-- public.sponsor_build_offer_preview_objectives_v4(uuid)
CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v4(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_bonus bigint := 0;
  v_objective_count integer := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;
  v_club_group text;
  v_sponsor_group text;
  v_target_group text;
  v_other_group text;
  v_target_group_name text;
  v_desired_country text;
  v_same_group boolean := false;
  v_used uuid[] := array[]::uuid[];
  v_result jsonb := '[]'::jsonb;
  v_weights numeric[] := array[0.65, 0.75, 0.90, 1.00, 1.15, 1.30];
  v_weight_sum numeric := 0;
  v_index integer;
  v_weight numeric;
  v_reward bigint;
  v_allocated bigint := 0;
  v_race record;
  v_required_result text;
  v_title text;
  v_description text;
  v_evaluation_mode text;
  v_progress_source text;
  v_market_fallback boolean;
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    coalesce(sc.home_group_code, sm.group_code) as sponsor_group_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    cm.group_code as club_group_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  left join public.country_market_group_members sm on upper(sm.country_code) = upper(sc.country_code)
  left join public.country_market_group_members cm on upper(cm.country_code) = upper(c.country_code)
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then return '[]'::jsonb; end if;

  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  if v_bonus <= 0 then return '[]'::jsonb; end if;

  v_objective_count := least(6, greatest(3, ceil(v_bonus::numeric / 90000.0)::integer));
  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());
  v_club_group := v_offer.club_group_code;
  v_sponsor_group := v_offer.sponsor_group_code;
  v_same_group := v_club_group is not null and v_sponsor_group is not null and v_club_group = v_sponsor_group;

  select coalesce(sum(x),0) into v_weight_sum
  from unnest(v_weights[1:v_objective_count]) as u(x);

  for v_index in 1..v_objective_count loop
    if v_same_group then
      v_target_group := v_club_group;
      v_other_group := null;
      v_desired_country := case when mod(v_index,2)=1 then v_offer.sponsor_country_code else v_offer.club_country_code end;
    elsif v_club_group is not null and v_sponsor_group is not null then
      if mod(v_index,2)=1 then
        v_target_group := v_club_group;
        v_other_group := v_sponsor_group;
        v_desired_country := v_offer.club_country_code;
      else
        v_target_group := v_sponsor_group;
        v_other_group := v_club_group;
        v_desired_country := v_offer.sponsor_country_code;
      end if;
    else
      v_target_group := coalesce(v_club_group, v_sponsor_group);
      v_other_group := null;
      v_desired_country := coalesce(v_offer.club_country_code, v_offer.sponsor_country_code);
    end if;

    v_market_fallback := false;
    v_target_group_name := null;
    if v_target_group is not null then
      select g.name into v_target_group_name
      from public.country_market_groups g where g.code=v_target_group;
    end if;

    select
      r.id, r.name, r.start_date, coalesce(r.end_date,r.start_date) as end_date,
      r.country_code, r.category, r.race_type, mg.group_code as race_group_code
    into v_race
    from public.races r
    join public.country_market_group_members mg on upper(mg.country_code)=upper(r.country_code)
    where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
      and lower(coalesce(r.status::text,'scheduled')) not in (
        'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
      )
      and not (r.id = any(v_used))
      and (v_target_group is null or mg.group_code=v_target_group)
    order by
      case when upper(r.country_code)=upper(v_desired_country) then 0 else 1 end,
      case when v_index in (3,4,6) and lower(coalesce(r.race_type,''))='stage_race' then 0
           when v_index in (3,4,6) then 1 else 0 end,
      case when v_index in (4,5,6) and r.category ilike '%UWT%' then 0
           when v_index in (4,5,6) and r.category ilike '%Pro%' then 1
           when v_index in (4,5,6) and r.category in ('2.1','1.1') then 2 else 3 end,
      md5(r.id::text || p_offer_id::text || '|market-v4-' || v_index::text)
    limit 1;

    if not found and v_other_group is not null then
      v_market_fallback := true;
      select g.name into v_target_group_name
      from public.country_market_groups g where g.code=v_other_group;
      select
        r.id, r.name, r.start_date, coalesce(r.end_date,r.start_date) as end_date,
        r.country_code, r.category, r.race_type, mg.group_code as race_group_code
      into v_race
      from public.races r
      join public.country_market_group_members mg on upper(mg.country_code)=upper(r.country_code)
      where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
        and lower(coalesce(r.status::text,'scheduled')) not in (
          'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
        )
        and not (r.id = any(v_used))
        and mg.group_code=v_other_group
      order by
        case when v_index in (3,4,6) and lower(coalesce(r.race_type,''))='stage_race' then 0 else 1 end,
        md5(r.id::text || p_offer_id::text || '|other-market-v4-' || v_index::text)
      limit 1;
      if found then v_target_group := v_other_group; end if;
    end if;

    if not found then
      v_market_fallback := true;
      select
        r.id, r.name, r.start_date, coalesce(r.end_date,r.start_date) as end_date,
        r.country_code, r.category, r.race_type, mg.group_code as race_group_code
      into v_race
      from public.races r
      left join public.country_market_group_members mg on upper(mg.country_code)=upper(r.country_code)
      where public.sponsor_race_allowed_for_club_objective_v1(r.id) and r.start_date between v_from_date and v_season_end
        and lower(coalesce(r.status::text,'scheduled')) not in (
          'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
        )
        and not (r.id = any(v_used))
      order by
        case when v_index in (3,4,6) and lower(coalesce(r.race_type,''))='stage_race' then 0 else 1 end,
        md5(r.id::text || p_offer_id::text || '|global-fallback-v4-' || v_index::text)
      limit 1;
    end if;

    if not found then exit; end if;
    v_used := v_used || v_race.id;

    case v_index
      when 1 then
        v_required_result := 'race_start';
        v_title := v_race.name || ': start the race';
        v_description := 'Start ' || v_race.name || ' with your team. The objective is completed when your team appears on the race start list.';
        v_evaluation_mode := 'race_start_count';
        v_progress_source := 'race_entries';
      when 2 then
        v_required_result := 'classification_visibility';
        v_title := v_race.name || ': appear in the final classification';
        v_description := 'Finish the race with at least one rider listed in the published final classifications.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 3 then
        if lower(coalesce(v_race.race_type,''))='stage_race' then
          v_required_result := 'stage_top_5';
          v_title := v_race.name || ': stage top 5';
          v_description := 'Place at least one rider in the top 5 of a stage in ' || v_race.name || '.';
          v_evaluation_mode := 'stage_result_count';
          v_progress_source := 'stage_results';
        else
          v_required_result := 'race_top_5';
          v_title := v_race.name || ': finish in the top 5';
          v_description := 'Finish at least one rider inside the top 5 of ' || v_race.name || '.';
          v_evaluation_mode := 'race_final_result';
          v_progress_source := 'race_results';
        end if;
      when 4 then
        if lower(coalesce(v_race.race_type,''))='stage_race' then
          v_required_result := 'gc_top_10';
          v_title := v_race.name || ': final GC top 10';
          v_description := 'Finish at least one rider inside the final general-classification top 10 of ' || v_race.name || '.';
        else
          v_required_result := 'race_top_10';
          v_title := v_race.name || ': finish in the top 10';
          v_description := 'Finish at least one rider inside the top 10 of ' || v_race.name || '.';
        end if;
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 5 then
        v_required_result := 'race_podium';
        v_title := v_race.name || ': finish on the podium';
        v_description := 'Finish in the top 3 of ' || v_race.name || ' to deliver a headline result for the sponsor.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      else
        if lower(coalesce(v_race.race_type,''))='stage_race' then
          v_required_result := 'stage_win';
          v_title := v_race.name || ': win a stage';
          v_description := 'Win at least one stage of ' || v_race.name || '.';
          v_evaluation_mode := 'stage_result_count';
          v_progress_source := 'stage_results';
        else
          v_required_result := 'race_win';
          v_title := v_race.name || ': win the race';
          v_description := 'Win ' || v_race.name || '.';
          v_evaluation_mode := 'race_final_result';
          v_progress_source := 'race_results';
        end if;
    end case;

    v_weight := v_weights[v_index];
    if v_index=v_objective_count then
      v_reward := greatest(0,v_bonus-v_allocated);
    else
      v_reward := round(v_bonus::numeric*v_weight/nullif(v_weight_sum,0))::bigint;
      v_allocated := v_allocated+v_reward;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'objective_code',v_required_result,
      'title',v_title,
      'description',v_description,
      'target_race_id',v_race.id::text,
      'target_race_name',v_race.name,
      'target_country_code',v_race.country_code,
      'target_category',v_race.category,
      'target_race_type',v_race.race_type,
      'target_race_start_date',v_race.start_date::text,
      'target_race_end_date',v_race.end_date::text,
      'check_date',v_race.end_date::text,
      'target_check_game_date',v_race.end_date::text,
      'required_result',v_required_result,
      'target_value',1,
      'current_value',0,
      'evaluation_mode',v_evaluation_mode,
      'progress_source',v_progress_source,
      'estimated_reward_amount',v_reward,
      'reward_amount',v_reward,
      'reward_label','$'||to_char(v_reward,'FM999,999,999'),
      'objective_number',v_index,
      'objective_count',v_objective_count,
      'bonus_pool_amount',v_bonus,
      'club_market_group_code',v_club_group,
      'sponsor_market_group_code',v_sponsor_group,
      'target_market_group_code',v_race.race_group_code,
      'target_market_group_name',v_target_group_name,
      'market_group_same',v_same_group,
      'market_group_fallback',v_market_fallback,
      'market_group_split_policy',case when v_same_group then 'shared_group_all' else 'club_sponsor_50_50' end,
      'preview_policy_version','v4_market_group_split'
    ));
  end loop;

  return v_result;
end;
$function$;

-- public.sponsor_attach_race_targets_to_main_sponsor_v1(uuid,boolean)
CREATE OR REPLACE FUNCTION public.sponsor_attach_race_targets_to_main_sponsor_v1(p_club_sponsor_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sponsor public.club_sponsors%rowtype;
  v_company_country text;
  v_club_tier text;
  v_game_date date;
  v_updated integer := 0;
  v_unscheduled integer := 0;
  v_objective record;
  v_race record;
  v_required_result text;
  v_position integer := 0;
  v_objective_count integer := 0;
  v_allow_prestige_fallback boolean;
begin
  if p_club_sponsor_id is null then
    raise exception 'Signed sponsor id is required.';
  end if;

  select *
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id
  for update;

  if not found then
    raise exception 'Signed sponsor not found.';
  end if;

  if v_sponsor.sponsor_kind <> 'main' then
    raise exception 'Only main sponsors can have race-target objectives.';
  end if;

  if auth.uid() is not null
     and not finance.is_club_member_or_owner(v_sponsor.club_id, auth.uid()) then
    raise exception 'Not allowed to update sponsor objectives for this club.';
  end if;

  v_game_date := public.get_current_game_date_safe_v1();

  v_company_country := upper(coalesce(
    nullif(v_sponsor.metadata ->> 'company_country_code', ''),
    nullif(v_sponsor.country_code, '')
  ));

  v_club_tier := lower(coalesce(
    nullif(v_sponsor.metadata ->> 'club_tier', ''),
    'worldteam'
  ));

  select count(*)
  into v_objective_count
  from public.club_sponsor_objectives o
  where o.club_sponsor_id = p_club_sponsor_id
    and o.status = 'active';

  for v_objective in
    select
      o.*,
      row_number() over (order by o.reward_amount desc nulls last, o.created_at asc) as objective_position
    from public.club_sponsor_objectives o
    where o.club_sponsor_id = p_club_sponsor_id
      and o.status = 'active'
      and (
        p_force = true
        or o.target_race_id is null
      )
    order by o.reward_amount desc nulls last, o.created_at asc
  loop
    v_position := v_objective.objective_position;

    v_required_result := public.sponsor_objective_required_result_v1(
      v_objective.objective_code,
      v_objective.title,
      v_position
    );

    /*
      Important:
      Only allow fallback outside sponsor/objective country for real prestige goals.
      Do NOT allow a WorldTeam regional objective to pick a random 2.2 race abroad.
    */
    v_allow_prestige_fallback :=
      v_club_tier in ('worldteam', 'proteam', 'world_team', 'pro_team')
      and v_required_result in (
        'stage_win',
        'gc_top_5',
        'gc_top_10',
        'race_win',
        'race_podium',
        'race_top_5',
        'race_top_10'
      );

    select
      r.id,
      r.name,
      r.start_date,
      r.end_date,
      r.country_code,
      r.category,
      r.race_type,
      case
        when v_company_country is not null and upper(r.country_code) = v_company_country then 0
        when v_objective.country_code is not null and upper(r.country_code) = upper(v_objective.country_code) then 1
        else 2
      end as priority_bucket
    into v_race
    from public.races r
    where public.sponsor_race_allowed_for_club_objective_v1(r.id) and coalesce(r.end_date, r.start_date) >= v_game_date
      and (
        -- Preferred: sponsor country
        (v_company_country is not null and upper(r.country_code) = v_company_country)

        -- Also allowed: country already stored on objective
        or (v_objective.country_code is not null and upper(r.country_code) = upper(v_objective.country_code))

        -- Prestige fallback only for high-tier races, never random low-tier 2.2 abroad
        or (
          v_allow_prestige_fallback
          and (
            r.category ilike '%UWT%'
            or r.category ilike '%World%'
            or r.category ilike '%2.1%'
            or r.category ilike '%1.1%'
            or r.category ilike '%2.Pro%'
            or r.category ilike '%1.Pro%'
          )
        )
      )
    order by
      case
        when v_company_country is not null and upper(r.country_code) = v_company_country then 0
        when v_objective.country_code is not null and upper(r.country_code) = upper(v_objective.country_code) then 1
        else 2
      end,
      r.start_date asc,
      case
        when r.category ilike '%UWT%' then 0
        when r.category ilike '%2.Pro%' or r.category ilike '%1.Pro%' then 1
        when r.category ilike '%2.1%' or r.category ilike '%1.1%' then 2
        when r.category ilike '%2.2%' or r.category ilike '%1.2%' then 3
        else 4
      end,
      r.name asc
    limit 1;

    if v_race.id is null then
      update public.club_sponsor_objectives o
      set
        check_state = 'not_scheduled',
        target_race_id = null,
        target_stage_id = null,
        target_check_game_date = null,
        metadata = coalesce(o.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'target_type', 'none',
            'objective_family', 'sponsor_result',
            'required_result', v_required_result,
            'target_assignment_status', 'no_realistic_remaining_race',
            'target_assignment_note', 'No suitable sponsor-country, objective-country, or prestige race remains. Objective is not forced.',
            'assigned_by', 'sponsor_attach_race_targets_to_main_sponsor_v1',
            'assigned_at', now()
          )
      where o.id = v_objective.id;

      v_unscheduled := v_unscheduled + 1;
    else
      update public.club_sponsor_objectives o
      set
        target_race_id = v_race.id,
        target_stage_id = null,
        target_check_game_date = coalesce(v_race.end_date, v_race.start_date),
        check_state = 'scheduled',
        metadata = coalesce(o.metadata, '{}'::jsonb)
          || jsonb_build_object(
            'target_type', 'race',
            'objective_family',
              case
                when v_race.priority_bucket in (0, 1) then 'regional_result'
                else 'prestige_result'
              end,
            'required_result', v_required_result,
            'race_id', v_race.id,
            'race_name', v_race.name,
            'race_category', v_race.category,
            'race_type', v_race.race_type,
            'target_country_code', v_race.country_code,
            'check_after', 'race_finished',
            'check_game_date', coalesce(v_race.end_date, v_race.start_date),
            'user_visible_deadline_label',
              'Checked after ' || v_race.name || ' finishes',
            'target_assignment_status', 'scheduled',
            'assigned_by', 'sponsor_attach_race_targets_to_main_sponsor_v1',
            'assigned_at', now()
          )
      where o.id = v_objective.id;

      v_updated := v_updated + 1;
    end if;

    v_race := null;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id,
    'club_id', v_sponsor.club_id,
    'sponsor_name', v_sponsor.name,
    'sponsor_country_code', v_company_country,
    'club_tier', v_club_tier,
    'current_game_date', v_game_date,
    'active_objective_count', v_objective_count,
    'objectives_scheduled', v_updated,
    'objectives_not_scheduled', v_unscheduled,
    'important_note', 'Strict target selection is active. Unrelated low-category races abroad are not assigned.'
  );
end;
$function$;

-- public.sponsor_sync_signed_offer_preview_objectives_v1(uuid,uuid)
CREATE OR REPLACE FUNCTION public.sponsor_sync_signed_offer_preview_objectives_v1(p_club_sponsor_id uuid, p_offer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sponsor record;
  v_offer record;
  v_offer_id uuid;
  v_preview_objectives jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;

  obj jsonb;
  v_code text;
  v_title text;
  v_reward_amount numeric;
  v_target_value integer;
  v_current_value integer;
  v_country_code text;
  v_objective_id uuid;
  v_objective_key text;
begin
  select
    cs.*,
    to_jsonb(cs) as sponsor_json
  into v_sponsor
  from public.club_sponsors cs
  where cs.id = p_club_sponsor_id;

  if v_sponsor.id is null then
    return jsonb_build_object(
      'status', 'error',
      'message', 'club_sponsor_not_found',
      'club_sponsor_id', p_club_sponsor_id::text
    );
  end if;

  v_offer_id := p_offer_id;

  -- Try to resolve source offer id from sponsor metadata/json if present.
  if v_offer_id is null then
    begin
      v_offer_id := nullif(coalesce(
        v_sponsor.sponsor_json->>'offer_id',
        v_sponsor.sponsor_json->>'source_offer_id',
        v_sponsor.sponsor_json->'metadata'->>'offer_id',
        v_sponsor.sponsor_json->'metadata'->>'source_offer_id'
      ), '')::uuid;
    exception when others then
      v_offer_id := null;
    end;
  end if;

  -- If no explicit offer id, find the latest accepted/offered matching offer
  -- for this sponsor/company/club.
  if v_offer_id is null then
    select o.id
    into v_offer_id
    from public.club_sponsor_offers o
    left join public.sponsor_companies sc
      on sc.id = o.company_id
    where o.club_id = v_sponsor.club_id
      and o.sponsor_kind = v_sponsor.sponsor_kind
      and o.status in ('accepted', 'offered')
      and (
        sc.name = v_sponsor.name
        or o.id::text = coalesce(
          v_sponsor.sponsor_json->>'offer_id',
          v_sponsor.sponsor_json->>'source_offer_id',
          v_sponsor.sponsor_json->'metadata'->>'offer_id',
          v_sponsor.sponsor_json->'metadata'->>'source_offer_id'
        )
      )
    order by
      case o.status when 'accepted' then 0 else 1 end,
      o.updated_at desc nulls last,
      o.created_at desc nulls last
    limit 1;
  end if;

  if v_offer_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'message', 'source_offer_not_found',
      'club_sponsor_id', p_club_sponsor_id::text,
      'sponsor_name', v_sponsor.name
    );
  end if;

  select
    o.*,
    to_jsonb(o) as offer_json
  into v_offer
  from public.club_sponsor_offers o
  where o.id = v_offer_id;

  if v_offer.id is null then
    return jsonb_build_object(
      'status', 'error',
      'message', 'offer_id_not_found',
      'offer_id', v_offer_id::text
    );
  end if;

  v_preview_objectives := coalesce(v_offer.metadata->'preview_objectives', '[]'::jsonb);

  if jsonb_typeof(v_preview_objectives) is distinct from 'array' then
    return jsonb_build_object(
      'status', 'skipped',
      'message', 'preview_objectives_not_array',
      'offer_id', v_offer_id::text
    );
  end if;

  for obj in
    select value
    from jsonb_array_elements(v_preview_objectives)
  loop
    -- Never activate objectives for national or individual-only races,
    -- including stale previews from signed offers.
    if nullif(obj->>'target_race_id','') is not null
      and not public.sponsor_race_allowed_for_club_objective_v1(
        case when (obj->>'target_race_id') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (obj->>'target_race_id')::uuid else null end
      ) then
       v_skipped := v_skipped + 1;
       continue;
    end if;

    v_code := nullif(coalesce(
      obj->>'objective_code',
      obj->>'required_result'
    ), '');

    -- Disabled by design.
    if v_code is null or v_code = 'race_finish' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_title := coalesce(
      nullif(obj->>'title', ''),
      v_code
    );

    begin
      v_reward_amount := coalesce(
        nullif(obj->>'reward_amount', '')::numeric,
        nullif(obj->>'estimated_reward_amount', '')::numeric,
        0
      );
    exception when others then
      v_reward_amount := 0;
    end;

    begin
      v_target_value := greatest(1, coalesce(nullif(obj->>'target_value', '')::integer, 1));
    exception when others then
      v_target_value := 1;
    end;

    begin
      v_current_value := greatest(0, coalesce(nullif(obj->>'current_value', '')::integer, 0));
    exception when others then
      v_current_value := 0;
    end;

    v_country_code := nullif(coalesce(
      obj->>'target_country_code',
      obj->>'target_race_country',
      obj->>'country_code'
    ), '');

    v_objective_key := md5(
      v_code || '|' ||
      coalesce(obj->>'target_race_id', '') || '|' ||
      coalesce(obj->>'target_country_code', '') || '|' ||
      coalesce(obj->>'target_category', '') || '|' ||
      coalesce(obj->>'target_check_game_date', '') || '|' ||
      coalesce(obj->>'title', '')
    );

    select o.id
    into v_objective_id
    from public.club_sponsor_objectives o
    where o.club_sponsor_id = p_club_sponsor_id
      and (
        o.metadata->>'source_offer_objective_key' = v_objective_key
        or (
          o.objective_code = v_code
          and coalesce(o.metadata->>'target_race_id', '') = coalesce(obj->>'target_race_id', '')
          and coalesce(o.metadata->>'target_country_code', '') = coalesce(obj->>'target_country_code', '')
          and coalesce(o.metadata->>'target_category', '') = coalesce(obj->>'target_category', '')
        )
      )
    order by o.created_at desc nulls last
    limit 1;

    if v_objective_id is null then
      insert into public.club_sponsor_objectives (
        club_sponsor_id,
        objective_code,
        title,
        reward_amount,
        target_value,
        current_value,
        country_code,
        status,
        check_state,
        objective_result_state,
        metadata
      )
      values (
        p_club_sponsor_id,
        v_code,
        v_title,
        v_reward_amount,
        v_target_value,
        v_current_value,
        v_country_code,
        'active',
        'scheduled',
        'pending',
        obj
          || jsonb_build_object(
            'synced_from_offer_preview_v1', true,
            'source_offer_id', v_offer_id::text,
            'source_offer_objective_key', v_objective_key,
            'club_sponsor_id', p_club_sponsor_id::text,
            'synced_at', now()
          )
      )
      returning id into v_objective_id;

      v_inserted := v_inserted + 1;
    else
      update public.club_sponsor_objectives
      set
        objective_code = v_code,
        title = v_title,
        reward_amount = v_reward_amount,
        target_value = v_target_value,
        current_value = v_current_value,
        country_code = v_country_code,
        status = 'active',
        check_state = case
          when objective_result_state = 'completed' then check_state
          else 'scheduled'
        end,
        objective_result_state = case
          when objective_result_state = 'completed' then objective_result_state
          else 'pending'
        end,
        metadata = coalesce(metadata, '{}'::jsonb)
          || obj
          || jsonb_build_object(
            'synced_from_offer_preview_v1', true,
            'source_offer_id', v_offer_id::text,
            'source_offer_objective_key', v_objective_key,
            'club_sponsor_id', p_club_sponsor_id::text,
            'resynced_at', now()
          ),
        updated_at = now()
      where id = v_objective_id;

      v_updated := v_updated + 1;
    end if;

    -- Optional physical columns, if your schema has them.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'target_race_id'
    ) and nullif(obj->>'target_race_id', '') is not null then
      execute 'update public.club_sponsor_objectives set target_race_id = $1 where id = $2'
      using (obj->>'target_race_id')::uuid, v_objective_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'target_race_name'
    ) then
      execute 'update public.club_sponsor_objectives set target_race_name = $1 where id = $2'
      using nullif(obj->>'target_race_name', ''), v_objective_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'target_check_game_date'
    ) then
      execute 'update public.club_sponsor_objectives set target_check_game_date = $1 where id = $2'
      using nullif(coalesce(obj->>'target_check_game_date', obj->>'check_date'), '')::date, v_objective_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'club_sponsor_objectives'
        and column_name = 'required_result'
    ) then
      execute 'update public.club_sponsor_objectives set required_result = $1 where id = $2'
      using coalesce(obj->>'required_result', v_code), v_objective_id;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'club_sponsor_id', p_club_sponsor_id::text,
    'sponsor_name', v_sponsor.name,
    'offer_id', v_offer_id::text,
    'preview_objective_count', jsonb_array_length(v_preview_objectives),
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$function$;


-- Store exact rows before removing invalid active Season 2 targets.
CREATE TABLE IF NOT EXISTS private.sponsor_national_goal_cleanup_audit_v1 (
 objective_id uuid PRIMARY KEY,
 sponsor_id uuid NOT NULL,
 snapshot jsonb NOT NULL,
 reason text NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.sponsor_national_goal_cleanup_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sponsor_national_goal_cleanup_audit_v1 FROM PUBLIC,anon,authenticated;

WITH invalid_goals AS (
 SELECT obj.id,obj.club_sponsor_id,to_jsonb(obj) snapshot
 FROM public.club_sponsor_objectives obj
 JOIN public.club_sponsors sponsor ON sponsor.id=obj.club_sponsor_id
 WHERE sponsor.season_number=2 AND sponsor.status='active'
   AND obj.status='active' AND obj.payout_transaction_id IS NULL
   AND obj.target_race_id IS NOT NULL
   AND NOT public.sponsor_race_allowed_for_club_objective_v1(obj.target_race_id)
), recorded AS (
 INSERT INTO private.sponsor_national_goal_cleanup_audit_v1(objective_id,sponsor_id,snapshot,reason)
 SELECT id,club_sponsor_id,snapshot,
  'National/individual competition is not eligible for team sponsor bonus'
 FROM invalid_goals
 ON CONFLICT(objective_id) DO NOTHING
 RETURNING objective_id
)
DELETE FROM public.club_sponsor_objectives obj
WHERE obj.id IN (SELECT objective_id FROM recorded);

-- Idempotently remove invalid targets from accepted offers without changing
-- signed guaranteed amounts, other objectives, payments or finance balances.
DO $accepted_offers$
DECLARE
 v_offer record;
 v_preview jsonb;
 v_sum bigint;
BEGIN
 FOR v_offer IN
   SELECT id,metadata,bonus_pool_amount
   FROM public.club_sponsor_offers o
   WHERE o.season_number=2 AND o.sponsor_kind='main' AND o.status='accepted'
     AND jsonb_typeof(o.metadata->'preview_objectives')='array'
 LOOP
  SELECT coalesce(jsonb_agg(x.value ORDER BY x.ord),'[]'::jsonb)
  INTO v_preview
  FROM jsonb_array_elements(v_offer.metadata->'preview_objectives') WITH ORDINALITY x(value,ord)
  WHERE nullif(x.value->>'target_race_id','') IS NOT NULL
    AND (x.value->>'target_race_id') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.sponsor_race_allowed_for_club_objective_v1((x.value->>'target_race_id')::uuid);
  IF v_preview IS DISTINCT FROM v_offer.metadata->'preview_objectives' THEN
    SELECT coalesce(sum((v.value->>'reward_amount')::bigint),0)
    INTO v_sum FROM jsonb_array_elements(v_preview) v(value);
    UPDATE public.club_sponsor_offers o
    SET metadata=coalesce(o.metadata,'{}'::jsonb) || jsonb_build_object(
       'preview_objectives',v_preview,
       'preview_objective_count',jsonb_array_length(v_preview),
       'preview_objective_total_reward',v_sum,
       'preview_objectives_match_bonus_pool',v_sum=coalesce(o.bonus_pool_amount,0),
       'national_individual_objectives_removed_without_replacement',true,
       'national_individual_objectives_removed_at',now(),
       'national_individual_reward_removed',greatest(0,coalesce(o.bonus_pool_amount,0)-v_sum)
     ), updated_at=now()
    WHERE o.id=v_offer.id;
  END IF;
 END LOOP;
END
$accepted_offers$;

-- Repair any still-unaccepted offers so their achievable club-race
-- goals and allocated rewards continue to match the promised bonus pool.
DO $offered_main$
DECLARE
 v_offer record;
 v_preview jsonb;
 v_sum bigint;
 v_bad integer;
BEGIN
 FOR v_offer IN
   SELECT id,metadata,bonus_pool_amount
   FROM public.club_sponsor_offers o
   WHERE o.season_number=2 AND o.sponsor_kind='main' AND o.status='offered'
     AND jsonb_typeof(o.metadata->'preview_objectives')='array'
 LOOP
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_offer.metadata->'preview_objectives') obj
    WHERE nullif(obj->>'target_race_id','') IS NOT NULL
      AND NOT public.sponsor_race_allowed_for_club_objective_v1(
        CASE WHEN (obj->>'target_race_id')~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (obj->>'target_race_id')::uuid ELSE NULL END
      )
  ) THEN CONTINUE; END IF;
  v_preview:=public.sponsor_build_offer_preview_objectives_v4(v_offer.id);
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements(v_preview) obj
    WHERE NOT public.sponsor_race_allowed_for_club_objective_v1((obj->>'target_race_id')::uuid);
  IF v_bad>0 OR jsonb_array_length(v_preview)=0 THEN
    RAISE EXCEPTION 'Main sponsor offer % cannot produce valid club goals',v_offer.id;
  END IF;
  SELECT coalesce(sum((obj->>'reward_amount')::bigint),0)
    INTO v_sum FROM jsonb_array_elements(v_preview) obj;
  IF v_sum IS DISTINCT FROM v_offer.bonus_pool_amount THEN
    RAISE EXCEPTION 'Sponsor offer % rewards do not match bonus pool',v_offer.id;
  END IF;
  UPDATE public.club_sponsor_offers o
  SET metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
      'preview_objectives',v_preview,
      'preview_objective_count',jsonb_array_length(v_preview),
      'preview_objective_total_reward',v_sum,
      'preview_objectives_match_bonus_pool',true,
      'preview_objectives_refreshed_at',now(),
      'preview_objectives_version','v4_market_group_split',
      'national_individual_races_excluded',true
   ),updated_at=now()
  WHERE o.id=v_offer.id;
 END LOOP;
END
$offered_main$;

DROP TRIGGER IF EXISTS trg_sponsor_enforce_club_race_objective_v1 ON public.club_sponsor_objectives;
CREATE TRIGGER trg_sponsor_enforce_club_race_objective_v1
BEFORE INSERT OR UPDATE OF status,target_race_id,target_stage_id,metadata
ON public.club_sponsor_objectives
FOR EACH ROW EXECUTE FUNCTION public.sponsor_enforce_club_race_objective_v1();

DROP TRIGGER IF EXISTS trg_sponsor_enforce_club_offer_preview_v1 ON public.club_sponsor_offers;
CREATE TRIGGER trg_sponsor_enforce_club_offer_preview_v1
BEFORE INSERT OR UPDATE OF metadata,status
ON public.club_sponsor_offers
FOR EACH ROW EXECUTE FUNCTION public.sponsor_enforce_club_offer_preview_v1();
