create or replace function private.run_youth_staff_decisions_v1(p_academy_id uuid,p_game_date date,p_only text default null)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
 a public.youth_academies%rowtype; s public.youth_academy_settings%rowtype; b public.youth_academy_season_budgets%rowtype;
 v_role text; v_staff public.club_staff%rowtype; v_key text; v_report public.youth_scouting_reports%rowtype;
 v_race record; v_item record; v_id uuid; v_count integer:=0; v_summary text; v_meta jsonb;
 v_score integer; v_available bigint; v_slots integer; v_stipend integer; v_comp bigint; v_focus text; v_avg_fatigue numeric;
begin
 -- One lock and one recorded action per responsibility per game day also cover concurrent RPC/daily calls.
 select * into a from public.youth_academies where id=p_academy_id and is_active and not is_ai for update;
 if a.id is null or not exists(select 1 from public.clubs c where c.id=a.club_id and c.deleted_at is null and public.user_has_premium_access_v1(c.owner_user_id)) then return 0; end if;
 select * into s from private.youth_effective_settings_v1 where academy_id=a.id;
 foreach v_key in array array['recruitment_decider','recruitment_negotiation_decider','race_entry_decider','race_squad_decider','equipment_decider','camp_decider','training_decider'] loop
 if p_only is not null and p_only<>v_key then continue; end if;
 v_role:=to_jsonb(s)->>v_key;
 if v_role is null or v_role='manager' then continue; end if;
 if exists(select 1 from public.youth_staff_decisions where academy_id=a.id and game_date=p_game_date and responsibility=v_key) then continue; end if;
 select * into v_staff from public.club_staff where id=private.youth_available_role_v1(a.id,v_role);
 if v_staff.id is null then continue; end if;
 v_score:=private.youth_staff_quality_score_v1(v_staff.role_type,v_staff.expertise,v_staff.experience,v_staff.potential,v_staff.leadership,v_staff.efficiency,v_staff.loyalty);
 v_summary:=null; v_meta:='{}';
 select * into b from public.youth_academy_season_budgets where academy_id=a.id and season_number=public.get_current_season_number();
 v_available:=greatest(0,b.season_budget-b.spent_amount-b.committed_amount);
 select 16-count(*) into v_slots from public.youth_riders where academy_id=a.id and status in ('academy','graduating');
 begin
 if v_key='recruitment_decider' then
   select * into v_report from public.youth_scouting_reports r where r.academy_id=a.id and r.status='new' and r.expires_on>=p_game_date
     and private.youth_band_rank_v1(r.assessment_band)>=private.youth_band_rank_v1(s.auto_recruit_min_band)
     order by private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+r.confidence*v_score/100.0
       +private.youth_deterministic_fraction_v1(r.id::text||':director')*(100-v_score) desc,r.id limit 1;
   if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
     update public.youth_scouting_reports set status='shortlisted',updated_at=now() where id=v_report.id;
     v_summary:=format('%s shortlisted %s %s for recruitment.',v_staff.staff_name,v_report.first_name,v_report.last_name);
     v_meta:=jsonb_build_object('report_id',v_report.id);
   end if;
 elsif v_key='recruitment_negotiation_decider' then
   select * into v_report from public.youth_scouting_reports r where r.academy_id=a.id and r.status='shortlisted' and r.expires_on>=p_game_date
     and r.expected_stipend_weekly<=s.auto_recruit_max_stipend_weekly and r.suggested_compensation<=s.auto_recruit_max_compensation
     and not exists(select 1 from public.youth_recruitment_offers o where o.report_id=r.id)
     order by private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+r.confidence desc,r.id limit 1;
   if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
     v_stipend:=least(s.auto_recruit_max_stipend_weekly,greatest(50,round(v_report.expected_stipend_weekly*(1+(100-v_score)/500.0))::integer));
     v_comp:=case when v_report.target_kind='unattached' then 0 else least(s.auto_recruit_max_compensation,round(v_report.suggested_compensation*(1+(100-v_score)/400.0))::bigint) end;
     v_id:=private.process_youth_recruitment_offer_v1(a.id,v_report.id,v_stipend,v_report.suggested_accommodation_weekly,v_comp,'academy_director');
     v_summary:=format('%s negotiated with %s %s: %s per week in support, %s one-time compensation. Decision: %s.',v_staff.staff_name,v_report.first_name,v_report.last_name,v_stipend+v_report.suggested_accommodation_weekly,v_comp,(select status from public.youth_recruitment_offers where id=v_id));
     v_meta:=jsonb_build_object('offer_id',v_id);
   end if;
 elsif v_key='equipment_decider' then
   select ec.* into v_item from public.equipment_catalog ec where ec.is_active and ec.equipment_kind='durable' and ec.tier between 1 and 2
     and ec.equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes') and ec.base_price_cash<=v_available
     and not exists(select 1 from public.youth_academy_equipment_inventory inv where inv.academy_id=a.id and inv.equipment_category=ec.equipment_category and inv.status in ('available','in_use') and inv.condition_percent>25)
     order by (ec.quality_score::numeric/greatest(ec.base_price_cash,1))*v_score
       +private.youth_deterministic_fraction_v1(ec.id::text||a.id::text)*(100-v_score)/100.0 desc,ec.base_price_cash,ec.id limit 1;
   if v_item.id is not null then
     v_id:=private.purchase_youth_academy_equipment_v1(a.id,v_item.id,false);
     v_summary:=format('%s purchased %s for the Academy.',v_staff.staff_name,v_item.display_name);
     v_meta:=jsonb_build_object('inventory_id',v_id);
   end if;
 elsif v_key='race_entry_decider' then
   -- Accept at most one suitable invitation per game day, including newly delegated near-term races.
   for v_race in select r.* from public.youth_races r join public.youth_race_invitations i on i.race_id=r.id
     where i.academy_id=a.id and i.status='pending' and r.status='scheduled' and r.race_date>p_game_date
       and r.race_date<=p_game_date+14 and (r.invitation_response_deadline is null or r.invitation_response_deadline>=p_game_date or i.invitation_type<>'world_class')
       and private.youth_race_academy_qualified_v1(a.id,r.id)
       and not exists(select 1 from public.youth_race_entries e where e.race_id=r.id and e.academy_id=a.id)
     order by r.invitation_response_deadline nulls last,r.entry_cost*v_score/100.0+private.youth_deterministic_fraction_v1(r.id::text||a.id::text)*(100-v_score)*30,r.race_date limit 20 loop
     perform private.ensure_youth_monthly_race_plan_v1(a.id,v_race.season_number,extract(month from v_race.race_date)::integer);
     -- Delegating race entry authorizes staff to activate the existing plan. Never raise its limits.
     update public.youth_monthly_race_plans set approved=true,approved_at=coalesce(approved_at,now())
     where academy_id=a.id and season_number=v_race.season_number and month_number=extract(month from v_race.race_date)::integer and not approved;
     begin
       v_id:=private.enter_youth_race_v1(a.id,v_race.id,'u16_head_coach',case when v_score>=60 then 'balanced' else 'aggressive' end);
       v_summary:=format('%s entered %s on %s within the monthly race limits.',v_staff.staff_name,v_race.race_name,v_race.race_date);
       v_meta:=jsonb_build_object('race_id',v_race.id,'entry_id',v_id); exit;
     exception when raise_exception then continue; end;
   end loop;
 elsif v_key='race_squad_decider' then
   select e.id,r.race_name into v_race from public.youth_race_entries e join public.youth_races r on r.id=e.race_id
   where e.academy_id=a.id and e.status='entered' and r.status='scheduled' and r.race_date>p_game_date
     and not exists(select 1 from public.youth_staff_decisions d where d.academy_id=a.id and d.responsibility=v_key and d.metadata->>'entry_id'=e.id::text)
   order by r.race_date,e.id limit 1;
   if v_race.id is not null then
     perform private.select_youth_race_lineup_v1(v_race.id,'u16_head_coach');
     v_summary:=format('%s selected the squad for %s.',v_staff.staff_name,v_race.race_name);
     v_meta:=jsonb_build_object('entry_id',v_race.id);
   end if;
 elsif v_key='camp_decider' then
   if not exists(select 1 from public.youth_training_camps where academy_id=a.id and status<>'cancelled' and starts_on>=p_game_date-28) and v_available>=2000 then
     select avg(fatigue) into v_avg_fatigue from public.youth_riders where academy_id=a.id and status='academy';
     v_focus:=case when v_avg_fatigue>35 and v_score>=50 then 'freshness' when v_score>=65 then 'balanced' else 'development' end;
     v_id:=private.book_youth_camp_v1(a.id,v_focus,'academy_director');
     v_summary:=format('%s booked a three-day %s camp starting %s.',v_staff.staff_name,v_focus,p_game_date+3);
     v_meta:=jsonb_build_object('camp_id',v_id);
   end if;
 elsif v_key='training_decider' then
   if not exists(select 1 from public.youth_staff_decisions where academy_id=a.id and responsibility=v_key and game_date>p_game_date-7) then
     select avg(fatigue) into v_avg_fatigue from public.youth_riders where academy_id=a.id and status='academy';
     v_focus:=case when v_avg_fatigue>case when v_score>=60 then 30 else 55 end then 'freshness' when v_avg_fatigue<20 then 'development' else 'balanced' end;
     update public.youth_academy_settings set training_philosophy=v_focus,updated_at=now() where academy_id=a.id;
     update public.youth_riders set development_focus=case when v_score>=60 then private.youth_focus_for_role_v1(role,'balanced') else 'balanced' end where academy_id=a.id and status='academy';
     v_summary:=format('%s set the training plan to %s after reviewing rider fatigue.',v_staff.staff_name,v_focus);
   end if;
 end if;
 if v_summary is not null then
   insert into public.youth_staff_decisions(academy_id,staff_id,game_date,responsibility,summary,metadata)
   values(a.id,v_staff.id,p_game_date,v_key,v_summary,v_meta);
   perform private.notify_youth_staff_v1(a.id,'YOUTH_STAFF_DECISION','Youth Academy staff decision',v_summary,
   'youth-decision:'||a.id||':'||p_game_date||':'||v_key,v_meta||jsonb_build_object('staff_id',v_staff.id,'responsibility',v_key));
   v_count:=v_count+1;
 end if;
 exception when raise_exception then
   -- Expected budget/eligibility limits must not interrupt the game-day processor.
   -- Unexpected SQL errors deliberately propagate for health monitoring.
   null;
 end;
 end loop;
 return v_count;
end; $$;
create index if not exists youth_staff_decisions_staff_id_idx on public.youth_staff_decisions(staff_id);
-- Courses that began before this release must also produce their handover notice.
do $$
declare x record; v_keys text[]; v_role text;
begin
 for x in select sc.*,cs.role_type,cs.staff_name,a.id academy_id,s.* from public.staff_courses sc
 join public.club_staff cs on cs.id=sc.staff_id
 join public.youth_academies a on a.club_id=cs.club_id and a.is_active and not a.is_ai
 join public.youth_academy_settings s on s.academy_id=a.id
 where sc.status='active' and cs.role_type in ('youth_academy_director','u16_head_coach') loop
 v_role:=case x.role_type when 'youth_academy_director' then 'academy_director' else x.role_type end;
 if private.youth_available_role_v1(x.academy_id,v_role) is not null then continue; end if;
 select array_agg(replace(k.key,'_decider','')) into v_keys from jsonb_each_text(to_jsonb(x)) k where k.key like '%_decider' and k.value=v_role;
 if coalesce(cardinality(v_keys),0)>0 then
 perform private.notify_youth_staff_v1(x.academy_id,'YOUTH_STAFF_HANDOVER','Youth Academy responsibilities transferred to you',
 format('%s is attending %s until %s. You now handle: %s. Saved assignments resume when an available staff member returns.',x.staff_name,x.course_title,x.completes_on_game_date,array_to_string(v_keys,', ')),
 'youth-course:'||x.id||':active',jsonb_build_object('staff_id',x.staff_id,'returns_on',x.completes_on_game_date,'responsibilities',v_keys));
 end if;
 end loop;
end; $$;
