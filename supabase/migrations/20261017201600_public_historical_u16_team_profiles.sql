-- Keep historical U16 team profile links functional after academies become
-- inactive, while retaining read-only, non-private roster/competition data.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_public_youth_academy_profile_v1';
  if v_definition is null
     or position('where a.id=p_academy_id and a.is_active and c.deleted_at is null' in v_definition)=0
  then raise exception 'Unexpected public U16 team profile RPC'; end if;

  v_definition:=replace(v_definition,
    'where a.id=p_academy_id and a.is_active and c.deleted_at is null',
    'where a.id=p_academy_id and c.deleted_at is null');
  v_definition:=replace(v_definition,
    'select a.id academy_id,a.reputation,a.capacity,c.id club_id',
    'select a.id academy_id,a.is_active,a.reputation,a.capacity,c.id club_id');
  v_definition:=replace(v_definition,
    '''capacity'',v_record.capacity',
    '''capacity'',v_record.capacity,''is_active'',v_record.is_active');
  execute v_definition;
end;
$migration$;
