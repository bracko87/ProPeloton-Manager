CREATE OR REPLACE FUNCTION control_center_private.cleanup_retired_entity_runtime_v1(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'archive', 'control_center_private'
AS $function$
declare
  v_riders integer := 0;
  v_clubs integer := 0;
  v_rider_deleted integer := 0;
  v_club_deleted integer := 0;
  v_n integer;
begin
  -- Retired riders must be fully removed from all active rosters first.
  select count(*) into v_riders from (
    select r.id from public.riders r
    where r.availability_status='retired'
      and not exists(select 1 from public.club_riders cr where cr.rider_id=r.id)
    limit greatest(1,least(coalesce(p_limit,200),1000))
  ) rr;

  with r as (select id from public.riders where availability_status='retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=public.riders.id)
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.rider_regular_training_daily_plans d using r where d.rider_id=r.id;
  get diagnostics v_n=row_count; v_rider_deleted:=v_rider_deleted+v_n;

  with r as (select id from public.riders where availability_status='retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=public.riders.id)
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.rider_training_accident_decisions_v1 d using r where d.rider_id=r.id;
  get diagnostics v_n=row_count; v_rider_deleted:=v_rider_deleted+v_n;

  with r as (select id from public.riders where availability_status='retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=public.riders.id)
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.rider_daily_activity d using r where d.rider_id=r.id;
  get diagnostics v_n=row_count; v_rider_deleted:=v_rider_deleted+v_n;

  with r as (select id from public.riders where availability_status='retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=public.riders.id)
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.rider_race_development_events d using r where d.rider_id=r.id;
  get diagnostics v_n=row_count; v_rider_deleted:=v_rider_deleted+v_n;

  with r as (select id from public.riders where availability_status='retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=public.riders.id)
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.rider_skill_weekly_snapshots d using r where d.rider_id=r.id;
  get diagnostics v_n=row_count; v_rider_deleted:=v_rider_deleted+v_n;

  with r as (select id from public.riders where availability_status='retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=public.riders.id)
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.rider_weekly_skill_changes d using r where d.rider_id=r.id;
  get diagnostics v_n=row_count; v_rider_deleted:=v_rider_deleted+v_n;

  with r as (select id from public.riders where availability_status='retired'
    and not exists(select 1 from public.club_riders cr where cr.rider_id=public.riders.id)
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.rider_attribute_progress_bank d using r where d.rider_id=r.id;
  get diagnostics v_n=row_count; v_rider_deleted:=v_rider_deleted+v_n;

  -- A closed club cannot be used again; retain its ID for historical ledgers
  -- and ranking references while removing obsolete operating configuration.
  select count(*) into v_clubs from (
    select id from public.clubs where deleted_at<now()-interval '30 days'
    limit greatest(1,least(coalesce(p_limit,200),1000))
  ) cc;

  with c as (select id from public.clubs where deleted_at<now()-interval '30 days'
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.club_regular_training_defaults d using c where d.club_id=c.id;
  get diagnostics v_n=row_count; v_club_deleted:=v_club_deleted+v_n;

  with c as (select id from public.clubs where deleted_at<now()-interval '30 days'
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.club_regular_training_automation d using c where d.club_id=c.id;
  get diagnostics v_n=row_count; v_club_deleted:=v_club_deleted+v_n;

  with c as (select id from public.clubs where deleted_at<now()-interval '30 days'
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.equipment_auto_restock_rules d using c where d.club_id=c.id;
  get diagnostics v_n=row_count; v_club_deleted:=v_club_deleted+v_n;

  with c as (select id from public.clubs where deleted_at<now()-interval '30 days'
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.club_equipment_default_setup d using c where d.club_id=c.id;
  get diagnostics v_n=row_count; v_club_deleted:=v_club_deleted+v_n;

  with c as (select id from public.clubs where deleted_at<now()-interval '30 days'
    and coalesce(is_ai,false)=false
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.club_equipment_inventory d using c where d.club_id=c.id;
  get diagnostics v_n=row_count; v_club_deleted:=v_club_deleted+v_n;

  with c as (select id from public.clubs where deleted_at<now()-interval '30 days'
    limit greatest(1,least(coalesce(p_limit,200),1000)))
  delete from public.club_team_policies d using c where d.club_id=c.id;
  get diagnostics v_n=row_count; v_club_deleted:=v_club_deleted+v_n;

  insert into archive.retired_entity_cleanup_runs(
     retired_riders_seen,rider_operational_rows_deleted,
     closed_clubs_seen,closed_club_operational_rows_deleted)
  values(v_riders,v_rider_deleted,v_clubs,v_club_deleted);

  return jsonb_build_object(
    'retired_riders_seen',v_riders,
    'rider_operational_rows_deleted',v_rider_deleted,
    'closed_clubs_seen',v_clubs,
    'closed_club_operational_rows_deleted',v_club_deleted);
end;
$function$;
