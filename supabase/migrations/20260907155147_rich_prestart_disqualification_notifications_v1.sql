create or replace function public.apply_prestart_disqualification_penalty_v1(p_disqualification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','finance','pg_temp'
as $function$
declare
  d record;
  r record;
  c record;
  e record;
  v_class text;
  v_score_delta integer:=-10;
  v_cash bigint:=0;
  v_commitment jsonb;
  v_event_id uuid;
  v_finance jsonb:='{}'::jsonb;
  v_reason text;
  v_user_id uuid;
begin
  select * into d from public.race_team_stage_disqualifications where id=p_disqualification_id for update;
  if d.id is null then return jsonb_build_object('success',false,'reason','disqualification_not_found'); end if;

  if d.reason_code not in ('mandatory_race_jersey_shortage') then
    return jsonb_build_object('success',true,'skipped',true,'reason','non_controllable_disqualification','reason_code',d.reason_code);
  end if;

  if coalesce((d.metadata->>'penalty_applied')::boolean,false) then
    return jsonb_build_object('success',true,'skipped',true,'reason','penalty_already_marked','disqualification_id',d.id,'metadata',d.metadata);
  end if;

  select r0.id,r0.name,r0.category,to_jsonb(r0) as race_json into r from public.races r0 where r0.id=d.race_id;
  select c0.id,c0.name,c0.owner_user_id,coalesce(c0.is_ai,false) as is_ai into c from public.clubs c0 where c0.id=d.team_id;
  if r.id is null or c.id is null then return jsonb_build_object('success',false,'reason','race_or_team_not_found'); end if;
  if c.is_ai or c.owner_user_id is null then return jsonb_build_object('success',true,'skipped',true,'reason','non_human_team'); end if;

  select rte.* into e from public.race_team_entries rte where rte.race_id=d.race_id and rte.club_id=d.team_id order by rte.updated_at desc nulls last,rte.created_at desc nulls last limit 1;
  if e.id is null then return jsonb_build_object('success',false,'reason','race_team_entry_not_found','race_id',d.race_id,'team_id',d.team_id); end if;

  select coalesce(rer.race_class_code,r.category) into v_class from public.race_entry_rules rer where rer.race_id=d.race_id limit 1;
  v_class:=coalesce(v_class,r.category);

  select coalesce(pr.missed_startlist_score_delta,-10),coalesce(pr.missed_startlist_cash,0)
  into v_score_delta,v_cash
  from public.race_application_penalty_rules pr
  where pr.race_class_code=v_class
  limit 1;
  v_score_delta:=coalesce(v_score_delta,-10);
  v_cash:=coalesce(v_cash,0);

  v_reason:=format('Pre-start disqualification for controllable mandatory race eligibility failure: %s. Penalty equivalent to missed startlist/no-show.',d.reason_code);

  v_commitment:=public.apply_race_commitment_penalty_v1(c.id,r.id,e.id,'prestart_disqualification',v_score_delta,v_cash,v_reason);

  select ev.id into v_event_id
  from public.race_commitment_score_events ev
  where ev.race_team_entry_id=e.id and ev.event_type='prestart_disqualification'
  order by ev.created_at desc limit 1;

  if v_event_id is null then raise exception 'Pre-start disqualification commitment event was not created.'; end if;
  v_finance:=public.finance_record_prestart_disqualification_fine_v1(v_event_id);

  update public.race_team_stage_disqualifications
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'penalty_applied',true,
        'penalty_applied_at',now(),
        'penalty_equivalence','missed_startlist_no_show',
        'commitment_score_event_id',v_event_id,
        'score_delta',v_score_delta,
        'cash_penalty',v_cash,
        'finance_result',v_finance,
        'entry_fee_refunded',false,
        'club_controllable_failure',true
      ),updated_at=now()
  where id=d.id;

  update public.race_team_entries
  set decision_reason=coalesce(nullif(decision_reason,''),'Pre-start disqualification')||format(' No-show-equivalent penalty applied: score %s, cash fine %s. Entry fee remains charged.',v_score_delta,v_cash),
      updated_at=now()
  where id=e.id;

  update public.race_preparations
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'prestart_disqualification_penalty_applied',true,
        'prestart_disqualification_reason',d.reason_code,
        'commitment_score_event_id',v_event_id,
        'score_delta',v_score_delta,
        'cash_penalty',v_cash,
        'entry_fee_refunded',false,
        'penalty_applied_at',now()
      ),updated_at=now()
  where race_id=d.race_id and club_id=d.team_id;

  v_user_id:=c.owner_user_id;
  if v_user_id is not null then
    perform public.create_user_game_notification_v1(
      v_user_id,
      'RACE_PLAN_NEEDS_ATTENTION',
      'Team removed from '||r.name||' — penalty applied',
      format('%s could not start %s because the mandatory Race Jersey Kit requirement was still unresolved at the pre-start eligibility check. %s kit%s required, %s eligible, %s missing. The race entry fee remains charged. A cash fine of %s has been applied and the Race Commitment Score changed by %s. Open the race to review what happened, or open Race Supplies to prevent the same problem in future races.',
        c.name,
        r.name,
        coalesce(d.required_jersey_units,0),
        case when coalesce(d.required_jersey_units,0)=1 then ' was' else 's were' end,
        coalesce(d.available_jersey_units,0),
        coalesce(d.missing_jersey_units,greatest(coalesce(d.required_jersey_units,0)-coalesce(d.available_jersey_units,0),0)),
        to_char(v_cash,'FM999,999,999,990'),
        case when v_score_delta>=0 then '+'||v_score_delta::text else v_score_delta::text end
      ),
      '/dashboard/equipment?tab=race-supplies',
      jsonb_build_object(
        'event_type','prestart_disqualification',
        'reason_code',d.reason_code,
        'race_id',r.id,
        'race_name',r.name,
        'club_id',c.id,
        'club_name',c.name,
        'required_jersey_units',d.required_jersey_units,
        'available_jersey_units',d.available_jersey_units,
        'missing_jersey_units',d.missing_jersey_units,
        'problem_label','Not enough eligible Race Jersey Kits',
        'cash_penalty',v_cash,
        'score_delta',v_score_delta,
        'entry_fee_refunded',false,
        'penalty_equivalence','missed_startlist_no_show',
        'commitment_score_event_id',v_event_id,
        'finance_result',v_finance,
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png',
        'race_page_path','/dashboard/races/'||r.id::text,
        'race_supplies_path','/dashboard/equipment?tab=race-supplies',
        'race_preparation_path','/dashboard/race-preparation?tab=acceptedRaces&raceId='||r.id::text
      ),
      'prestart-disqualification-penalty-'||d.id::text,
      null
    );
  end if;

  return jsonb_build_object('success',true,'disqualification_id',d.id,'race_id',r.id,'club_id',c.id,'race_team_entry_id',e.id,'race_class_code',v_class,'score_delta',v_score_delta,'cash_penalty',v_cash,'commitment_score_event_id',v_event_id,'finance_result',v_finance,'entry_fee_refunded',false,'commitment_result',v_commitment);
end;
$function$;

with target as (
  select
    n.id,
    n.payload_json,
    d.required_jersey_units,
    d.available_jersey_units,
    d.missing_jersey_units
  from public.notifications n
  join public.notification_types nt on nt.id=n.type_id
  left join lateral (
    select dq.required_jersey_units,dq.available_jersey_units,dq.missing_jersey_units
    from public.race_team_stage_disqualifications dq
    where dq.id::text=replace(coalesce(n.payload_json->>'event_key',''),'prestart-disqualification-penalty-','')
    limit 1
  ) d on true
  where nt.code='RACE_PLAN_NEEDS_ATTENTION'
    and n.payload_json->>'event_type'='prestart_disqualification'
    and n.payload_json->>'reason_code'='mandatory_race_jersey_shortage'
)
update public.notifications n
set
  title='Team removed from '||coalesce(t.payload_json->>'race_name','race')||' — penalty applied',
  message=format('%s could not start %s because the mandatory Race Jersey Kit requirement was still unresolved at the pre-start eligibility check. %s kits were required, %s eligible, %s missing. The race entry fee remains charged. A cash fine of %s has been applied and the Race Commitment Score changed by %s. Open the race to review what happened, or open Race Supplies to prevent the same problem in future races.',
    coalesce(t.payload_json->>'club_name','Your team'),
    coalesce(t.payload_json->>'race_name','the race'),
    coalesce(t.required_jersey_units,(t.payload_json->>'required_jersey_units')::integer,0),
    coalesce(t.available_jersey_units,(t.payload_json->>'available_jersey_units')::integer,0),
    coalesce(t.missing_jersey_units,(t.payload_json->>'missing_jersey_units')::integer,0),
    to_char(coalesce((t.payload_json->>'cash_penalty')::bigint,0),'FM999,999,999,990'),
    case when coalesce((t.payload_json->>'score_delta')::integer,0)>=0 then '+'||coalesce((t.payload_json->>'score_delta')::integer,0)::text else coalesce((t.payload_json->>'score_delta')::integer,0)::text end
  ),
  action_url='/dashboard/equipment?tab=race-supplies',
  payload_json=coalesce(t.payload_json,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
    'required_jersey_units',t.required_jersey_units,
    'available_jersey_units',t.available_jersey_units,
    'missing_jersey_units',t.missing_jersey_units,
    'problem_label','Not enough eligible Race Jersey Kits',
    'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png',
    'race_page_path',case when t.payload_json->>'race_id' is not null then '/dashboard/races/'||(t.payload_json->>'race_id') else null end,
    'race_supplies_path','/dashboard/equipment?tab=race-supplies',
    'race_preparation_path',case when t.payload_json->>'race_id' is not null then '/dashboard/race-preparation?tab=acceptedRaces&raceId='||(t.payload_json->>'race_id') else null end
  ))
from target t
where n.id=t.id;