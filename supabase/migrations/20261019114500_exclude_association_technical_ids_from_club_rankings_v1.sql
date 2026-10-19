-- Exclude ONLY generated hidden National Association race identities from normal
-- club ranking views. Never exclude real AI national clubs or World Nations standings.
-- Preserve all historical points, race results, technical IDs and national entries.
do $rank_fix$
declare
  v_source text;
  v_new text;
  v_filter text := ' AND NOT EXISTS (SELECT 1 FROM public.national_association_race_team_identities nation_id WHERE nation_id.technical_club_id = c.id AND nation_id.identity_source = ''generated_hidden_national_team'')';
begin
  -- Public team directory/ranking feed.
  v_source := pg_get_viewdef('public.team_rankings_view'::regclass,true);
  v_new := replace(v_source,'WHERE deleted_at IS NULL',
                             'WHERE deleted_at IS NULL' || v_filter);
  if v_source=v_new then
    raise exception 'team_rankings_view structure changed; refuse unsafe patch';
  end if;
  execute 'create or replace view public.team_rankings_view as ' || v_new;

  -- Tier/division rankings and their ranking-position calculation.
  v_source := pg_get_viewdef('public.team_ranking_tiebreakers_by_season_v1'::regclass,true);
  v_new := replace(v_source,
      'WHERE COALESCE(c.deleted_at, NULL::timestamp with time zone) IS NULL',
      'WHERE COALESCE(c.deleted_at, NULL::timestamp with time zone) IS NULL' || v_filter);
  if v_source=v_new then
    raise exception 'team_ranking_tiebreakers_by_season_v1 structure changed; refuse unsafe patch';
  end if;
  execute 'create or replace view public.team_ranking_tiebreakers_by_season_v1 as ' || v_new;

  -- International ranking should exclude hidden identities from both the
  -- zero-point club roster and the totalled points source (including future data).
  v_source := pg_get_viewdef('public.team_international_points_by_season_v1'::regclass,true);
  v_new := replace(v_source,'WHERE c.deleted_at IS NULL',
                             'WHERE c.deleted_at IS NULL' || v_filter);
  if v_source=v_new then
    raise exception 'team_international_points_by_season_v1 club filter changed; refuse unsafe patch';
  end if;

  v_source := v_new;
  v_new := replace(v_source,
     'WHERE l.team_id IS NOT NULL AND l.season_year IS NOT NULL',
     'WHERE l.team_id IS NOT NULL AND l.season_year IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.national_association_race_team_identities nation_id WHERE nation_id.technical_club_id = l.team_id AND nation_id.identity_source = ''generated_hidden_national_team'')');
  if v_source=v_new then
    raise exception 'team_international_points_by_season_v1 totals filter changed; refuse unsafe patch';
  end if;
  execute 'create or replace view public.team_international_points_by_season_v1 as ' || v_new;
end $rank_fix$;

comment on view public.team_rankings_view is
  'Regular clubs only: excludes generated hidden National Association technical identities, but not real AI national clubs.';
comment on view public.team_international_points_by_season_v1 is
  'Regular international club rankings exclude generated National Association race identities. World Nations standings remain independent.';
