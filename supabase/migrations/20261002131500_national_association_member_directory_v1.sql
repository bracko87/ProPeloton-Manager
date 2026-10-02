create or replace function public.get_my_national_association_members_v1(
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_association_id uuid;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_total integer:=0;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select m.association_id
  into v_association_id
  from public.national_association_memberships m
  where m.user_id=v_uid
    and m.status='active'
  order by m.created_at desc
  limit 1;

  if v_association_id is null then
    return jsonb_build_object(
      'association_id',null,
      'total',0,
      'limit',v_limit,
      'offset',v_offset,
      'members','[]'::jsonb
    );
  end if;

  select count(*)::integer
  into v_total
  from public.national_association_memberships m
  where m.association_id=v_association_id
    and m.status='active';

  return jsonb_build_object(
    'association_id',v_association_id,
    'total',v_total,
    'limit',v_limit,
    'offset',v_offset,
    'members',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.joined_on_game_date asc,x.created_at asc,x.user_id asc)
      from (
        select
          m.user_id,
          m.club_id,
          coalesce(nullif(p.username,''),nullif(concat_ws(' ',p.first_name,p.last_name),''),'Player') as username,
          coalesce(c.name,'—') as club_name,
          c.country_code as club_country_code,
          m.status as membership_status,
          m.joined_on_game_date,
          greatest(1,extract(year from m.joined_on_game_date)::integer-1999) as joined_season_number,
          coalesce((
            select sum(e.amount)::integer
            from public.national_association_activation_coin_events e
            where e.association_id=m.association_id
              and e.user_id=m.user_id
          ),0) as activation_contribution,
          exists(
            select 1
            from public.national_coach_terms t
            where t.association_id=m.association_id
              and t.user_id=m.user_id
              and t.status='active'
          ) as is_national_coach,
          m.created_at
        from public.national_association_memberships m
        left join public.profiles p on p.id=m.user_id
        left join public.clubs c on c.id=m.club_id
        where m.association_id=v_association_id
          and m.status='active'
        order by m.joined_on_game_date asc,m.created_at asc,m.user_id asc
        limit v_limit offset v_offset
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

grant execute on function public.get_my_national_association_members_v1(integer,integer) to authenticated;