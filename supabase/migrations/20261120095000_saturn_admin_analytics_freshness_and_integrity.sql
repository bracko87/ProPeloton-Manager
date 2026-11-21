-- Project Saturn SAT-09: ProPeloton Manager ONLY.
-- Extend the existing guarded get_admin_analytics_dashboard_v1 with server
-- generation time, last recorded navigation, last five-minute navigation
-- counters (not true online presence) and independent three-table pageview
-- reconciliation. Preserve original ProPeloton UTC aggregation logic.
-- Live function tested 20 November 2026 with authorized admin and rejected
-- ordinary user, and 7/30-day totals matching each independent page view sum.

CREATE OR REPLACE FUNCTION public.get_admin_analytics_dashboard_v1(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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

  -- Saturn SAT-09: Helios-style current activity and three-table integrity,
  -- preserving UTC windows and existing ProPeloton aggregation definitions.
  -- Five-minute values reflect RECORDED NAVIGATION, not online connections.
  v_result := v_result || jsonb_build_object(
    'generated_at', clock_timestamp(),
    'freshness', jsonb_build_object(
      'last_pageview_at', (select max(p.last_seen_at) from public.site_analytics_daily_pages p),
      'last_session_at', (select max(s.last_seen_at) from public.site_analytics_daily_sessions s),
      'recent_sessions_5m', (select count(distinct s.session_id)
        from public.site_analytics_daily_sessions s
        where s.last_seen_at >= clock_timestamp() - interval '5 minutes'),
      'recent_visitors_5m', (select count(distinct v.visitor_id)
        from public.site_analytics_daily_visitors v
        where v.last_seen_at >= clock_timestamp() - interval '5 minutes'),
      'recent_registered_5m', (select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.user_id is not null and v.last_seen_at >= clock_timestamp() - interval '5 minutes')
    ),
    'reconciliation', (
      with totals as (
        select
          (select coalesce(sum(v.pageview_count),0) from public.site_analytics_daily_visitors v
           where v.analytics_date between v_start_date and v_end_date) as visitor_pageviews,
          (select coalesce(sum(s.pageview_count),0) from public.site_analytics_daily_sessions s
           where s.analytics_date between v_start_date and v_end_date) as session_pageviews,
          (select coalesce(sum(p.pageview_count),0) from public.site_analytics_daily_pages p
           where p.analytics_date between v_start_date and v_end_date) as path_pageviews
      )
      select jsonb_build_object(
        'visitor_pageviews', totals.visitor_pageviews,
        'session_pageviews', totals.session_pageviews,
        'path_pageviews', totals.path_pageviews,
        'totals_match', totals.visitor_pageviews=totals.session_pageviews
            and totals.visitor_pageviews=totals.path_pageviews
      ) from totals
    )
  );

  return v_result;
end;
$function$;


-- Function has an administrator guard but anonymous clients should not
-- invoke it at all. Signed-in callers still require public.is_app_admin_v1().
revoke execute on function public.get_admin_analytics_dashboard_v1(integer) from public,anon;
grant execute on function public.get_admin_analytics_dashboard_v1(integer) to authenticated,service_role;
