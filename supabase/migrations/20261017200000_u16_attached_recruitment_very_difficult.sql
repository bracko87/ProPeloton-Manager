-- Hard-mode recruitment of U16 riders who already belong to an Academy.
-- Keep normal scouting, premium, capacity and user-manager source approval.
-- Unattached recruits keep their existing chances.
do $migration$
declare
  body text;
  before_text text;
begin
  select pg_get_functiondef(p.oid) into body
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='process_youth_recruitment_offer_v1';

  if body is null then raise exception 'U16 recruitment processor missing'; end if;
  before_text:=body;

  body:=replace(body,
    'when p_compensation_offer>=v_report.suggested_compensation*1.05 then 0.95',
    'when p_compensation_offer>=v_report.suggested_compensation*1.05 then 0.08');
  body:=replace(body,
    'when p_compensation_offer>=v_report.suggested_compensation then 0.85',
    'when p_compensation_offer>=v_report.suggested_compensation then 0.06');
  body:=replace(body,
    'when p_compensation_offer>=v_report.suggested_compensation*0.80 then 0.60',
    'when p_compensation_offer>=v_report.suggested_compensation*0.80 then 0.03');
  body:=replace(body,
    'when p_compensation_offer>=v_report.suggested_compensation*0.65 then 0.30',
    'when p_compensation_offer>=v_report.suggested_compensation*0.65 then 0.01');
  body:=replace(body,
    'else 0.05',
    'else 0.005');
  body:=replace(body,
    'if random()*100<=least(95,greatest(5,v_rider_score)) then',
    'if random()*100<=least(case when v_report.target_kind=''academy'' then 18 else 95 end,greatest(case when v_report.target_kind=''academy'' then 1 else 5 end,v_rider_score-case when v_report.target_kind=''academy'' then 65 else 0 end)) then');
  if body=before_text or position('then 0.95' in body)>0 or position('least(95,greatest(5,v_rider_score))' in body)>0 then
    raise exception 'U16 AI recruitment formula did not match expected version';
  end if;
  execute body;

  select pg_get_functiondef(p.oid) into body
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='respond_to_youth_recruitment_offer_v1';

  if position('v_rider_accept:=random()*100<=least(95,greatest(5,v_score));' in coalesce(body,''))=0 then
    raise exception 'U16 human source acceptance formula did not match expected version';
  end if;
  body:=replace(body,
    'v_rider_accept:=random()*100<=least(95,greatest(5,v_score));',
    'v_rider_accept:=random()*100<=least(18,greatest(1,v_score-65));');
  execute body;
end;
$migration$;
