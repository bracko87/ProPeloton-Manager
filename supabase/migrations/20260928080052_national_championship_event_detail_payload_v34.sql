create or replace function public.get_national_championship_event_page_v2(
  p_edition_id uuid,
  p_event_type text,
  p_heat_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_has_entries boolean:=false;
  v_participants jsonb:='[]'::jsonb;
  v_results jsonb:='[]'::jsonb;
  v_viewer_has_participant boolean:=false;
  v_current_game_date date:=public.get_current_game_date_date();
  v_preview_date date;
  v_generic_jersey constant text :=
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit53.png';
begin
  v_base:=public.get_national_championship_event_page_v1(
    p_edition_id,p_event_type,p_heat_number
  );

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National Championship edition not found';
  end if;

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where edition_id=e.id
      and heat_number=p_heat_number
    limit 1;
  end if;

  v_race_id:=nullif(v_base->>'race_id','')::uuid;

  if v_race_id is not null then
    select s.id
    into v_stage_id
    from public.race_stages s
    where s.race_id=v_race_id
    order by s.stage_number
    limit 1;
  end if;

  select exists(
    select 1
    from public.national_championship_entries en
    where en.edition_id=e.id
  )
  into v_has_entries;

  v_preview_date:=least(v_current_game_date,e.ranking_snapshot_date);

  if p_event_type='qualification' then
    if v_has_entries then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          en.rider_id,
          en.rider_name_snapshot as rider_name,
          en.national_rank,
          en.seed_number,
          en.club_id_snapshot as club_id,
          coalesce(c.name,'Free Agent') as team_name,
          en.country_code_snapshot as country_code,
          en.entry_status,
          en.participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            case when en.club_id_snapshot is null then v_generic_jersey else v_generic_jersey end
          ) as jersey_url
        from public.national_championship_entries en
        left join public.clubs c on c.id=en.club_id_snapshot
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=en.club_id_snapshot
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=en.club_id_snapshot
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where en.edition_id=e.id
          and en.heat_number=p_heat_number
          and coalesce(en.participation_decision,'pending')<>'rejected'
          and en.entry_status<>'withdrawn'
      ) x;
    else
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          p.rider_id,
          p.rider_name,
          p.national_rank,
          p.national_rank as seed_number,
          p.club_id,
          coalesce(c.name,'Free Agent') as team_name,
          p.country_code,
          'projected'::text as entry_status,
          'projected'::text as participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.preview_national_ranking_v1(e.country_code,v_preview_date) p
        left join public.clubs c on c.id=p.club_id
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=p.club_id
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=p.club_id
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where case
          when (floor(((p.national_rank-1)::numeric)/greatest(e.qualification_heat_count,1))::int % 2)=0
            then ((p.national_rank-1)%greatest(e.qualification_heat_count,1))+1
          else greatest(e.qualification_heat_count,1)-((p.national_rank-1)%greatest(e.qualification_heat_count,1))
        end=p_heat_number
      ) x;
    end if;
  elsif p_event_type='final' then
    if v_has_entries then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          en.rider_id,
          en.rider_name_snapshot as rider_name,
          en.national_rank,
          en.seed_number,
          en.club_id_snapshot as club_id,
          coalesce(c.name,'Free Agent') as team_name,
          en.country_code_snapshot as country_code,
          en.entry_status,
          en.participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.national_championship_entries en
        left join public.clubs c on c.id=en.club_id_snapshot
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=en.club_id_snapshot
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=en.club_id_snapshot
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where en.edition_id=e.id
          and en.entry_status in ('direct_qualified','qualified','finalist')
          and coalesce(en.participation_decision,'pending')<>'rejected'
      ) x;
    elsif coalesce(e.qualification_heat_count,0)=0 then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          p.rider_id,
          p.rider_name,
          p.national_rank,
          p.national_rank as seed_number,
          p.club_id,
          coalesce(c.name,'Free Agent') as team_name,
          p.country_code,
          'projected'::text as entry_status,
          'projected'::text as participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.preview_national_ranking_v1(e.country_code,v_preview_date) p
        left join public.clubs c on c.id=p.club_id
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=p.club_id
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=p.club_id
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        order by p.national_rank
        limit e.final_field_size
      ) x;
    else
      v_participants:='[]'::jsonb;
    end if;
  end if;

  if v_stage_id is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.rank nulls last,x.rider_name),'[]'::jsonb)
    into v_results
    from (
      select
        rs.rank,
        rs.rider_id,
        coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,
          trim(coalesce(r.first_name,'')||' '||coalesce(r.last_name,''))) as rider_name,
        en.club_id_snapshot as club_id,
        coalesce(c.name,rs.team_name_snapshot,'Free Agent') as team_name,
        coalesce(en.country_code_snapshot,r.country_code,e.country_code) as country_code,
        rs.elapsed_seconds,
        rs.gap_seconds,
        rs.status,
        coalesce(
          nullif(tk.config->>'image_url',''),
          nullif(aik.jersey_url,''),
          v_generic_jersey
        ) as jersey_url
      from public.race_stage_results rs
      left join public.national_championship_entries en
        on en.edition_id=e.id
       and en.rider_id=rs.rider_id
      left join public.riders r on r.id=rs.rider_id
      left join public.clubs c on c.id=en.club_id_snapshot
      left join lateral (
        select tk1.config
        from public.team_kits tk1
        where tk1.team_id=en.club_id_snapshot
        order by
          case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
          tk1.updated_at desc
        limit 1
      ) tk on true
      left join lateral (
        select a.jersey_url
        from public.ai_team_kit_previews a
        where a.club_id=en.club_id_snapshot
          and coalesce(a.is_active,true)
        order by a.updated_at desc
        limit 1
      ) aik on true
      where rs.stage_id=v_stage_id
        and rs.rider_id is not null
    ) x;
  end if;

  if v_has_entries then
    select exists(
      select 1
      from public.national_championship_entries en
      left join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=e.id
        and root.owner_user_id=auth.uid()
        and coalesce(en.participation_decision,'pending')<>'rejected'
        and (
          (p_event_type='qualification'
            and en.heat_number=p_heat_number
            and en.entry_status<>'withdrawn')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist'))
        )
    )
    into v_viewer_has_participant;
  end if;

  return v_base || jsonb_build_object(
    'current_game_date',v_current_game_date,
    'generated_stage_id',v_stage_id,
    'participants',v_participants,
    'participants_known',
      case
        when p_event_type='final'
         and coalesce(e.qualification_heat_count,0)>0
         and jsonb_array_length(v_participants)=0
        then false
        else true
      end,
    'results',v_results,
    'viewer_has_participant',v_viewer_has_participant,
    'generated_stage',case
      when v_stage_id is null then null
      else (
        select jsonb_build_object(
          'id',s.id,
          'race_id',s.race_id,
          'stage_number',s.stage_number,
          'stage_date',s.stage_date,
          'name',s.name,
          'start_city',coalesce(nullif(s.start_city_name,''),s.start_city),
          'finish_city',coalesce(nullif(s.finish_city_name,''),s.finish_city),
          'planned_start_time_label',s.planned_start_time_label,
          'planned_start_hour_number',s.planned_start_hour_number,
          'planned_start_minute',s.planned_start_minute,
          'terrain_type',s.terrain_type,
          'profile_type',s.profile_type,
          'distance_km',s.distance_km,
          'elevation_gain_m',s.elevation_gain_m,
          'flat_pct',s.flat_pct,
          'hilly_pct',s.hilly_pct,
          'mountain_pct',s.mountain_pct,
          'cobbled_pct',s.cobbled_pct,
          'weather_snapshot',coalesce(s.weather_snapshot,'{}'::jsonb),
          'weather_summary',s.weather_summary,
          'weather_cancelled',s.weather_cancelled,
          'weather_cancellation_reason',s.weather_cancellation_reason
        )
        from public.race_stages s
        where s.id=v_stage_id
      )
    end
  );
end;
$$;

revoke all on function public.get_national_championship_event_page_v2(uuid,text,integer)
from public,anon;
grant execute on function public.get_national_championship_event_page_v2(uuid,text,integer)
to authenticated,service_role;
