-- Youth Academy notification visuals and structured staff payload enrichment.
-- Uses the same Youth Academy Update artwork for the four existing Youth notification types.

do $block$
declare
  v_image constant text :=
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png';
begin
  update public.notification_types
  set default_image_url = v_image,
      preference_group = case
        when code = 'YOUTH_RACE_REPORT' then 'races'
        else 'teamUpdates'
      end
  where code in (
    'YOUTH_ACADEMY_STARTED',
    'YOUTH_RACE_REPORT',
    'YOUTH_STAFF_DECISION',
    'YOUTH_STAFF_HANDOVER'
  );

  -- Keep already-created Youth notifications compatible with surfaces that
  -- only read payload images and do not expose notification_types.default_image_url.
  update public.notifications n
  set payload_json = coalesce(n.payload_json, '{}'::jsonb)
    || jsonb_build_object('image_url', v_image)
  from public.notification_types nt
  where nt.id = n.type_id
    and nt.code in (
      'YOUTH_ACADEMY_STARTED',
      'YOUTH_RACE_REPORT',
      'YOUTH_STAFF_DECISION',
      'YOUTH_STAFF_HANDOVER'
    );
end;
$block$;

create or replace function private.notify_youth_staff_v1(
  p_academy_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_key text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_payload jsonb;
  v_staff_id uuid;
  v_staff public.club_staff%rowtype;
begin
  select c.owner_user_id
  into v_user
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where a.id=p_academy_id
    and not a.is_ai
    and c.deleted_at is null;

  if v_user is null then
    return;
  end if;

  v_payload :=
    jsonb_build_object(
      'academy_id', p_academy_id,
      'image_url',
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
    )
    || coalesce(p_payload, '{}'::jsonb);

  begin
    v_staff_id := coalesce(
      nullif(v_payload->>'staff_id','')::uuid,
      nullif(v_payload->>'cover_staff_id','')::uuid
    );
  exception
    when invalid_text_representation then
      v_staff_id := null;
  end;

  if v_staff_id is not null then
    select *
    into v_staff
    from public.club_staff
    where id=v_staff_id
    limit 1;

    if v_staff.id is not null then
      v_payload := v_payload || jsonb_build_object(
        'staff_name', v_staff.staff_name,
        'staff_role', v_staff.role_type,
        'staff_country_code', v_staff.country_code
      );
    end if;
  end if;

  perform public.create_user_game_notification_v1(
    v_user,
    p_type,
    p_title,
    p_message,
    '/dashboard/youth-academy',
    v_payload,
    p_key,
    null
  );
end;
$function$;
