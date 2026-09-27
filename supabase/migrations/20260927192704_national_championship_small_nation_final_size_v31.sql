CREATE OR REPLACE FUNCTION public.national_championship_refresh_planned_editions_v1(p_season_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  e record;
  s jsonb;
  p jsonb;
  v_eligible integer;
  v_first_event date;
  v_updated integer:=0;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  for e in
    select id,country_code,season_number
    from public.national_championship_editions
    where season_number=p_season_number
      and discipline='road'
      and status='planned'
    order by country_code
  loop
    select count(*)::int
    into v_eligible
    from public.preview_national_ranking_v1(
      e.country_code,
      public.get_current_game_date_date()
    );

    p:=public.national_championship_population_plan_v1(v_eligible);
    s:=public.national_championship_schedule_plan_v2(
      e.country_code,e.season_number,v_eligible
    );

    v_first_event:=case
      when coalesce((p->>'heat_count')::int,0)>0
        then nullif(s->>'qualification_window_start_date','')::date
      else nullif(s->>'final_date','')::date
    end;

    update public.national_championship_editions
    set
      eligible_count=v_eligible,
      final_field_size=least(v_eligible,cfg.final_field_size),
      direct_qualifier_count=coalesce((p->>'direct_qualifiers')::int,0),
      qualification_places=coalesce((p->>'qualification_places')::int,0),
      qualification_heat_count=coalesce((p->>'heat_count')::int,0),
      qualification_window_start_date=nullif(s->>'qualification_window_start_date','')::date,
      qualification_window_end_date=nullif(s->>'qualification_window_end_date','')::date,
      final_window_start_date=nullif(s->>'final_window_start_date','')::date,
      final_window_end_date=nullif(s->>'final_window_end_date','')::date,
      duty_window_start_date=v_first_event,
      duty_window_end_date=case
        when coalesce((p->>'heat_count')::int,0)>0
          then nullif(s->>'qualification_window_end_date','')::date
        else nullif(s->>'final_date','')::date
      end,
      qualification_date=coalesce(
        nullif(s->>'qualification_date','')::date,
        qualification_date
      ),
      final_date=coalesce(
        nullif(s->>'final_date','')::date,
        final_date
      ),
      ranking_snapshot_date=case
        when v_first_event is not null
          then v_first_event-cfg.ranking_freeze_lead_days
        else ranking_snapshot_date
      end,
      participation_decision_deadline=case
        when v_first_event is not null
          then v_first_event-cfg.participation_decision_lead_days
        else participation_decision_deadline
      end,
      climate_source_country_code=s->>'climate_source_country_code',
      climate_week_of_year=nullif(s->>'week_of_year','')::int,
      climate_expected_max_temp_c=nullif(s->>'expected_max_temp_c','')::numeric,
      climate_status=coalesce(s->>'climate_status','weather_data_unavailable'),
      qualification_source_stage_id=nullif(s->>'qualification_source_stage_id','')::uuid,
      final_source_stage_id=nullif(s->>'final_source_stage_id','')::uuid,
      route_status=coalesce(s->>'route_status','pending'),
      updated_at=now()
    where id=e.id;

    v_updated:=v_updated+1;
  end loop;

  return jsonb_build_object(
    'season_number',p_season_number,
    'editions_refreshed',v_updated
  );
end;
$function$;
