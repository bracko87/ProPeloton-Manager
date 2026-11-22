-- SAT-09: apply owner/member-scoped masking to existing public read models
-- without changing view names, column types, ordering or grants.
--
-- Existing public standings and rider/team identity continue to work.
-- Unrelated visitors, anonymous Auth users and rival managers see NULL for
-- exact rider abilities/contract details and private club finances.
--
-- View definitions are captured in an unexposed private backup table so the
-- change is reversible if a consumer regression is detected.
-- The migration is transactional: a failure restores all prior view objects.

create table if not exists private.saturn_sensitive_view_originals_20261122 (
  view_name text primary key,
  original_select_sql text not null,
  original_options text[],
  captured_at timestamptz not null default now()
);
revoke all on table private.saturn_sensitive_view_originals_20261122
  from public, anon, authenticated;

-- These helpers intentionally have no public Data API access; a definer view
-- invokes them using its owner's privileges, but auth.uid() still references
-- the *requesting JWT*, never an argument supplied by the browser.
create or replace function private.saturn_can_view_club_private_v1(p_club_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select coalesce((auth.jwt()->>'role' = 'service_role'), false)
    or (
      auth.uid() is not null
      and exists (
        select 1
        from public.clubs c
        where c.id = p_club_id
          and c.deleted_at is null
          and (
            c.owner_user_id = auth.uid()
            or exists (
              select 1
              from public.club_memberships cm
              where cm.club_id = c.id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
$function$;
revoke all on function private.saturn_can_view_club_private_v1(uuid)
  from public, anon, authenticated;

create or replace function private.saturn_can_view_rider_private_v1(p_rider_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select coalesce((auth.jwt()->>'role' = 'service_role'), false)
    or (
      auth.uid() is not null
      and exists (
        select 1
        from public.club_riders cr
        join public.clubs c on c.id = cr.club_id
        where cr.rider_id = p_rider_id
          and c.deleted_at is null
          and (
            c.owner_user_id = auth.uid()
            or exists (
              select 1
              from public.club_memberships cm
              where cm.club_id = c.id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
$function$;
revoke all on function private.saturn_can_view_rider_private_v1(uuid)
  from public, anon, authenticated;

do $do$
declare
  v_item record;
  v_source text;
  v_projection text;
  v_sensitive text[];
  v_scope_function text;
  v_primary_key text;
  v_total int;
  v_count int;
  v_existing_options text[];
begin
  for v_item in
    select * from (values
      ('club_profile_popup_view','club'),
      ('rider_statistics_page_international_v1','rider'),
      ('rider_statistics_page_view','rider'),
      ('rider_statistics_view','rider'),
      ('v_rider_modal_skill_ui','rider'),
      ('v_rider_skill_card_deltas','rider'),
      ('v_rider_latest_weekly_change_ui','rider'),
      ('v_rider_latest_weekly_visible_deltas_ui','rider'),
      ('race_participant_riders_v1','rider')
    ) as required(view_name, scope)
  loop
    select pg_get_viewdef(c.oid, true), c.reloptions
    into v_source, v_existing_options
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname=v_item.view_name and c.relkind='v';

    if v_source is null then
      raise exception 'Missing Saturn view: %', v_item.view_name;
    end if;
    if exists (
      select 1 from private.saturn_sensitive_view_originals_20261122 b
      where b.view_name=v_item.view_name
    ) then
      raise exception 'Saturn masking already recorded for %; refusing double wrapping', v_item.view_name;
    end if;

    if v_item.scope='club' then
      v_primary_key:='club_id';
      v_scope_function:='private.saturn_can_view_club_private_v1';
      v_sensitive:=array[
        'owner_display_name',
        'club_cash_balance','current_balance','weekly_income','weekly_expenses',
        'wage_total','active_sponsor_monthly_total','main_sponsor_monthly_amount',
        'default_training_intensity','ui_theme_variant'
      ];
    elsif v_item.view_name='rider_statistics_view' then
      v_primary_key:='rider_id';
      v_scope_function:='private.saturn_can_view_rider_private_v1';
      v_sensitive:=array[
        'overall','potential','sprint','climbing','time_trial','endurance','flat',
        'recovery','resistance','race_iq','teamwork','morale','market_value',
        'salary','contract_expires_season','contract_expires_at',
        'availability_status','fatigue'
      ];
    elsif v_item.view_name in ('rider_statistics_page_international_v1','rider_statistics_page_view') then
      v_primary_key:=case when v_item.view_name='rider_statistics_page_view' then 'id' else 'rider_id' end;
      v_scope_function:='private.saturn_can_view_rider_private_v1';
      v_sensitive:=array[
        'overall','potential','sprint','climbing','time_trial','endurance','flat',
        'recovery','resistance','race_iq','teamwork','morale','market_value',
        'salary','contract_expires_season','availability_status','fatigue'
      ];
    elsif v_item.view_name='v_rider_modal_skill_ui' then
      v_primary_key:='rider_id';
      v_scope_function:='private.saturn_can_view_rider_private_v1';
      v_sensitive:=array[
        'availability_status','current_value','old_value','new_value',
        'delta_value','delta_label','delta_direction','primary_source',
        'week_start_date','week_end_date','has_visible_delta'
      ];
    elsif v_item.view_name='v_rider_skill_card_deltas' then
      v_primary_key:='rider_id';
      v_scope_function:='private.saturn_can_view_rider_private_v1';
      v_sensitive:=array[
        'current_value','old_value','new_value','delta_value','delta_label',
        'delta_direction','primary_source','week_start_date','week_end_date',
        'has_visible_delta'
      ];
    elsif v_item.view_name='v_rider_latest_weekly_change_ui' then
      v_primary_key:='rider_id';
      v_scope_function:='private.saturn_can_view_rider_private_v1';
      v_sensitive:=array[
        'availability_status','week_start_date','week_end_date','processed_at',
        'primary_source','changed_attributes','positive_changes','negative_changes',
        'total_net_change','overall_delta','source_summary','regular_training_days',
        'regular_training_value','training_camp_days','training_camp_value',
        'race_days','meaningful_days','had_inactivity_decay','ui_state','ui_label'
      ];
    elsif v_item.view_name='v_rider_latest_weekly_visible_deltas_ui' then
      v_primary_key:='rider_id';
      v_scope_function:='private.saturn_can_view_rider_private_v1';
      v_sensitive:=array[
        'availability_status','week_start_date','week_end_date','processed_at',
        'old_value','new_value','delta_value','primary_source',
        'delta_direction','delta_label'
      ];
    elsif v_item.view_name='race_participant_riders_v1' then
      v_primary_key:='rider_id';
      v_scope_function:='private.saturn_can_view_rider_private_v1';
      v_sensitive:=array['overall_snapshot'];
    else
      raise exception 'Unhandled Saturn view scope for %', v_item.view_name;
    end if;

    select count(*)
    into v_count
    from pg_attribute a
    where a.attrelid = format('public.%I',v_item.view_name)::regclass
      and a.attnum>0 and not a.attisdropped
      and a.attname=any(v_sensitive);
    if v_count <> cardinality(v_sensitive) then
      raise exception 'Unexpected columns in %, found % sensitive columns, expected %',
        v_item.view_name, v_count, cardinality(v_sensitive);
    end if;

    select string_agg(
      case when a.attname=any(v_sensitive)
        then format('CASE WHEN saturn_acl.permitted THEN src.%1$I ELSE NULL END AS %1$I',a.attname)
        else format('src.%1$I AS %1$I',a.attname)
      end, ', ' order by a.attnum
    )
    into v_projection
    from pg_attribute a
    where a.attrelid=format('public.%I',v_item.view_name)::regclass
      and a.attnum>0 and not a.attisdropped;
    select count(*) into v_total
    from pg_attribute a
    where a.attrelid=format('public.%I',v_item.view_name)::regclass
      and a.attnum>0 and not a.attisdropped;
    if v_projection is null or v_total<5 then
      raise exception 'Unsafe empty column projection for %',v_item.view_name;
    end if;

    insert into private.saturn_sensitive_view_originals_20261122
      (view_name, original_select_sql, original_options)
    values (v_item.view_name, v_source, v_existing_options);

    v_source:=rtrim(v_source, ' ;'||chr(9)||chr(10)||chr(13));
    execute format(
      'CREATE OR REPLACE VIEW public.%I WITH (security_barrier=true) AS
       SELECT %s FROM (%s) AS src
       CROSS JOIN LATERAL
       (SELECT %s(src.%I) AS permitted OFFSET 0) AS saturn_acl',
      v_item.view_name, v_projection, v_source, v_scope_function, v_primary_key
    );
  end loop;
end;
$do$;

comment on table private.saturn_sensitive_view_originals_20261122 is
  'Admin-only restore source for SAT-09 view masking. Never expose via API.';

-- No broad revocations and no changes to club/rider tables, wallets, RLS or sessions.
-- Masked views still expose intentional public competition/identity fields.
