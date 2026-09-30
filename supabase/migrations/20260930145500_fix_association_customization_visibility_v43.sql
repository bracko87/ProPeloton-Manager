-- Follow-up hardening for Association customization reads.

create or replace function public.get_my_national_association_customization_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_association_id uuid;
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_count integer:=0;
  v_balance integer:=0;
  v_can_edit boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select season_number into v_season
  from public.game_state
  where id=true;

  select m.association_id
  into v_association_id
  from public.national_association_memberships m
  where m.user_id=v_uid
    and m.status='active'
  order by m.created_at desc
  limit 1;

  if v_association_id is null then
    return jsonb_build_object('available',false,'reason','not_association_member');
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_association_id;

  if v_assoc.id is null then
    return jsonb_build_object('available',false,'reason','association_not_found');
  end if;

  select count(*)::integer
  into v_count
  from public.national_association_customization_events e
  where e.association_id=v_assoc.id
    and e.season_number=v_season;

  select coalesce(w.balance,0)
  into v_balance
  from public.user_wallets w
  where w.user_id=v_uid;

  select exists(
    select 1
    from public.national_coach_terms t
    where t.association_id=v_assoc.id
      and t.user_id=v_uid
      and t.season_number=v_season
      and t.status='active'
  )
  into v_can_edit;

  return jsonb_build_object(
    'available',true,
    'association_id',v_assoc.id,
    'country_code',v_assoc.country_code,
    'season_number',v_season,
    'can_edit',v_can_edit,
    'flag_url','https://flagcdn.com/w160/'||lower(v_assoc.country_code)||'.png',
    'logo_url',private.national_association_resolved_logo_url_v1(
      v_assoc.country_code,v_assoc.logo_url
    ),
    'custom_logo_url',v_assoc.logo_url,
    'jersey_url',coalesce(
      nullif(btrim(v_assoc.jersey_url),''),
      private.national_association_default_jersey_url_v1(v_assoc.country_code)
    ),
    'custom_jersey_url',v_assoc.jersey_url,
    'default_jersey_url',private.national_association_default_jersey_url_v1(v_assoc.country_code),
    'change_count',v_count,
    'free_change_limit',3,
    'free_changes_remaining',greatest(3-v_count,0),
    'next_change_cost',case when v_count<3 then 0 else 2 end,
    'coin_balance',coalesce(v_balance,0)
  );
end;
$function$;

revoke all on function public.get_my_national_association_customization_v1()
from public,anon;
grant execute on function public.get_my_national_association_customization_v1()
to authenticated;

create or replace function public.get_national_coach_candidate_profiles_v1(
  p_election_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'candidate_id',c.id,
        'user_id',c.user_id,
        'club_id',c.club_id,
        'club_name',cl.name,
        'first_name',coalesce(nullif(c.first_name,''),nullif(p.first_name,'')),
        'last_name',coalesce(nullif(c.last_name,''),nullif(p.last_name,'')),
        'manifesto',c.manifesto,
        'status',c.status,
        'registered_on',c.registered_on_game_date,
        'is_me',c.user_id=auth.uid()
      )
      order by c.registered_on_game_date,c.created_at
    ),
    '[]'::jsonb
  )
  from public.national_coach_candidates c
  join public.national_coach_elections e on e.id=c.election_id
  left join public.clubs cl on cl.id=c.club_id
  left join public.profiles p on p.id=c.user_id
  where c.election_id=p_election_id
    and exists(
      select 1
      from public.national_association_memberships m
      where m.association_id=e.association_id
        and m.user_id=auth.uid()
        and m.status='active'
    );
$function$;

revoke all on function public.get_national_coach_candidate_profiles_v1(uuid)
from public,anon;
grant execute on function public.get_national_coach_candidate_profiles_v1(uuid)
to authenticated;
