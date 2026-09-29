-- Prevent host applications from changing after the World Nations Final host is selected.

create or replace function public.submit_nations_host_application_v1(
  p_edition_id uuid,
  p_statement text default null::text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_edition public.nations_competition_editions%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit a host application.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null or v_edition.season_number<>v_ctx.season_number then
    raise exception 'World Nations edition not found for the current season.';
  end if;

  if v_edition.host_association_id is not null then
    raise exception 'The World Nations Final host has already been selected.';
  end if;

  if v_edition.status not in ('planned','qualification') then
    raise exception 'Host applications are closed for this edition.';
  end if;

  insert into public.nations_host_applications(
    edition_id,association_id,submitted_by_user_id,statement,status
  )
  values(
    v_edition.id,v_ctx.association_id,v_uid,
    nullif(btrim(coalesce(p_statement,'')),''),
    'submitted'
  )
  on conflict(edition_id,association_id) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      statement=excluded.statement,
      status='submitted',
      submitted_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  returning id into v_id;

  return v_id;
end;
$function$;
