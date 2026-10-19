-- Remove fake national placeholders from normal team standings, retaining
-- historical awards, original AI clubs and the separate World Nations standing.
-- Canonical distinction: original AI national clubs versus artificial Association
-- technical IDs and unattached two-letter placeholders created for the rollout.
-- Original clubs' identities, rider rosters and points are untouched.
create or replace function public.is_nonclub_national_ranking_identity_v1(p_team_id uuid)
returns boolean
language sql stable security definer set search_path to ''
as $identity$
  select exists(
    select 1 from public.national_association_race_team_identities ni
    where ni.technical_club_id = p_team_id
      and ni.identity_source = 'generated_hidden_national_team'
  ) or exists (
    select 1 from public.clubs c
    where c.id=p_team_id
      and c.is_ai is true
      and c.created_at >= timestamptz '2026-09-29 00:00:00+00'
      and c.name = upper(coalesce(c.country_code,'')) || ' National Team'
      and not exists (
        select 1 from public.club_roster_country_rules cr
        where cr.club_id=c.id
          and cr.rule_key='national_team_country_lock_v1'
          and cr.is_active is true
          and upper(cr.allowed_country_code)=upper(c.country_code)
      )
  );
$identity$;
comment on function public.is_nonclub_national_ranking_identity_v1(uuid) is
  'True only for hidden Association technical identities and post-launch unregistered two-letter fake AI national placeholders. Real pre-existing AI national clubs remain eligible.';

-- Fail closed if a live original national club would be omitted.
do $guard$
begin
  if exists(
    select 1 from public.clubs c
    join public.club_roster_country_rules r on r.club_id=c.id
    where r.rule_key='national_team_country_lock_v1' and r.is_active
      and c.created_at < '2026-09-29'::timestamptz
      and public.is_nonclub_national_ranking_identity_v1(c.id)
  ) then raise exception 'Original AI national club was improperly classified as a placeholder'; end if;
end $guard$;

-- Public team-list ranking.
create or replace view public.team_rankings_view as
 SELECT id,
    name,
    country_code,
    club_tier,
    tier2_division,
    tier3_division,
    amateur_division,
    season_points,
    created_at,
    logo_path,
    is_ai,
    is_active
   FROM clubs c
  WHERE deleted_at IS NULL AND NOT public.is_nonclub_national_ranking_identity_v1(c.id) AND NOT (EXISTS ( SELECT 1
           FROM national_association_race_team_identities nation_id
          WHERE nation_id.technical_club_id = c.id AND nation_id.identity_source = 'generated_hidden_national_team'::text));
-- Tier/division ranking source (downstream ordered view recalculates automatically).
create or replace view public.team_ranking_tiebreakers_by_season_v1 as
 WITH seasons AS (
         SELECT team_ranking_get_current_season_year_v1() AS season_year
        ), ranking_clubs AS (
         SELECT c.id AS team_id,
            c.name AS team_name,
            c.club_tier::text AS club_tier,
            c.tier2_division,
            c.tier3_division,
            c.amateur_division
           FROM clubs c
          WHERE COALESCE(c.deleted_at, NULL::timestamp with time zone) IS NULL AND NOT public.is_nonclub_national_ranking_identity_v1(c.id) AND NOT (EXISTS ( SELECT 1
                   FROM national_association_race_team_identities nation_id
                  WHERE nation_id.technical_club_id = c.id AND nation_id.identity_source = 'generated_hidden_national_team'::text)) AND COALESCE(c.club_type, 'main'::text) <> 'developing'::text AND (c.club_tier::text = ANY (ARRAY['worldteam'::text, 'proteam'::text, 'continental'::text, 'amateur'::text]))
        )
 SELECT s.season_year,
    rc.team_id,
    rc.team_name,
    rc.club_tier,
    rc.tier2_division,
    rc.tier3_division,
    rc.amateur_division,
    team_ranking_get_team_international_points_v1(rc.team_id, s.season_year) AS international_points,
    team_ranking_get_completed_race_count_v1(rc.team_id, s.season_year) AS completed_race_count,
    team_ranking_get_race_reputation_value_v1(rc.team_id) AS race_reputation_value
   FROM seasons s
     CROSS JOIN ranking_clubs rc;
-- International points ranking (both historical scorer and zero-point placeholders).
create or replace view public.team_international_points_by_season_v1 as
 WITH current_season AS MATERIALIZED (
         SELECT team_ranking_get_current_season_year_v1() AS season_year
        ), totals AS MATERIALIZED (
         SELECT l.season_year,
            l.team_id,
            max(l.team_name_snapshot) AS team_name_snapshot,
            sum(l.team_points) AS international_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'oneday_finish'::text) AS oneday_finish_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'stage_finish'::text) AS stage_finish_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'leader_day'::text) AS leader_day_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'final_gc'::text) AS final_gc_points,
            count(*) AS scoring_rows,
            count(DISTINCT l.race_id) AS scoring_races,
            count(DISTINCT l.stage_id) AS scoring_stages
           FROM international_points_awards_ledger_v1 l
          WHERE l.team_id IS NOT NULL AND l.season_year IS NOT NULL AND NOT public.is_nonclub_national_ranking_identity_v1(l.team_id) AND NOT (EXISTS ( SELECT 1
                   FROM national_association_race_team_identities nation_id
                  WHERE nation_id.technical_club_id = l.team_id AND nation_id.identity_source = 'generated_hidden_national_team'::text))
          GROUP BY l.season_year, l.team_id
        ), current_teams AS MATERIALIZED (
         SELECT c.id AS team_id,
            c.name AS team_name_snapshot
           FROM clubs c
          WHERE c.deleted_at IS NULL AND NOT public.is_nonclub_national_ranking_identity_v1(c.id) AND NOT (EXISTS ( SELECT 1
                   FROM national_association_race_team_identities nation_id
                  WHERE nation_id.technical_club_id = c.id AND nation_id.identity_source = 'generated_hidden_national_team'::text)) AND COALESCE(c.club_type, 'main'::text) <> 'developing'::text AND (c.club_tier::text = ANY (ARRAY['worldteam'::text, 'proteam'::text, 'continental'::text, 'amateur'::text]))
        ), combined AS (
         SELECT t.season_year,
            t.team_id,
            t.team_name_snapshot,
            COALESCE(t.international_points, 0::numeric) AS international_points,
            COALESCE(t.oneday_finish_points, 0::numeric) AS oneday_finish_points,
            COALESCE(t.stage_finish_points, 0::numeric) AS stage_finish_points,
            COALESCE(t.leader_day_points, 0::numeric) AS leader_day_points,
            COALESCE(t.final_gc_points, 0::numeric) AS final_gc_points,
            t.scoring_rows,
            t.scoring_races,
            t.scoring_stages
           FROM totals t
        UNION ALL
         SELECT cs.season_year,
            ct.team_id,
            ct.team_name_snapshot,
            0::numeric AS international_points,
            0::numeric AS oneday_finish_points,
            0::numeric AS stage_finish_points,
            0::numeric AS leader_day_points,
            0::numeric AS final_gc_points,
            0::bigint AS scoring_rows,
            0::bigint AS scoring_races,
            0::bigint AS scoring_stages
           FROM current_season cs
             CROSS JOIN current_teams ct
             LEFT JOIN totals t ON t.season_year = cs.season_year AND t.team_id = ct.team_id
          WHERE t.team_id IS NULL
        )
 SELECT rank() OVER (PARTITION BY season_year ORDER BY international_points DESC, team_name_snapshot, team_id) AS international_rank,
    season_year,
    team_id,
    team_name_snapshot,
    international_points,
    oneday_finish_points,
    stage_finish_points,
    leader_day_points,
    final_gc_points,
    scoring_rows,
    scoring_races,
    scoring_stages
   FROM combined;
-- Live ordered standings RPC previously queried clubs directly, bypassing filters.
CREATE OR REPLACE FUNCTION public.team_ranking_get_ordered_standings_v1(p_season_year integer DEFAULT NULL::integer, p_club_tier text DEFAULT NULL::text, p_division text DEFAULT NULL::text)
 RETURNS TABLE(ranking_position integer, season_year integer, team_id uuid, team_name text, club_tier text, division text, international_points numeric, completed_race_count integer, race_reputation_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with target_season as materialized (
    select coalesce(p_season_year, public.team_ranking_get_current_season_year_v1()) as season_year
  ),
  ranking_clubs as materialized (
    select c.id as team_id, c.name as team_name, c.club_tier::text as club_tier,
      case when c.club_tier::text='worldteam' then 'WORLD'
           when c.club_tier::text='proteam' then c.tier2_division::text
           when c.club_tier::text='continental' then c.tier3_division::text
           when c.club_tier::text='amateur' then c.amateur_division::text
           else null end as division,
      coalesce(c.reputation,0)::numeric as race_reputation_value
    from public.clubs c
    where c.deleted_at is null and not public.is_nonclub_national_ranking_identity_v1(c.id) and coalesce(c.club_type,'main') <> 'developing'
      and c.club_tier::text in ('worldteam','proteam','continental','amateur')
      and (p_club_tier is null or c.club_tier::text=p_club_tier)
      and (p_division is null or case
        when c.club_tier::text='worldteam' then 'WORLD'
        when c.club_tier::text='proteam' then c.tier2_division::text
        when c.club_tier::text='continental' then c.tier3_division::text
        when c.club_tier::text='amateur' then c.amateur_division::text
        else null end=p_division)
  ),
  points as materialized (
    select l.team_id, sum(l.team_points)::numeric as international_points
    from public.international_points_awards_ledger_v1 l
    join target_season ts on ts.season_year=l.season_year
    where l.team_id is not null group by l.team_id
  ),
  completed as materialized (
    select rsr.team_id, count(distinct rsr.race_id)::integer as completed_race_count
    from public.race_stage_results rsr
    join public.races r on r.id=rsr.race_id
    join target_season ts on extract(year from r.start_date)::integer=ts.season_year
    group by rsr.team_id
  ),
  base as materialized (
    select ts.season_year,rc.team_id,rc.team_name,rc.club_tier,rc.division,
      coalesce(p.international_points,0)::numeric international_points,
      coalesce(cr.completed_race_count,0)::integer completed_race_count,
      rc.race_reputation_value
    from ranking_clubs rc cross join target_season ts
    left join points p on p.team_id=rc.team_id
    left join completed cr on cr.team_id=rc.team_id
  )
  select row_number() over (
    order by base.international_points desc,base.completed_race_count desc,
      base.race_reputation_value desc,lower(base.team_name) asc,base.team_id asc
    )::integer,
    base.season_year,base.team_id,base.team_name,base.club_tier,base.division,
    base.international_points,base.completed_race_count,base.race_reputation_value
  from base order by base.international_points desc,base.completed_race_count desc,
    base.race_reputation_value desc,lower(base.team_name) asc,base.team_id asc;
$function$

