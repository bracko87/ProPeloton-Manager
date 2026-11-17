-- Optimize sponsor preview eligibility during the protected Season 1 restart.
-- No rule change: this is the exact predicate from
-- public.sponsor_race_allowed_for_club_objective_v1(uuid), evaluated on the
-- race row already present in the preview selector.
-- Keep the existing enforcement trigger and helper unchanged.
do $patch$
declare
  v_source text;
  v_fixed text;
  v_needle text := 'and public.sponsor_race_allowed_for_club_objective_v1(r.id)';
  v_filter text := 'and r.category::text in (''1.1'',''1.2'',''1.HC'',''1.Pro'',''1.UWT'',''2.1'',''2.2'',''2.HC'',''2.Pro'',''2.UWT'')
    and coalesce(lower(r.metadata->>''individual_only''),''false'') <> ''true''
    and coalesce(lower(r.metadata->>''national_championship''),''false'') <> ''true''
    and coalesce(lower(r.metadata->>''nations_competition''),''false'') <> ''true''
    and coalesce(lower(r.metadata->>''national_team_only''),''false'') <> ''true''';
  v_count integer;
begin
  select pg_get_functiondef(
    'public.sponsor_offer_visibility_preview_normalizer_v1()'::regprocedure
  ) into v_source;
  v_count := (length(v_source)-length(replace(v_source,v_needle,'')))/length(v_needle);
  if v_count = 0 then
    -- Already applied, safe to re-run on a database containing the fix.
    return;
  end if;
  if v_count <> 3 then
    raise exception 'Expected exactly three eligible race selectors, found %',v_count;
  end if;
  v_fixed := replace(v_source,v_needle,v_filter);
  execute v_fixed;
end $patch$;
