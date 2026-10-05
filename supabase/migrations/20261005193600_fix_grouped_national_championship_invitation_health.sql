-- Recognize grouped National Championship invitations, including the rider in the payload.
CREATE OR REPLACE FUNCTION public.national_championship_lifecycle_overview_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with ctx as (
  select public.get_current_game_date_date() game_date,
         (select season_number from public.game_state where id=true limit 1) season_number
),
base as (
  select
    e.*,
    case when coalesce(e.qualification_heat_count,0)>0
      then e.qualification_window_start_date else e.final_date end first_event_date
  from public.national_championship_editions e,ctx
  where e.season_number=ctx.season_number
    -- Countries without any usable National Championship route are intentionally
    -- inactive until route content is added. They must not participate in
    -- lifecycle deadlines or raise operational incidents.
    and coalesce(e.route_status,'pending') <> 'missing_route'
),
counts as (
  select
    e.*,
    (select count(*)::int from public.national_championship_ranking_snapshots s where s.edition_id=e.id) snapshot_count,
    (select count(*)::int from public.national_championship_entries en where en.edition_id=e.id) entry_count,
    (select count(*)::int from public.national_championship_heats h where h.edition_id=e.id) heat_count_actual,
    (select count(*)::int from public.national_championship_heats h where h.edition_id=e.id and h.status='completed') heat_count_completed,
    (
      select count(*)::int
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs p on p.id=rc.parent_club_id
      where en.edition_id=e.id
        and case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end is not null
    ) human_invite_expected,
    (
      select count(*)::int
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs p on p.id=rc.parent_club_id
      where en.edition_id=e.id
        and case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end is not null
        and exists(
          select 1
          from public.notifications n
          join public.user_notifications un on un.notification_id=n.id
          where un.user_id=case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end
            and un.deleted_at is null
            and (
              n.payload_json->>'event_key'='national-championship-selection:'||e.id::text||':'||en.rider_id::text
              or (
                n.payload_json->>'event_key'='national-championship-selection-group:'||e.id::text||':'||un.user_id::text
                and n.payload_json->'riders' @> jsonb_build_array(jsonb_build_object('rider_id',en.rider_id))
              )
            )
        )
    ) human_invite_sent,
    (select count(*)::int from public.national_championship_entries en where en.edition_id=e.id and en.participation_decision='pending') initial_pending,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id
        and public.national_championship_entry_confirmed_for_event_v1(
          en.id,
          case when en.entry_path='qualification' then 'qualification' else 'final' end,
          en.heat_id
        )
    ) initial_confirmed,
    (
      select count(*)::int
      from public.national_championship_duties d
      join public.national_championship_entries en on en.edition_id=d.edition_id and en.rider_id=d.rider_id
      where d.edition_id=e.id and d.status='confirmed'
        and d.duty_type=case when en.entry_path='qualification' then 'qualification' else 'final' end
    ) initial_duties,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and en.participation_decision in ('approved','auto_approved')
    ) final_confirmation_expected,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and en.final_participation_decision='not_open'
    ) final_not_open,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and en.final_participation_decision='pending'
    ) final_pending,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id
        and public.national_championship_entry_confirmed_for_event_v1(en.id,'final',null)
    ) final_confirmed,
    (
      select count(*)::int
      from public.national_championship_duties d
      where d.edition_id=e.id and d.duty_type='final' and d.status='confirmed'
    ) final_duties,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and exists(
          select 1 from public.notifications n
          join public.user_notifications un on un.notification_id=n.id
          join public.clubs rc on rc.id=en.club_id_snapshot
          left join public.clubs p on p.id=rc.parent_club_id
          where un.user_id=case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end
            and un.deleted_at is null
            and n.payload_json->>'event_key'='national-final-confirmation:'||e.id::text||':'||en.rider_id::text
        )
    ) final_notifications_sent,
    (
      select count(*)::int
      from public.race_participant_riders rr
      where rr.race_id=e.final_race_id
    ) final_startlist_actual
  from base e
),
status_rows as (
  select
    c.*,
    case
      when c.schedule_draw_status='locked' and c.climate_status='ready' and c.route_status='ready' then 'complete'
      when ctx.game_date<c.ranking_snapshot_date then 'waiting'
      else 'overdue'
    end schedule_step,
    case
      when c.status<>'planned' and c.snapshot_count>0 and c.entry_count>0 then 'complete'
      when ctx.game_date<c.ranking_snapshot_date then 'waiting'
      else 'overdue'
    end freeze_step,
    case
      when coalesce(c.qualification_heat_count,0)=0 then 'not_required'
      when c.heat_count_actual=coalesce(c.qualification_heat_count,0) then 'complete'
      when ctx.game_date<c.ranking_snapshot_date then 'waiting'
      else 'overdue'
    end groups_step,
    case
      when c.entry_count=0 then case when ctx.game_date<c.ranking_snapshot_date then 'waiting' else 'overdue' end
      when c.human_invite_sent<c.human_invite_expected then 'overdue'
      when c.initial_pending>0 and ctx.game_date<=c.participation_decision_deadline then 'open'
      when c.initial_pending>0 then 'overdue'
      else 'complete'
    end invitation_step,
    case
      when c.entry_count=0 then 'waiting'
      when c.initial_confirmed=c.initial_duties then 'complete'
      else 'overdue'
    end lock_step,
    case
      when coalesce(c.qualification_heat_count,0)=0 then 'not_required'
      when c.heat_count_completed=coalesce(c.qualification_heat_count,0) then 'complete'
      when c.qualification_window_start_date is null then
        case when ctx.game_date<c.ranking_snapshot_date then 'waiting' else 'overdue' end
      when ctx.game_date<c.qualification_window_start_date then 'scheduled'
      when ctx.game_date<=c.qualification_window_end_date then 'in_progress'
      else 'overdue'
    end qualification_step,
    case
      when coalesce(c.qualification_heat_count,0)=0 then 'not_required'
      when c.heat_count_completed<coalesce(c.qualification_heat_count,0) then 'waiting'
      when c.final_not_open>0 then 'overdue'
      when c.final_pending>0 and ctx.game_date<=coalesce(c.final_participation_decision_deadline,c.final_date-7) then 'open'
      when c.final_pending>0 then 'overdue'
      else 'complete'
    end final_confirmation_step,
    case
      when c.status='completed' then 'complete'
      when ctx.game_date<c.final_date then
        case when c.final_race_id is null then 'waiting'
             when c.final_startlist_actual=c.final_confirmed then 'ready'
             else 'incomplete' end
      when c.final_startlist_actual=c.final_confirmed then 'ready'
      else 'overdue'
    end final_startlist_step,
    case
      when c.status='completed' and c.champion_rider_id is not null then 'complete'
      when ctx.game_date<=c.final_date then 'waiting'
      else 'overdue'
    end result_step,
    ctx.game_date
  from counts c cross join ctx
),
evaluated as (
  select
    s.*,
    (
      (case when s.first_event_date is not null and s.ranking_snapshot_date>s.first_event_date-30 then 1 else 0 end)
      +(case when s.schedule_step='overdue' then 1 else 0 end)
      +(case when s.freeze_step='overdue' then 1 else 0 end)
      +(case when s.groups_step='overdue' then 1 else 0 end)
      +(case when s.invitation_step='overdue' then 1 else 0 end)
      +(case when s.lock_step='overdue' then 1 else 0 end)
      +(case when s.qualification_step='overdue' then 1 else 0 end)
      +(case when s.final_confirmation_step='overdue' then 1 else 0 end)
      +(case when s.final_startlist_step='overdue' then 1 else 0 end)
      +(case when s.result_step='overdue' then 1 else 0 end)
      +(case when s.status<>'planned' and s.snapshot_count<>s.entry_count then 1 else 0 end)
    )::int issue_count
  from status_rows s
)
select jsonb_build_object(
  'game_date',(select game_date from ctx),
  'summary',jsonb_build_object(
    'edition_count',count(*),
    'inactive_missing_route_count',(
      select count(*)::int
      from public.national_championship_editions e2,ctx c2
      where e2.season_number=c2.season_number
        and coalesce(e2.route_status,'pending')='missing_route'
    ),
    'issue_count',coalesce(sum(issue_count),0),
    'editions_with_issues',count(*) filter(where issue_count>0),
    'awaiting_ranking_freeze',count(*) filter(where freeze_step='waiting'),
    'invitation_windows_open',count(*) filter(where invitation_step='open'),
    'qualification_rounds_active',count(*) filter(where qualification_step='in_progress'),
    'final_confirmations_open',count(*) filter(where final_confirmation_step='open')
  ),
  'editions',coalesce(jsonb_agg(
    jsonb_build_object(
      'edition_id',id,'country_code',country_code,'edition_status',status,
      'first_event_date',first_event_date,'ranking_freeze_date',ranking_snapshot_date,
      'response_deadline',participation_decision_deadline,
      'qualification_window_start',qualification_window_start_date,
      'qualification_window_end',qualification_window_end_date,
      'final_confirmation_deadline',final_participation_decision_deadline,
      'final_date',final_date,'qualification_heat_count',qualification_heat_count,
      'qualification_places',qualification_places,'qualifying_places_per_group',case
        when coalesce(qualification_heat_count,0)>0
          then ceil(coalesce(qualification_places,0)::numeric/qualification_heat_count)::int
        else null end,
      'schedule',schedule_step,'ranking_freeze',freeze_step,'groups',groups_step,
      'invitations',invitation_step,'rider_locks',lock_step,
      'qualification',qualification_step,'final_confirmation',final_confirmation_step,
      'final_startlist',final_startlist_step,'results',result_step,
      'confirmed_initial_riders',initial_confirmed,'initial_pending',initial_pending,
      'final_confirmed_riders',final_confirmed,'final_pending',final_pending,
      'issue_count',issue_count,
      'current_step',case
        when result_step='complete' then 'completed'
        when final_startlist_step in ('ready','overdue','incomplete') and game_date>=final_date then 'final'
        when final_confirmation_step in ('open','overdue') then 'final_confirmation'
        when qualification_step in ('in_progress','overdue') then 'qualification'
        when invitation_step in ('open','overdue') then 'invitation_responses'
        when freeze_step='complete' then 'field_created'
        when freeze_step='waiting' then 'waiting_for_ranking_freeze'
        else 'attention_required' end
    )
    order by issue_count desc,ranking_snapshot_date,country_code
  ),'[]'::jsonb)
)
from evaluated;
$function$
;
