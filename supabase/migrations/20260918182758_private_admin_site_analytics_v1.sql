
-- Private first-party website/game analytics for ProPeloton Manager.
-- Production domain only. UTC day boundaries.
-- No raw IP addresses, coordinates, or fingerprinting data are stored.

create table if not exists public.app_admins (
  email text primary key,
  user_id uuid null references auth.users(id) on delete set null,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint app_admins_email_lower_chk check (email = lower(email)),
  constraint app_admins_email_nonempty_chk check (length(trim(email)) > 3),
  constraint app_admins_role_chk check (role in ('admin','owner','analyst'))
);

create unique index if not exists app_admins_user_id_uidx
  on public.app_admins(user_id)
  where user_id is not null;

insert into public.app_admins(email, user_id, role, is_active)
select
  seed.email,
  u.id,
  'admin',
  true
from (
  values
    ('aleksandarlevnajic@gmail.com'::text),
    ('levnajic.aleksandar@gmail.com'::text)
) as seed(email)
left join auth.users u
  on lower(u.email) = seed.email
on conflict (email) do update
set
  user_id = coalesce(excluded.user_id, public.app_admins.user_id),
  role = 'admin',
  is_active = true;

create table if not exists public.site_analytics_daily_visitors (
  analytics_date date not null,
  visitor_id uuid not null,
  user_id uuid null references auth.users(id) on delete set null,
  country_code text not null default 'XX',
  device_type text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  pageview_count bigint not null default 0,
  primary key (analytics_date, visitor_id),
  constraint site_analytics_daily_visitors_country_chk
    check (country_code ~ '^[A-Z]{2}$'),
  constraint site_analytics_daily_visitors_device_chk
    check (device_type in ('desktop','tablet','mobile')),
  constraint site_analytics_daily_visitors_pageviews_chk
    check (pageview_count >= 0)
);

create table if not exists public.site_analytics_daily_sessions (
  analytics_date date not null,
  session_id uuid not null,
  visitor_id uuid not null,
  user_id uuid null references auth.users(id) on delete set null,
  country_code text not null default 'XX',
  device_type text not null,
  referrer_host text null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  pageview_count bigint not null default 0,
  primary key (analytics_date, session_id),
  constraint site_analytics_daily_sessions_country_chk
    check (country_code ~ '^[A-Z]{2}$'),
  constraint site_analytics_daily_sessions_device_chk
    check (device_type in ('desktop','tablet','mobile')),
  constraint site_analytics_daily_sessions_pageviews_chk
    check (pageview_count >= 0)
);

create table if not exists public.site_analytics_daily_pages (
  analytics_date date not null,
  visitor_id uuid not null,
  path text not null,
  pageview_count bigint not null default 0,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (analytics_date, visitor_id, path),
  constraint site_analytics_daily_pages_path_chk
    check (length(path) between 1 and 300),
  constraint site_analytics_daily_pages_pageviews_chk
    check (pageview_count >= 0)
);

create index if not exists site_analytics_visitors_date_idx
  on public.site_analytics_daily_visitors(analytics_date);
create index if not exists site_analytics_visitors_user_date_idx
  on public.site_analytics_daily_visitors(user_id, analytics_date)
  where user_id is not null;
create index if not exists site_analytics_visitors_country_date_idx
  on public.site_analytics_daily_visitors(country_code, analytics_date);
create index if not exists site_analytics_visitors_device_date_idx
  on public.site_analytics_daily_visitors(device_type, analytics_date);

create index if not exists site_analytics_sessions_date_idx
  on public.site_analytics_daily_sessions(analytics_date);
create index if not exists site_analytics_sessions_user_date_idx
  on public.site_analytics_daily_sessions(user_id, analytics_date)
  where user_id is not null;
create index if not exists site_analytics_sessions_country_date_idx
  on public.site_analytics_daily_sessions(country_code, analytics_date);
create index if not exists site_analytics_sessions_referrer_date_idx
  on public.site_analytics_daily_sessions(referrer_host, analytics_date);

create index if not exists site_analytics_pages_date_idx
  on public.site_analytics_daily_pages(analytics_date);
create index if not exists site_analytics_pages_path_date_idx
  on public.site_analytics_daily_pages(path, analytics_date);

alter table public.app_admins enable row level security;
alter table public.site_analytics_daily_visitors enable row level security;
alter table public.site_analytics_daily_sessions enable row level security;
alter table public.site_analytics_daily_pages enable row level security;

revoke all on table public.app_admins from anon, authenticated;
revoke all on table public.site_analytics_daily_visitors from anon, authenticated;
revoke all on table public.site_analytics_daily_sessions from anon, authenticated;
revoke all on table public.site_analytics_daily_pages from anon, authenticated;

create or replace function public.is_app_admin_v1()
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then
    return false;
  end if;

  select lower(trim(coalesce(u.email, '')))
  into v_email
  from auth.users u
  where u.id = v_user_id;

  if coalesce(v_email, '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.app_admins a
    where a.is_active = true
      and (
        a.user_id = v_user_id
        or lower(a.email) = v_email
      )
  );
end;
$function$;

revoke all on function public.is_app_admin_v1() from public;
grant execute on function public.is_app_admin_v1() to authenticated;

create or replace function public.record_site_analytics_event_v1(
  p_visitor_id uuid,
  p_session_id uuid,
  p_path text,
  p_country_code text,
  p_device_type text,
  p_referrer_host text default null,
  p_hostname text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_date date := (clock_timestamp() at time zone 'UTC')::date;
  v_user_id uuid := auth.uid();
  v_path text;
  v_country text;
  v_device text;
  v_referrer text;
  v_hostname text;
begin
  v_hostname := lower(trim(coalesce(p_hostname, '')));

  -- Production site only. Preview deployments, localhost and staging are rejected.
  if v_hostname not in ('propelotonmanager.com', 'www.propelotonmanager.com') then
    return false;
  end if;

  if p_visitor_id is null or p_session_id is null then
    return false;
  end if;

  v_path := split_part(trim(coalesce(p_path, '/')), '?', 1);
  v_path := split_part(v_path, '#', 1);

  if v_path = '' then
    v_path := '/';
  end if;

  if left(v_path, 1) <> '/' then
    v_path := '/' || v_path;
  end if;

  v_path := left(v_path, 300);

  -- Never count administrators opening the analytics dashboard itself.
  if v_path = '/dashboard/admin/analytics'
     or v_path like '/dashboard/admin/analytics/%' then
    return false;
  end if;

  v_country := upper(trim(coalesce(p_country_code, 'XX')));
  if v_country !~ '^[A-Z]{2}$' then
    v_country := 'XX';
  end if;

  v_device := lower(trim(coalesce(p_device_type, '')));
  if v_device not in ('desktop','tablet','mobile') then
    v_device := 'desktop';
  end if;

  v_referrer := lower(trim(coalesce(p_referrer_host, '')));
  if v_referrer = '' or v_referrer = v_hostname
     or v_referrer in ('propelotonmanager.com','www.propelotonmanager.com') then
    v_referrer := null;
  else
    v_referrer := left(v_referrer, 255);
  end if;

  insert into public.site_analytics_daily_visitors (
    analytics_date,
    visitor_id,
    user_id,
    country_code,
    device_type,
    first_seen_at,
    last_seen_at,
    pageview_count
  )
  values (
    v_date,
    p_visitor_id,
    v_user_id,
    v_country,
    v_device,
    v_now,
    v_now,
    1
  )
  on conflict (analytics_date, visitor_id) do update
  set
    user_id = coalesce(excluded.user_id, public.site_analytics_daily_visitors.user_id),
    country_code = case
      when excluded.country_code <> 'XX' then excluded.country_code
      else public.site_analytics_daily_visitors.country_code
    end,
    device_type = excluded.device_type,
    first_seen_at = least(public.site_analytics_daily_visitors.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.site_analytics_daily_visitors.last_seen_at, excluded.last_seen_at),
    pageview_count = public.site_analytics_daily_visitors.pageview_count + 1;

  insert into public.site_analytics_daily_sessions (
    analytics_date,
    session_id,
    visitor_id,
    user_id,
    country_code,
    device_type,
    referrer_host,
    started_at,
    last_seen_at,
    pageview_count
  )
  values (
    v_date,
    p_session_id,
    p_visitor_id,
    v_user_id,
    v_country,
    v_device,
    v_referrer,
    v_now,
    v_now,
    1
  )
  on conflict (analytics_date, session_id) do update
  set
    visitor_id = excluded.visitor_id,
    user_id = coalesce(excluded.user_id, public.site_analytics_daily_sessions.user_id),
    country_code = case
      when excluded.country_code <> 'XX' then excluded.country_code
      else public.site_analytics_daily_sessions.country_code
    end,
    device_type = excluded.device_type,
    referrer_host = coalesce(public.site_analytics_daily_sessions.referrer_host, excluded.referrer_host),
    started_at = least(public.site_analytics_daily_sessions.started_at, excluded.started_at),
    last_seen_at = greatest(public.site_analytics_daily_sessions.last_seen_at, excluded.last_seen_at),
    pageview_count = public.site_analytics_daily_sessions.pageview_count + 1;

  insert into public.site_analytics_daily_pages (
    analytics_date,
    visitor_id,
    path,
    pageview_count,
    first_seen_at,
    last_seen_at
  )
  values (
    v_date,
    p_visitor_id,
    v_path,
    1,
    v_now,
    v_now
  )
  on conflict (analytics_date, visitor_id, path) do update
  set
    pageview_count = public.site_analytics_daily_pages.pageview_count + 1,
    first_seen_at = least(public.site_analytics_daily_pages.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.site_analytics_daily_pages.last_seen_at, excluded.last_seen_at);

  return true;
end;
$function$;

revoke all on function public.record_site_analytics_event_v1(
  uuid, uuid, text, text, text, text, text
) from public;
grant execute on function public.record_site_analytics_event_v1(
  uuid, uuid, text, text, text, text, text
) to anon, authenticated;

create or replace function public.get_admin_analytics_dashboard_v1(
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_end_date date := (clock_timestamp() at time zone 'UTC')::date;
  v_start_date date;
  v_days integer := coalesce(p_days, 30);
  v_result jsonb;
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_days not in (0, 7, 30, 90, 365) then
    raise exception 'Unsupported analytics period. Use 7, 30, 90, 365 or 0 for all time.';
  end if;

  if v_days = 0 then
    select least(
      coalesce(
        (select min(v.analytics_date) from public.site_analytics_daily_visitors v),
        v_end_date
      ),
      coalesce(
        (
          select min((u.created_at at time zone 'UTC')::date)
          from auth.users u
          where u.deleted_at is null
            and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
        ),
        v_end_date
      )
    )
    into v_start_date;
  else
    v_start_date := v_end_date - (v_days - 1);
  end if;

  select jsonb_build_object(
    'timezone', 'UTC',
    'start_date', v_start_date,
    'end_date', v_end_date,
    'days', v_days,
    'summary', jsonb_build_object(
      'unique_visitors', (
        select count(distinct v.visitor_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
      ),
      'pageviews', (
        select coalesce(sum(v.pageview_count),0)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
      ),
      'sessions', (
        select count(distinct s.session_id)
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
      ),
      'registered_active_users', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
          and v.user_id is not null
      ),
      'anonymous_visitors', (
        select count(distinct v.visitor_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
          and v.user_id is null
          and not exists (
            select 1
            from public.site_analytics_daily_visitors vr
            where vr.analytics_date between v_start_date and v_end_date
              and vr.visitor_id = v.visitor_id
              and vr.user_id is not null
          )
      ),
      'new_registrations', (
        select count(*)
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
          and (u.created_at at time zone 'UTC')::date
              between v_start_date and v_end_date
      ),
      'total_registered_accounts', (
        select count(*)
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
      ),
      'dau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date = v_end_date
          and v.user_id is not null
      ),
      'wau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_end_date - 6 and v_end_date
          and v.user_id is not null
      ),
      'mau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_end_date - 29 and v_end_date
          and v.user_id is not null
      )
    ),
    'daily', (
      with calendar as (
        select generate_series(
          v_start_date::timestamp,
          v_end_date::timestamp,
          interval '1 day'
        )::date as analytics_date
      ),
      visitors as (
        select
          v.analytics_date,
          count(distinct v.visitor_id) as unique_visitors,
          coalesce(sum(v.pageview_count),0) as pageviews,
          count(distinct v.user_id) filter (where v.user_id is not null)
            as active_registered_users
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
        group by v.analytics_date
      ),
      sessions as (
        select
          s.analytics_date,
          count(distinct s.session_id) as sessions
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
        group by s.analytics_date
      ),
      registrations as (
        select
          (u.created_at at time zone 'UTC')::date as analytics_date,
          count(*) as new_registrations
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
          and (u.created_at at time zone 'UTC')::date
              between v_start_date and v_end_date
        group by 1
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', c.analytics_date,
            'unique_visitors', coalesce(v.unique_visitors,0),
            'pageviews', coalesce(v.pageviews,0),
            'sessions', coalesce(s.sessions,0),
            'active_registered_users', coalesce(v.active_registered_users,0),
            'new_registrations', coalesce(r.new_registrations,0)
          )
          order by c.analytics_date
        ),
        '[]'::jsonb
      )
      from calendar c
      left join visitors v using (analytics_date)
      left join sessions s using (analytics_date)
      left join registrations r using (analytics_date)
    ),
    'countries', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'country_code', q.country_code,
            'country_name', q.country_name,
            'unique_visitors', q.unique_visitors,
            'pageviews', q.pageviews
          )
          order by q.unique_visitors desc, q.pageviews desc, q.country_code
        ),
        '[]'::jsonb
      )
      from (
        select
          v.country_code,
          coalesce(c.name, case when v.country_code='XX' then 'Unknown' else v.country_code end)
            as country_name,
          count(distinct v.visitor_id) as unique_visitors,
          coalesce(sum(v.pageview_count),0) as pageviews
        from public.site_analytics_daily_visitors v
        left join public.countries c on c.code = v.country_code
        where v.analytics_date between v_start_date and v_end_date
        group by v.country_code, c.name
        order by unique_visitors desc, pageviews desc
        limit 100
      ) q
    ),
    'top_pages', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'path', q.path,
            'pageviews', q.pageviews,
            'unique_visitors', q.unique_visitors
          )
          order by q.pageviews desc, q.unique_visitors desc, q.path
        ),
        '[]'::jsonb
      )
      from (
        select
          p.path,
          coalesce(sum(p.pageview_count),0) as pageviews,
          count(distinct p.visitor_id) as unique_visitors
        from public.site_analytics_daily_pages p
        where p.analytics_date between v_start_date and v_end_date
        group by p.path
        order by pageviews desc, unique_visitors desc
        limit 50
      ) q
    ),
    'devices', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_type', q.device_type,
            'visitors', q.visitors,
            'pageviews', q.pageviews
          )
          order by q.visitors desc, q.device_type
        ),
        '[]'::jsonb
      )
      from (
        select
          v.device_type,
          count(distinct v.visitor_id) as visitors,
          coalesce(sum(v.pageview_count),0) as pageviews
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
        group by v.device_type
      ) q
    ),
    'traffic_sources', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'referrer_host', q.referrer_host,
            'sessions', q.sessions,
            'unique_visitors', q.unique_visitors
          )
          order by q.sessions desc, q.unique_visitors desc, q.referrer_host
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(nullif(s.referrer_host,''), 'Direct') as referrer_host,
          count(distinct s.session_id) as sessions,
          count(distinct s.visitor_id) as unique_visitors
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
        group by coalesce(nullif(s.referrer_host,''), 'Direct')
        order by sessions desc, unique_visitors desc
        limit 50
      ) q
    )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_admin_analytics_dashboard_v1(integer) from public;
grant execute on function public.get_admin_analytics_dashboard_v1(integer) to authenticated;

comment on table public.app_admins is
  'Private application administrator allow-list. Authorization is checked server-side by is_app_admin_v1().';
comment on table public.site_analytics_daily_visitors is
  'Privacy-conscious daily visitor aggregates; no IP address or precise location is stored.';
comment on table public.site_analytics_daily_sessions is
  'Privacy-conscious daily session aggregates; no IP address or precise location is stored.';
comment on table public.site_analytics_daily_pages is
  'Privacy-conscious daily per-visitor page aggregates.';
comment on function public.record_site_analytics_event_v1(uuid,uuid,text,text,text,text,text) is
  'Records one first-party production page navigation using daily UPSERT aggregates. User id comes only from auth.uid().';
comment on function public.get_admin_analytics_dashboard_v1(integer) is
  'Returns the private analytics dashboard JSON for authorized app admins only.';
