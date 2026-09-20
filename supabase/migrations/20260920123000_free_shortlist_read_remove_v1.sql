-- Complete the Free shortlist rebalance by allowing Free managers to read
-- and remove riders from their own shortlist. Ownership checks remain server-side.

create or replace function public.transfer_list_rider_shortlist_v2(p_club_id uuid)
returns table(
  shortlist_id uuid,
  rider_id uuid,
  rider_name text,
  country_code text,
  role text,
  age_years integer,
  overall_label text,
  potential_label text,
  current_club_id uuid,
  current_club_name text,
  source_type text,
  source_id uuid,
  notes text,
  added_at timestamptz,
  availability_type text,
  listing_id uuid,
  transfer_price numeric,
  expected_salary_weekly numeric,
  expires_on_game_date date,
  availability_label text,
  is_scouted boolean
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_club_id uuid;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);

  return query
  select
    s.id,
    s.target_id,
    coalesce(
      nullif(btrim(concat_ws(' ', r.first_name, r.last_name)), ''),
      r.display_name,
      cr.display_name,
      s.target_name,
      'Unknown rider'
    )::text,
    coalesce(r.country_code, cr.country_code)::text,
    coalesce(r.role, cr.assigned_role)::text,
    coalesce(
      cr.age_years,
      extract(year from age(
        coalesce(public.get_current_game_date_date(), current_date),
        r.birth_date
      ))::integer
    ),
    case
      when coalesce(r.overall, cr.overall) is null then null
      when coalesce(r.overall, cr.overall) < 40 then '0-40'
      when coalesce(r.overall, cr.overall) < 60 then '40-60'
      when coalesce(r.overall, cr.overall) < 80 then '60-80'
      else '80-100'
    end::text,
    null::text,
    cr.club_id,
    c.name::text,
    coalesce(s.source_type, 'external_profile')::text,
    s.source_id,
    s.notes,
    s.created_at,
    case
      when tl.id is not null then 'transfer_list'
      when fa.id is not null then 'free_agent'
      else 'not_available'
    end::text,
    tl.id,
    tl.asking_price::numeric,
    fa.expected_salary_weekly::numeric,
    coalesce(tl.expires_on_game_date, fa.expires_on_game_date),
    case
      when tl.id is not null then 'Transfer listed'
      when fa.id is not null then 'Free Agent'
      else 'Not currently available'
    end::text,
    exists (
      select 1
      from public.rider_scout_reports sr
      where sr.club_id = v_club_id
        and sr.rider_id = s.target_id
    )
  from public.transfer_shortlist s
  left join public.riders r on r.id = s.target_id
  left join lateral (
    select roster.club_id,roster.display_name,roster.assigned_role,
           roster.age_years,roster.overall,roster.country_code
    from public.club_roster roster
    where roster.rider_id = s.target_id
    order by case when roster.club_id = v_club_id then 0 else 1 end,
             roster.club_id
    limit 1
  ) cr on true
  left join public.clubs c on c.id = cr.club_id
  left join lateral (
    select l.id,l.asking_price,l.expires_on_game_date
    from public.rider_transfer_listings l
    where l.rider_id = s.target_id
      and l.status in ('listed','active','open')
    order by l.listed_on_game_date desc nulls last
    limit 1
  ) tl on true
  left join lateral (
    select f.id,f.expected_salary_weekly,f.expires_on_game_date
    from public.rider_free_agents f
    where f.rider_id = s.target_id
      and f.status in ('available','open')
    order by f.created_at desc nulls last
    limit 1
  ) fa on true
  where s.club_id = v_club_id
    and s.target_type = 'rider'
    and s.removed_at is null
  order by s.created_at desc;
end;
$$;

create or replace function public.transfer_remove_rider_from_shortlist_v2(
  p_club_id uuid,
  p_rider_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_club_id uuid;
  v_count integer;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);

  update public.transfer_shortlist
  set removed_at=now(), updated_at=now()
  where club_id=v_club_id
    and target_type='rider'
    and target_id=p_rider_id
    and removed_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;
