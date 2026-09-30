CREATE OR REPLACE FUNCTION public.nations_qualification_plan_v1(p_active_association_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current integer:=greatest(0,coalesce(p_active_association_count,0));
  v_finalists integer:=least(16,greatest(0,v_current));
  v_groups integer;
  v_rounds jsonb:='[]'::jsonb;
begin
  if v_current=0 then
    return jsonb_build_object(
      'active_associations',0,
      'finalist_target',0,
      'rounds','[]'::jsonb
    );
  end if;

  -- World Nations uses one qualification phase. Groups are opened only when
  -- needed, with a hard 16-team ceiling. During Season 1 the provisional draw
  -- fills the existing group before a new group is created.
  v_groups:=greatest(1,ceil(v_current::numeric/16.0)::integer);

  v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
    'round_index',1,
    'round_type','final_qualification',
    'round_label','Final Qualification',
    'entrants_target',v_current,
    'advance_target',v_finalists,
    'group_count',v_groups,
    'group_size_min',12,
    'group_size_max',16
  ));

  v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
    'round_index',2,
    'round_type','world_final',
    'round_label','World Nations Final',
    'entrants_target',v_finalists,
    'advance_target',1,
    'group_count',1,
    'group_size_min',v_finalists,
    'group_size_max',v_finalists
  ));

  return jsonb_build_object(
    'active_associations',v_current,
    'finalist_target',v_finalists,
    'rounds',v_rounds
  );
end;
$function$


CREATE OR REPLACE FUNCTION private.rebuild_planned_nations_structure_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_count integer;
  v_plan jsonb;
  v_round_json jsonb;
  v_round_id uuid;
  v_group_plan jsonb;
  v_group_json jsonb;
  v_today date:=public.get_current_game_date_date();
  v_lock date;
  v_desired_groups integer;
  v_finalists integer;
  v_first_round_id uuid;
  v_final_round_id uuid;
  v_final_group_id uuid;
  v_i integer;
  v_extra_group record;
  v_entry record;
  v_target_group_id uuid;
  v_seed integer;
  v_group record;
  v_group_entries integer;
  v_remaining_entries integer;
  v_remaining_adv integer;
  v_group_adv integer;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  if v_edition.status<>'planned' then
    return jsonb_build_object('status','locked','edition_id',v_edition.id);
  end if;

  v_lock:=public.nations_field_lock_gate_v1(v_edition.season_number);

  if v_today>=v_lock and exists(
    select 1
    from public.nations_group_entries nge
    join public.nations_competition_groups g on g.id=nge.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition.id
  ) then
    return jsonb_build_object('status','draw_locked','edition_id',v_edition.id);
  end if;

  select count(*)::integer
  into v_count
  from public.nations_competition_entries
  where edition_id=v_edition.id
    and status<>'withdrawn';

  if v_count<1 then
    return jsonb_build_object('status','no_entries','edition_id',v_edition.id);
  end if;

  v_plan:=public.nations_qualification_plan_v1(v_count);
  v_desired_groups:=greatest(1,ceil(v_count::numeric/16.0)::integer);
  v_finalists:=least(16,v_count);

  select id into v_first_round_id
  from public.nations_competition_rounds
  where edition_id=v_edition.id and round_index=1
  limit 1;

  -- Season 1 remains an open provisional field until the lock date. Preserve
  -- every existing group ID and team assignment, append new Associations to
  -- the first group with room, and only open another group after 16 teams.
  if v_edition.season_number=1 and v_first_round_id is not null then
    update public.nations_competition_rounds
    set round_type='final_qualification',
        round_label='Final Qualification',
        entrants_target=v_count,
        advance_target=v_finalists,
        group_count=v_desired_groups,
        group_size_min=12,
        group_size_max=16,
        updated_at=now()
    where id=v_first_round_id;

    for v_i in 1..v_desired_groups loop
      if not exists(
        select 1 from public.nations_competition_groups
        where round_id=v_first_round_id and group_number=v_i
      ) then
        insert into public.nations_competition_groups(
          round_id,group_number,group_label,
          planned_entrant_count,planned_advance_count,status
        )
        values(
          v_first_round_id,v_i,'Group '||chr(64+v_i),
          0,0,'planned'
        );
      end if;
    end loop;

    -- If an earlier algorithm created too many small groups, fold only those
    -- extra groups into the surviving groups. Existing Group A members never
    -- move out of Group A.
    for v_extra_group in
      select id,group_number
      from public.nations_competition_groups
      where round_id=v_first_round_id
        and group_number>v_desired_groups
      order by group_number
    loop
      for v_entry in
        select nge.id
        from public.nations_group_entries nge
        where nge.group_id=v_extra_group.id
        order by nge.seed_position,nge.created_at,nge.id
      loop
        select g.id into v_target_group_id
        from public.nations_competition_groups g
        where g.round_id=v_first_round_id
          and g.group_number<=v_desired_groups
          and (
            select count(*)
            from public.nations_group_entries x
            where x.group_id=g.id
          )<16
        order by g.group_number
        limit 1;

        if v_target_group_id is null then
          raise exception 'No World Nations group has capacity while consolidating Season 1.';
        end if;

        update public.nations_group_entries
        set group_id=v_target_group_id,updated_at=now()
        where id=v_entry.id;
      end loop;

      delete from public.nations_competition_groups
      where id=v_extra_group.id;
    end loop;

    delete from public.nations_group_entries nge
    using public.nations_competition_groups g,
          public.nations_competition_entries ce
    where nge.group_id=g.id
      and g.round_id=v_first_round_id
      and ce.id=nge.competition_entry_id
      and ce.status='withdrawn';

    for v_entry in
      select ce.id
      from public.nations_competition_entries ce
      where ce.edition_id=v_edition.id
        and ce.status<>'withdrawn'
        and not exists(
          select 1
          from public.nations_group_entries nge
          join public.nations_competition_groups g on g.id=nge.group_id
          where g.round_id=v_first_round_id
            and nge.competition_entry_id=ce.id
        )
      order by ce.created_at,ce.country_code,ce.id
    loop
      select g.id into v_target_group_id
      from public.nations_competition_groups g
      where g.round_id=v_first_round_id
        and (
          select count(*)
          from public.nations_group_entries x
          where x.group_id=g.id
        )<16
      order by g.group_number
      limit 1;

      if v_target_group_id is null then
        raise exception 'No World Nations qualification group has capacity.';
      end if;

      select coalesce(max(nge.seed_position),0)+1
      into v_seed
      from public.nations_group_entries nge
      join public.nations_competition_groups g on g.id=nge.group_id
      where g.round_id=v_first_round_id;

      insert into public.nations_group_entries(
        group_id,competition_entry_id,seed_position,status
      )
      values(v_target_group_id,v_entry.id,v_seed,'entered');
    end loop;

    v_remaining_entries:=v_count;
    v_remaining_adv:=v_finalists;

    for v_group in
      select id,group_number
      from public.nations_competition_groups
      where round_id=v_first_round_id
      order by group_number
    loop
      select count(*)::integer into v_group_entries
      from public.nations_group_entries
      where group_id=v_group.id
        and status<>'withdrawn';

      if v_remaining_entries<=v_group_entries then
        v_group_adv:=least(v_group_entries,v_remaining_adv);
      elsif v_remaining_entries>0 then
        v_group_adv:=least(
          v_group_entries,
          greatest(
            0,
            floor((v_remaining_adv::numeric*v_group_entries::numeric)/v_remaining_entries::numeric)::integer
          )
        );
      else
        v_group_adv:=0;
      end if;

      update public.nations_competition_groups
      set planned_entrant_count=v_group_entries,
          planned_advance_count=v_group_adv,
          updated_at=now()
      where id=v_group.id;

      v_remaining_entries:=greatest(0,v_remaining_entries-v_group_entries);
      v_remaining_adv:=greatest(0,v_remaining_adv-v_group_adv);
    end loop;

    select id into v_final_round_id
    from public.nations_competition_rounds
    where edition_id=v_edition.id and round_index=2
    limit 1;

    if v_final_round_id is null then
      insert into public.nations_competition_rounds(
        edition_id,round_index,round_type,round_label,
        entrants_target,advance_target,group_count,
        group_size_min,group_size_max,status
      )
      values(
        v_edition.id,2,'world_final','World Nations Final',
        v_finalists,1,1,v_finalists,v_finalists,'planned'
      )
      returning id into v_final_round_id;
    else
      update public.nations_competition_rounds
      set round_type='world_final',
          round_label='World Nations Final',
          entrants_target=v_finalists,
          advance_target=1,
          group_count=1,
          group_size_min=v_finalists,
          group_size_max=v_finalists,
          updated_at=now()
      where id=v_final_round_id;
    end if;

    select id into v_final_group_id
    from public.nations_competition_groups
    where round_id=v_final_round_id and group_number=1
    limit 1;

    if v_final_group_id is null then
      insert into public.nations_competition_groups(
        round_id,group_number,group_label,
        planned_entrant_count,planned_advance_count,status
      )
      values(
        v_final_round_id,1,'World Nations Final',
        v_finalists,1,'planned'
      )
      returning id into v_final_group_id;
    else
      update public.nations_competition_groups
      set group_label='World Nations Final',
          planned_entrant_count=v_finalists,
          planned_advance_count=1,
          updated_at=now()
      where id=v_final_group_id;
    end if;

    delete from public.nations_competition_groups
    where round_id=v_final_round_id
      and group_number<>1;

    delete from public.nations_competition_rounds
    where edition_id=v_edition.id
      and round_index>2;

    update public.nations_competition_editions
    set active_association_count=v_count,
        finalist_target=v_finalists,
        updated_at=now()
    where id=v_edition.id;

    return jsonb_build_object(
      'status','rebuilt_preserving_season_1_groups',
      'edition_id',v_edition.id,
      'active_associations',v_count,
      'group_count',v_desired_groups,
      'group_size_max',16,
      'plan',v_plan
    );
  end if;

  -- Season 2+ may be redrawn before the field lock because ranking-based seed
  -- scores are intentionally spread across groups.
  delete from public.nations_competition_rounds
  where edition_id=v_edition.id;

  update public.nations_competition_editions
  set active_association_count=v_count,
      finalist_target=v_finalists,
      updated_at=now()
  where id=v_edition.id;

  for v_round_json in
    select value from jsonb_array_elements(v_plan->'rounds')
  loop
    insert into public.nations_competition_rounds(
      edition_id,round_index,round_type,round_label,
      entrants_target,advance_target,group_count,
      group_size_min,group_size_max,status
    )
    values(
      v_edition.id,
      (v_round_json->>'round_index')::integer,
      v_round_json->>'round_type',
      v_round_json->>'round_label',
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'advance_target')::integer,
      (v_round_json->>'group_count')::integer,
      (v_round_json->>'group_size_min')::integer,
      (v_round_json->>'group_size_max')::integer,
      'planned'
    )
    returning id into v_round_id;

    v_group_plan:=private.nations_distribute_group_counts_v1(
      (v_round_json->>'entrants_target')::integer,
      (v_round_json->>'group_count')::integer,
      case
        when v_round_json->>'round_type'='world_final'
          then (v_round_json->>'entrants_target')::integer
        else (v_round_json->>'advance_target')::integer
      end
    );

    for v_group_json in
      select value from jsonb_array_elements(v_group_plan)
    loop
      insert into public.nations_competition_groups(
        round_id,group_number,group_label,
        planned_entrant_count,planned_advance_count,status
      )
      values(
        v_round_id,
        (v_group_json->>'group_number')::integer,
        case
          when v_round_json->>'round_type'='world_final'
            then 'World Nations Final'
          else 'Group '||chr(64+(v_group_json->>'group_number')::integer)
        end,
        (v_group_json->>'entrant_count')::integer,
        case
          when v_round_json->>'round_type'='world_final' then 1
          else (v_group_json->>'advance_count')::integer
        end,
        'planned'
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'status','rebuilt',
    'edition_id',v_edition.id,
    'active_associations',v_count,
    'plan',v_plan
  );
end;
$function$


CREATE OR REPLACE FUNCTION private.sync_nations_open_field_draw_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_lock date;
  v_count integer;
  v_expected_groups integer;
  v_expected_entrants integer;
  v_plan jsonb;
  v_rebuild jsonb:=null;
  v_inserted integer:=0;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id
  for update;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  v_lock:=public.nations_field_lock_gate_v1(v_edition.season_number);

  if v_today>=v_lock or v_edition.status<>'planned' then
    return jsonb_build_object(
      'status','field_locked',
      'edition_id',v_edition.id,
      'field_lock_gate',v_lock
    );
  end if;

  select count(*)::integer
  into v_count
  from public.nations_competition_entries
  where edition_id=v_edition.id
    and status<>'withdrawn';

  if v_count<1 then
    return jsonb_build_object('status','no_entries','edition_id',v_edition.id);
  end if;

  v_plan:=public.nations_qualification_plan_v1(v_count);
  v_expected_groups:=coalesce((v_plan->'rounds'->0->>'group_count')::integer,1);
  v_expected_entrants:=coalesce((v_plan->'rounds'->0->>'entrants_target')::integer,v_count);

  select * into v_round
  from public.nations_competition_rounds
  where edition_id=v_edition.id
    and round_index=1
  limit 1;

  if v_round.id is null
     or v_round.group_count<>v_expected_groups
     or v_round.entrants_target<>v_expected_entrants
     or v_round.group_size_max<>16 then
    v_rebuild:=private.rebuild_planned_nations_structure_v1(v_edition.id);

    select * into v_round
    from public.nations_competition_rounds
    where edition_id=v_edition.id
      and round_index=1
    limit 1;
  end if;

  if v_round.id is null then
    raise exception 'World Nations first round is unavailable.';
  end if;

  if v_edition.season_number=1 then
    select count(*)::integer
    into v_inserted
    from public.nations_group_entries nge
    join public.nations_competition_groups g on g.id=nge.group_id
    where g.round_id=v_round.id;

    update public.nations_competition_groups
    set status='planned',updated_at=now()
    where round_id=v_round.id;

    update public.nations_competition_rounds
    set status='planned',updated_at=now()
    where id=v_round.id;

    return jsonb_build_object(
      'status','provisional_draw_preserved',
      'edition_id',v_edition.id,
      'round_id',v_round.id,
      'entries',v_inserted,
      'group_count',v_round.group_count,
      'group_size_max',16,
      'field_lock_gate',v_lock,
      'structure',v_rebuild
    );
  end if;

  delete from public.nations_group_entries nge
  using public.nations_competition_groups g
  where g.round_id=v_round.id
    and nge.group_id=g.id;

  with source as (
    select
      e.id as competition_entry_id,
      row_number() over(
        order by
          e.seed_score desc,
          md5(v_edition.season_number::text||':'||e.country_code)
      )::integer as seed_position
    from public.nations_competition_entries e
    where e.edition_id=v_edition.id
      and e.status in ('entered','advanced','finalist')
  ),
  assigned as (
    select
      s.*,
      (
        case
          when ((s.seed_position-1)/v_round.group_count)%2=0
            then ((s.seed_position-1)%v_round.group_count)+1
          else v_round.group_count-((s.seed_position-1)%v_round.group_count)
        end
      )::integer as group_number
    from source s
  )
  insert into public.nations_group_entries(
    group_id,competition_entry_id,seed_position,status
  )
  select
    g.id,a.competition_entry_id,a.seed_position,'entered'
  from assigned a
  join public.nations_competition_groups g
    on g.round_id=v_round.id
   and g.group_number=a.group_number;

  get diagnostics v_inserted=row_count;

  update public.nations_competition_groups
  set status='planned',updated_at=now()
  where round_id=v_round.id;

  update public.nations_competition_rounds
  set status='planned',updated_at=now()
  where id=v_round.id;

  return jsonb_build_object(
    'status','provisional_draw',
    'edition_id',v_edition.id,
    'round_id',v_round.id,
    'entries',v_inserted,
    'group_count',v_round.group_count,
    'group_size_max',16,
    'field_lock_gate',v_lock,
    'structure',v_rebuild
  );
end;
$function$

