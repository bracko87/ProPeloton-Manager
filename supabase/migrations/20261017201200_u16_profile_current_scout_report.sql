do $migration$
declare definition text;
begin
  select pg_get_functiondef(p.oid) into definition from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_public_youth_rider_profile_v1';
  if definition is null or position('''compensation'',sr.suggested_compensation' in definition)=0
    or position('and sr.expires_on>=public.get_current_game_date_date()' in definition)=0
  then raise exception 'Unexpected public U16 profile RPC'; end if;
  definition:=replace(definition,
    '''compensation'',sr.suggested_compensation',
    '''compensation'',sr.suggested_compensation,
        ''assessment_band'',sr.assessment_band,
        ''confidence'',sr.confidence,
        ''status'',sr.status');
  definition:=replace(definition,
    'and sr.expires_on>=public.get_current_game_date_date()',
    'and sr.expires_on>=public.get_current_game_date_date()
        and sr.discovered_on>=date_trunc(''week'',public.get_current_game_date_date())::date');
  execute definition;
end;
$migration$;