-- National Association activation pool + expanded National Team equipment choices.
--
-- Design notes:
-- * The 50-Coin founding pool is NOT an Association treasury. It is a one-time
--   activation requirement shared by eligible members and never creates a
--   spendable Association balance.
-- * The canonical 18-row national_team_standard_equipment table remains the
--   default setup source used by existing validation/runtime contracts.
-- * national_team_equipment_options expands the coach selection pool to three
--   choices for every category and race specialization (54 choices total).
-- * National Team supplies/equipment are virtual system resources. They do not
--   deplete or wear for National Association competition use. Team cars are
--   restored to 100% whenever the hidden National Team race identity is synced.

alter table public.national_association_config
  add column if not exists activation_coin_target integer not null default 50;

update public.national_association_config
set activation_coin_target = 50
where id = true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'national_association_config_activation_coin_target_check'
      and conrelid = 'public.national_association_config'::regclass
  ) then
    alter table public.national_association_config
      add constraint national_association_config_activation_coin_target_check
      check (activation_coin_target >= 0);
  end if;
end;
$$;

create table if not exists public.national_association_activation_coin_events (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  user_id uuid not null,
  club_id uuid references public.clubs(id) on delete set null,
  amount integer not null check (amount > 0),
  game_date date not null default public.get_current_game_date_date(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists national_association_activation_coin_events_assoc_idx
  on public.national_association_activation_coin_events(association_id, created_at);

create index if not exists national_association_activation_coin_events_user_idx
  on public.national_association_activation_coin_events(user_id, association_id);

alter table public.national_association_activation_coin_events enable row level security;

comment on table public.national_association_activation_coin_events is
  'Permanent one-time founding payments toward National Association activation. This is not a treasury and cannot be spent or refunded.';

create table if not exists public.national_team_equipment_options (
  id uuid primary key default gen_random_uuid(),
  equipment_category text not null check (
    equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes')
  ),
  specialization text not null check (
    specialization in ('flat','mountain','time_trial')
  ),
  choice_rank smallint not null check (choice_rank between 1 and 3),
  catalog_item_id uuid not null references public.equipment_catalog(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(equipment_category, specialization, choice_rank),
  unique(equipment_category, specialization, catalog_item_id)
);

alter table public.national_team_equipment_options enable row level security;

comment on table public.national_team_equipment_options is
  'Three system-provided National Team equipment choices per category and specialization. National Coaches may compose three persistent race presets from this pool.';

with seed(equipment_category, specialization, choice_rank, item_key) as (
  values
    ('frame','flat',1,'pinarella_regale_corsa_frame'),
    ('frame','flat',2,'spacialized_aeroedge_x1_frame'),
    ('frame','flat',3,'cervella_aerostream_s1_frame'),
    ('frame','mountain',1,'enva_summitflow_e2_frame'),
    ('frame','mountain',2,'spacialized_climbworks_x2_frame'),
    ('frame','mountain',3,'trex_featherclimb_t2_frame'),
    ('frame','time_trial',1,'bmx_corp_chrono_t1_frame'),
    ('frame','time_trial',2,'bmx_corp_velocron_tt_420_frame'),
    ('frame','time_trial',3,'pinarella_cronovelo_p3_frame'),

    ('groupset','flat',1,'groupset_ced0b7fb_velocity_sync_pro'),
    ('groupset','flat',2,'groupset_06942d66_sprintlock_vx'),
    ('groupset','flat',3,'groupset_d4fbeb2a_veloshift_aero'),
    ('groupset','mountain',1,'groupset_db7fb57f_summitshift_pro'),
    ('groupset','mountain',2,'groupset_06942d66_montane_shift_x'),
    ('groupset','mountain',3,'groupset_db7fb57f_altoclimb_rs'),
    ('groupset','time_trial',1,'groupset_2eb9b259_chronosync_xr'),
    ('groupset','time_trial',2,'groupset_d4fbeb2a_tempus_rail_tt'),
    ('groupset','time_trial',3,'groupset_f93b8285_regale_shift_elite'),

    ('helmet','flat',1,'helmet_752c890c_velox_blade_pro'),
    ('helmet','flat',2,'helmet_gira_aerolite_vx'),
    ('helmet','flat',3,'helmet_b0ca66a4_aerofang_race'),
    ('helmet','mountain',1,'helmet_c0e9ded7_montecrest_pro'),
    ('helmet','mountain',2,'helmet_trex_skyline_halo_x'),
    ('helmet','mountain',3,'helmet_78316a48_skyline_halo'),
    ('helmet','time_trial',1,'helmet_gira_chronocrown_core'),
    ('helmet','time_trial',2,'helmet_6d7f38d5_tempus_dome_tt'),
    ('helmet','time_trial',3,'helmet_oaklea_tempus_stream'),

    ('shoes','flat',1,'shoes_06942d66_ventosprint_pro'),
    ('shoes','flat',2,'shoes_northway_sprintmesh_pro'),
    ('shoes','flat',3,'shoes_41bb9dda_aerolatch_vx'),
    ('shoes','mountain',1,'shoes_c84dcf6d_summitlite_carbon'),
    ('shoes','mountain',2,'shoes_dtm_alpinestep_pro'),
    ('shoes','mountain',3,'shoes_41bb9dda_climbweave_pro'),
    ('shoes','time_trial',1,'shoes_340a88a8_chronolock_zero'),
    ('shoes','time_trial',2,'shoes_spacialized_chronospire_core'),
    ('shoes','time_trial',3,'shoes_09980a5f_tempoglide_tt'),

    ('tires','flat',1,'tires_91168035_strada_blitz'),
    ('tires','flat',2,'tires_94791308_velosprint_mk'),
    ('tires','flat',3,'tires_a7267795_sprintvale_rx'),
    ('tires','mountain',1,'tires_91168035_peakline_mx'),
    ('tires','mountain',2,'tires_42029585_summitlace_pro'),
    ('tires','mountain',3,'tires_f0935f89_climbskin_ar'),
    ('tires','time_trial',1,'tires_db609feb_aerovail_tt'),
    ('tires','time_trial',2,'tires_f0935f89_bladefast_tt'),
    ('tires','time_trial',3,'tires_51825617_chronorush_silk'),

    ('wheelset','flat',1,'wheelset_9176080c_velocity_deep_64'),
    ('wheelset','flat',2,'wheelset_2f638822_sky_pierce_52'),
    ('wheelset','flat',3,'wheelset_5673ac7a_aero_flow_60'),
    ('wheelset','mountain',1,'wheelset_f45b885d_summit_lite_30'),
    ('wheelset','mountain',2,'wheelset_06942d66_climb_sphere_sl'),
    ('wheelset','mountain',3,'wheelset_5673ac7a_strada_pulse_45'),
    ('wheelset','time_trial',1,'wheelset_c07d8dfb_aero_storm_75'),
    ('wheelset','time_trial',2,'wheelset_2f638822_chrono_edge_90'),
    ('wheelset','time_trial',3,'wheelset_2eb9b259_chrono_disc_88')
)
insert into public.national_team_equipment_options(
  equipment_category,
  specialization,
  choice_rank,
  catalog_item_id,
  is_active
)
select
  s.equipment_category,
  s.specialization,
  s.choice_rank,
  e.id,
  true
from seed s
join public.equipment_catalog e
  on e.item_key = s.item_key
 and e.equipment_category::text = s.equipment_category
 and e.is_active = true
on conflict(equipment_category, specialization, choice_rank) do update
set catalog_item_id = excluded.catalog_item_id,
    is_active = true,
    updated_at = now();

do $$
declare
  v_count integer;
begin
  select count(*)::integer
  into v_count
  from public.national_team_equipment_options
  where is_active = true;

  if v_count <> 54 then
    raise exception 'National Team equipment option seed is incomplete: expected 54 active rows, found %.', v_count;
  end if;
end;
$$;

create or replace function public.get_national_team_standard_package_v1()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'cost_model','system_covered',
    'has_treasury',false,
    'resource_policy',jsonb_build_object(
      'unlimited',true,
      'condition_locked_percent',100,
      'consumables_deplete',false,
      'maintenance_required',false
    ),
    'staff',jsonb_build_array('national_coach'),
    'equipment',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'equipment_category',o.equipment_category,
          'specialization',o.specialization,
          'choice_rank',o.choice_rank,
          'model_count',1,
          'catalog_item_id',e.id,
          'item_key',e.item_key,
          'display_name',e.display_name,
          'tier',e.tier,
          'quality_score',e.quality_score,
          'durability_score',e.durability_score,
          'effects',e.effects,
          'metadata',e.metadata,
          'image_url',coalesce(
            nullif(btrim(e.metadata->>'image_url'),''),
            nullif(btrim(e.metadata->>'imageUrl'),'')
          ),
          'condition_percent',100,
          'unlimited',true
        )
        order by
          case o.specialization
            when 'flat' then 1
            when 'mountain' then 2
            else 3
          end,
          case o.equipment_category
            when 'frame' then 1
            when 'groupset' then 2
            when 'helmet' then 3
            when 'shoes' then 4
            when 'tires' then 5
            when 'wheelset' then 6
            else 99
          end,
          o.choice_rank
      )
      from public.national_team_equipment_options o
      join public.equipment_catalog e on e.id=o.catalog_item_id
      where o.is_active=true
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'asset_key',a.asset_key,
          'asset_level',a.asset_level,
          'quantity',a.quantity,
          'usage_note',a.usage_note,
          'asset_name',cfg.asset_name,
          'image_url',cfg.image_url,
          'condition_percent',100,
          'unlimited',true
        )
        order by a.asset_key
      )
      from public.national_team_standard_assets a
      left join public.infrastructure_asset_config cfg
        on cfg.asset_key=a.asset_key
       and cfg.asset_level=a.asset_level
      where a.is_active=true
    ),'[]'::jsonb),
    'supplies',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'supply_key',s.supply_key,
          'display_name',s.display_name,
          'quantity',s.quantity,
          'replenishment_scope',s.replenishment_scope,
          'catalog_item_id',catalog.id,
          'image_url',coalesce(
            nullif(btrim(catalog.metadata->>'image_url'),''),
            nullif(btrim(catalog.metadata->>'imageUrl'),'')
          ),
          'unlimited',true
        )
        order by s.supply_key
      )
      from public.national_team_standard_supplies s
      left join lateral (
        select e.id,e.metadata
        from public.equipment_catalog e
        where e.is_active=true
          and e.equipment_kind='race_supply'
          and e.equipment_category::text=s.supply_key
        order by e.tier desc,e.quality_score desc,e.display_name
        limit 1
      ) catalog on true
      where s.is_active=true
    ),'[]'::jsonb)
  );
$function$;

create or replace function private.ensure_national_team_standard_presets_v1(
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer;
begin
  if p_club_id is null then
    raise exception 'Technical National Team club ID is required.';
  end if;

  with specs(slot_no,specialization,setup_name) as (
    values
      (1::smallint,'flat'::text,'National Team · Flat'),
      (2::smallint,'mountain'::text,'National Team · Mountain'),
      (3::smallint,'time_trial'::text,'National Team · Time Trial')
  ),
  pivoted as (
    select
      s.slot_no,s.specialization,s.setup_name,
      max(e.catalog_item_id::text) filter(where e.equipment_category='frame')::uuid as frame_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='wheelset')::uuid as wheelset_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='tires')::uuid as tires_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='groupset')::uuid as groupset_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='helmet')::uuid as helmet_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='shoes')::uuid as shoes_id
    from specs s
    left join public.national_team_standard_equipment e
      on e.specialization=s.specialization and e.is_active=true
    group by s.slot_no,s.specialization,s.setup_name
  )
  insert into public.club_equipment_setup_presets(
    club_id,setup_slot,setup_name,
    frame_catalog_item_id,wheelset_catalog_item_id,tires_catalog_item_id,
    groupset_catalog_item_id,helmet_catalog_item_id,shoes_catalog_item_id,
    metadata
  )
  select
    p_club_id,p.slot_no,p.setup_name,
    p.frame_id,p.wheelset_id,p.tires_id,p.groupset_id,p.helmet_id,p.shoes_id,
    jsonb_build_object(
      'national_team_standard',true,
      'system_provided',true,
      'specialization',p.specialization,
      'slot_purpose',p.specialization,
      'coach_customizable',true,
      'selection_pool','national_team_equipment_options',
      'condition_locked_percent',100,
      'cost_model','system_covered'
    )
  from pivoted p
  on conflict(club_id,setup_slot) do nothing;

  get diagnostics v_count=row_count;

  return jsonb_build_object(
    'club_id',p_club_id,
    'preset_count',v_count,
    'slots',jsonb_build_array(1,2,3),
    'coach_customizable',true
  );
end;
$function$;

revoke all on function private.ensure_national_team_standard_presets_v1(uuid)
from public,anon,authenticated;

create or replace function public.get_my_national_team_equipment_presets_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    return jsonb_build_object(
      'allowed',false,
      'reason','not_active_national_coach',
      'presets','[]'::jsonb
    );
  end if;

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);
  perform private.ensure_national_team_standard_presets_v1(v_team_id);

  return jsonb_build_object(
    'allowed',true,
    'association_id',v_ctx.association_id,
    'technical_club_id',v_team_id,
    'presets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'preset_id',p.id,
          'setup_slot',p.setup_slot,
          'setup_name',p.setup_name,
          'slot_purpose',case p.setup_slot
            when 1 then 'flat'
            when 2 then 'mountain'
            when 3 then 'time_trial'
            else 'custom'
          end,
          'frame_catalog_item_id',p.frame_catalog_item_id,
          'wheelset_catalog_item_id',p.wheelset_catalog_item_id,
          'tires_catalog_item_id',p.tires_catalog_item_id,
          'groupset_catalog_item_id',p.groupset_catalog_item_id,
          'helmet_catalog_item_id',p.helmet_catalog_item_id,
          'shoes_catalog_item_id',p.shoes_catalog_item_id
        )
        order by p.setup_slot
      )
      from public.club_equipment_setup_presets p
      where p.club_id=v_team_id
        and p.setup_slot between 1 and 3
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.save_my_national_team_equipment_preset_v1(
  p_setup_slot smallint,
  p_setup_name text,
  p_frame_catalog_item_id uuid,
  p_wheelset_catalog_item_id uuid,
  p_tires_catalog_item_id uuid,
  p_groupset_catalog_item_id uuid,
  p_helmet_catalog_item_id uuid,
  p_shoes_catalog_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_team_id uuid;
  v_name text:=btrim(coalesce(p_setup_name,''));
  v_valid_count integer:=0;
  v_preset_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_setup_slot not between 1 and 3 then
    raise exception 'National Team equipment set slot must be 1, 2 or 3.';
  end if;

  if v_name='' then
    v_name:=case p_setup_slot
      when 1 then 'National Team · Flat'
      when 2 then 'National Team · Mountain'
      else 'National Team · Time Trial'
    end;
  end if;

  if char_length(v_name)>60 then
    raise exception 'Equipment set name cannot exceed 60 characters.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can edit National Team equipment sets.';
  end if;

  with requested(category,catalog_item_id) as (
    values
      ('frame'::text,p_frame_catalog_item_id),
      ('wheelset'::text,p_wheelset_catalog_item_id),
      ('tires'::text,p_tires_catalog_item_id),
      ('groupset'::text,p_groupset_catalog_item_id),
      ('helmet'::text,p_helmet_catalog_item_id),
      ('shoes'::text,p_shoes_catalog_item_id)
  )
  select count(*)::integer
  into v_valid_count
  from requested r
  where r.catalog_item_id is not null
    and exists(
      select 1
      from public.national_team_equipment_options o
      where o.equipment_category=r.category
        and o.catalog_item_id=r.catalog_item_id
        and o.is_active=true
    );

  if v_valid_count<>6 then
    raise exception 'Every equipment category must use an item from the National Team package.';
  end if;

  v_team_id:=private.ensure_national_association_race_team_v1(v_ctx.association_id);
  perform private.ensure_national_team_standard_presets_v1(v_team_id);

  update public.club_equipment_setup_presets p
  set
    setup_name=v_name,
    frame_catalog_item_id=p_frame_catalog_item_id,
    wheelset_catalog_item_id=p_wheelset_catalog_item_id,
    tires_catalog_item_id=p_tires_catalog_item_id,
    groupset_catalog_item_id=p_groupset_catalog_item_id,
    helmet_catalog_item_id=p_helmet_catalog_item_id,
    shoes_catalog_item_id=p_shoes_catalog_item_id,
    metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object(
      'national_team_standard',true,
      'system_provided',true,
      'coach_customized',true,
      'saved_by_user_id',v_uid,
      'saved_at',now(),
      'slot_purpose',case p_setup_slot
        when 1 then 'flat'
        when 2 then 'mountain'
        else 'time_trial'
      end,
      'selection_pool','national_team_equipment_options',
      'condition_locked_percent',100,
      'cost_model','system_covered'
    ),
    updated_at=now()
  where p.club_id=v_team_id
    and p.setup_slot=p_setup_slot
  returning p.id into v_preset_id;

  if v_preset_id is null then
    raise exception 'National Team equipment set could not be resolved.';
  end if;

  return jsonb_build_object(
    'saved',true,
    'preset_id',v_preset_id,
    'setup_slot',p_setup_slot,
    'setup_name',v_name,
    'technical_club_id',v_team_id
  );
end;
$function$;

revoke all on function public.get_my_national_team_equipment_presets_v1()
from public,anon;
grant execute on function public.get_my_national_team_equipment_presets_v1()
to authenticated;

revoke all on function public.save_my_national_team_equipment_preset_v1(
  smallint,text,uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon;
grant execute on function public.save_my_national_team_equipment_preset_v1(
  smallint,text,uuid,uuid,uuid,uuid,uuid,uuid
) to authenticated;

create or replace function public.get_my_national_association_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_member_count integer:=0;
  v_minimum integer:=5;
  v_activation_target integer:=50;
  v_activation_total integer:=0;
  v_my_activation_total integer:=0;
  v_coin_balance integer:=0;
  v_election public.national_coach_elections%rowtype;
  v_term public.national_coach_terms%rowtype;
  v_candidates jsonb:='[]'::jsonb;
  v_my_vote_candidate_id uuid;
  v_my_candidate_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  select
    minimum_active_members::integer,
    activation_coin_target::integer
  into v_minimum,v_activation_target
  from public.national_association_config
  where id=true;

  select coalesce(w.balance,0)
  into v_coin_balance
  from public.user_wallets w
  where w.user_id=v_uid;

  v_coin_balance:=coalesce(v_coin_balance,0);

  if v_club.club_id is null then
    return jsonb_build_object(
      'eligible',false,
      'reason','no_active_human_main_club'
    );
  end if;

  select * into v_assoc
  from public.national_associations
  where country_code=v_club.country_code
  limit 1;

  if v_assoc.id is null then
    return jsonb_build_object(
      'eligible',true,
      'country_code',v_club.country_code,
      'club_id',v_club.club_id,
      'club_name',v_club.club_name,
      'association_exists',false,
      'is_member',false,
      'minimum_members',coalesce(v_minimum,5),
      'activation_coin_target',coalesce(v_activation_target,50),
      'activation_coin_contributed',0,
      'activation_coin_remaining',coalesce(v_activation_target,50),
      'my_activation_coin_contribution',0,
      'coin_balance',v_coin_balance,
      'has_treasury',false
    );
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_assoc.id
    and user_id=v_uid
    and status='active'
  limit 1;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  select coalesce(sum(e.amount),0)::integer
  into v_activation_total
  from public.national_association_activation_coin_events e
  where e.association_id=v_assoc.id;

  select coalesce(sum(e.amount),0)::integer
  into v_my_activation_total
  from public.national_association_activation_coin_events e
  where e.association_id=v_assoc.id
    and e.user_id=v_uid;

  select * into v_election
  from public.national_coach_elections
  where association_id=v_assoc.id
    and status in ('candidate_registration','voting','runoff','completed')
  order by season_number desc,created_at desc
  limit 1;

  select * into v_term
  from public.national_coach_terms
  where association_id=v_assoc.id
    and status='active'
  order by season_number desc,created_at desc
  limit 1;

  if v_election.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'candidate_id',c.id,
          'club_id',c.club_id,
          'club_name',cl.name,
          'manifesto',c.manifesto,
          'status',c.status,
          'is_me',c.user_id=v_uid,
          'in_current_round',
            case
              when v_election.status='runoff' then exists(
                select 1
                from public.national_coach_runoff_candidates rc
                where rc.election_id=v_election.id
                  and rc.round_number=v_election.current_round
                  and rc.candidate_id=c.id
              )
              else c.status='active'
            end
        )
        order by c.registered_on_game_date,c.created_at
      ),
      '[]'::jsonb
    )
    into v_candidates
    from public.national_coach_candidates c
    left join public.clubs cl on cl.id=c.club_id
    where c.election_id=v_election.id;

    select c.id into v_my_candidate_id
    from public.national_coach_candidates c
    where c.election_id=v_election.id
      and c.user_id=v_uid
      and c.status='active'
    limit 1;

    select v.candidate_id into v_my_vote_candidate_id
    from public.national_coach_votes v
    where v.election_id=v_election.id
      and v.round_number=v_election.current_round
      and v.voter_user_id=v_uid
    limit 1;
  end if;

  return jsonb_build_object(
    'eligible',true,
    'country_code',v_assoc.country_code,
    'club_id',v_club.club_id,
    'club_name',v_club.club_name,
    'association_exists',true,
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'association_status',v_assoc.status,
    'is_member',v_membership.id is not null,
    'membership_id',v_membership.id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'activation_coin_target',coalesce(v_activation_target,50),
    'activation_coin_contributed',least(v_activation_total,coalesce(v_activation_target,50)),
    'activation_coin_remaining',greatest(coalesce(v_activation_target,50)-v_activation_total,0),
    'my_activation_coin_contribution',v_my_activation_total,
    'coin_balance',v_coin_balance,
    'activation_ready',
      v_member_count>=coalesce(v_minimum,5)
      and v_activation_total>=coalesce(v_activation_target,50),
    'has_treasury',false,
    'coach',
      case
        when v_term.id is null then null
        else jsonb_build_object(
          'term_id',v_term.id,
          'user_id',v_term.user_id,
          'club_id',v_term.club_id,
          'club_name',(select name from public.clubs where id=v_term.club_id),
          'season_number',v_term.season_number,
          'term_kind',v_term.term_kind,
          'starts_on',v_term.term_start_game_date,
          'ends_on',v_term.term_end_game_date
        )
      end,
    'election',
      case
        when v_election.id is null then null
        else jsonb_build_object(
          'id',v_election.id,
          'season_number',v_election.season_number,
          'kind',v_election.election_kind,
          'status',v_election.status,
          'registration_open_date',v_election.registration_open_date,
          'registration_close_date',v_election.registration_close_date,
          'round1_open_date',v_election.round1_open_date,
          'round1_close_date',v_election.round1_close_date,
          'current_round',v_election.current_round,
          'current_round_open_date',v_election.current_round_open_date,
          'current_round_close_date',v_election.current_round_close_date,
          'runoff_registration_open',v_election.runoff_registration_open,
          'winning_candidate_id',v_election.winning_candidate_id,
          'my_candidate_id',v_my_candidate_id,
          'my_vote_candidate_id',v_my_vote_candidate_id,
          'candidates',v_candidates
        )
      end
  );
end;
$function$;

create or replace function public.join_my_national_association_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_country_name text;
  v_membership_id uuid;
  v_member_count integer;
  v_minimum integer;
  v_activation_target integer;
  v_activation_total integer:=0;
  v_today date:=public.get_current_game_date_date();
  v_activated boolean:=false;
  v_status text;
  v_election_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    raise exception 'Your active human main club is not eligible for a National Association.';
  end if;

  select c.name into v_country_name
  from public.countries c
  where upper(c.code)=v_club.country_code
  limit 1;

  insert into public.national_associations(
    country_code,name,status,created_by_user_id,created_on_game_date,last_status_change_on_game_date
  )
  values(
    v_club.country_code,
    coalesce(v_country_name,v_club.country_code)||' National Association',
    'forming',
    v_uid,
    v_today,
    v_today
  )
  on conflict(country_code) do update
    set updated_at=now()
  returning * into v_assoc;

  update public.national_association_memberships
  set status='left',
      left_on_game_date=v_today,
      updated_at=now()
  where user_id=v_uid
    and status='active'
    and association_id<>v_assoc.id;

  insert into public.national_association_memberships(
    association_id,user_id,club_id,status,coach_eligible,joined_on_game_date,left_on_game_date
  )
  values(
    v_assoc.id,v_uid,v_club.club_id,'active',true,v_today,null
  )
  on conflict(association_id,user_id) do update
    set club_id=excluded.club_id,
        status='active',
        coach_eligible=true,
        joined_on_game_date=
          case
            when public.national_association_memberships.status='active'
              then public.national_association_memberships.joined_on_game_date
            else excluded.joined_on_game_date
          end,
        left_on_game_date=null,
        updated_at=now()
  returning id into v_membership_id;

  select
    minimum_active_members::integer,
    activation_coin_target::integer
  into v_minimum,v_activation_target
  from public.national_association_config
  where id=true;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  select coalesce(sum(e.amount),0)::integer
  into v_activation_total
  from public.national_association_activation_coin_events e
  where e.association_id=v_assoc.id;

  if v_member_count>=coalesce(v_minimum,5)
     and v_activation_total>=coalesce(v_activation_target,50)
     and v_assoc.status<>'active' then
    update public.national_associations
    set status='active',
        activated_on_game_date=coalesce(activated_on_game_date,v_today),
        inactive_on_game_date=null,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where id=v_assoc.id;

    v_activated:=true;
  end if;

  select status into v_status
  from public.national_associations
  where id=v_assoc.id;

  if v_status='active' then
    v_election_id:=public.ensure_national_coach_election_v1(v_assoc.id,null);
  end if;

  return jsonb_build_object(
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'country_code',v_assoc.country_code,
    'membership_id',v_membership_id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'activation_coin_target',coalesce(v_activation_target,50),
    'activation_coin_contributed',least(v_activation_total,coalesce(v_activation_target,50)),
    'activation_coin_remaining',greatest(coalesce(v_activation_target,50)-v_activation_total,0),
    'association_status',v_status,
    'activated_now',v_activated,
    'election_id',v_election_id,
    'has_treasury',false
  );
end;
$function$;

create or replace function public.contribute_national_association_activation_coins_v1(
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_membership public.national_association_memberships%rowtype;
  v_assoc public.national_associations%rowtype;
  v_target integer:=50;
  v_minimum integer:=5;
  v_total integer:=0;
  v_remaining integer:=0;
  v_applied integer:=0;
  v_member_count integer:=0;
  v_event_id uuid:=gen_random_uuid();
  v_balance integer:=0;
  v_today date:=public.get_current_game_date_date();
  v_activated boolean:=false;
  v_election_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'Coin contribution must be greater than zero.';
  end if;

  select m.* into v_membership
  from public.national_association_memberships m
  where m.user_id=v_uid
    and m.status='active'
    and private.national_association_member_is_eligible_v1(m.association_id,v_uid)
  order by m.created_at desc
  limit 1;

  if v_membership.id is null then
    raise exception 'Join your National Association before contributing Coins.';
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_membership.association_id
  for update;

  if v_assoc.id is null then
    raise exception 'National Association not found.';
  end if;

  select
    activation_coin_target::integer,
    minimum_active_members::integer
  into v_target,v_minimum
  from public.national_association_config
  where id=true;

  v_target:=coalesce(v_target,50);

  select coalesce(sum(e.amount),0)::integer
  into v_total
  from public.national_association_activation_coin_events e
  where e.association_id=v_assoc.id;

  v_remaining:=greatest(v_target-v_total,0);

  if v_remaining=0 then
    select coalesce(w.balance,0)
    into v_balance
    from public.user_wallets w
    where w.user_id=v_uid;

    return jsonb_build_object(
      'association_id',v_assoc.id,
      'requested_amount',p_amount,
      'applied_amount',0,
      'activation_coin_target',v_target,
      'activation_coin_contributed',least(v_total,v_target),
      'activation_coin_remaining',0,
      'coin_balance_after',coalesce(v_balance,0),
      'association_status',v_assoc.status,
      'activated_now',false
    );
  end if;

  v_applied:=least(p_amount,v_remaining);

  perform public.apply_coin_delta(
    v_uid,
    -v_applied,
    'national_association_activation',
    jsonb_build_object(
      'system_key','national_association_activation_'||v_assoc.id::text||'_'||v_event_id::text,
      'association_id',v_assoc.id,
      'country_code',v_assoc.country_code,
      'club_id',v_membership.club_id,
      'requested_amount',p_amount,
      'applied_amount',v_applied,
      'activation_coin_target',v_target
    )
  );

  insert into public.national_association_activation_coin_events(
    id,association_id,user_id,club_id,amount,game_date,metadata
  )
  values(
    v_event_id,
    v_assoc.id,
    v_uid,
    v_membership.club_id,
    v_applied,
    v_today,
    jsonb_build_object(
      'requested_amount',p_amount,
      'capped_to_remaining',p_amount>v_applied,
      'permanent',true,
      'refundable',false,
      'treasury',false
    )
  );

  v_total:=v_total+v_applied;
  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  if v_assoc.status<>'active'
     and v_member_count>=coalesce(v_minimum,5)
     and v_total>=v_target then
    update public.national_associations
    set status='active',
        activated_on_game_date=coalesce(activated_on_game_date,v_today),
        inactive_on_game_date=null,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where id=v_assoc.id;

    v_assoc.status:='active';
    v_activated:=true;
    v_election_id:=public.ensure_national_coach_election_v1(v_assoc.id,null);
  end if;

  select coalesce(w.balance,0)
  into v_balance
  from public.user_wallets w
  where w.user_id=v_uid;

  return jsonb_build_object(
    'association_id',v_assoc.id,
    'event_id',v_event_id,
    'requested_amount',p_amount,
    'applied_amount',v_applied,
    'activation_coin_target',v_target,
    'activation_coin_contributed',least(v_total,v_target),
    'activation_coin_remaining',greatest(v_target-v_total,0),
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'coin_balance_after',coalesce(v_balance,0),
    'association_status',v_assoc.status,
    'activated_now',v_activated,
    'election_id',v_election_id,
    'has_treasury',false
  );
end;
$function$;

revoke all on function public.contribute_national_association_activation_coins_v1(integer)
from public,anon;
grant execute on function public.contribute_national_association_activation_coins_v1(integer)
to authenticated;

create or replace function public.refresh_national_association_statuses_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_month integer;
  v_day integer;
  v_minimum integer;
  v_activation_target integer;
  v_activated integer:=0;
  v_inactivated integer:=0;
begin
  select month_number::integer,day_number::integer
  into v_month,v_day
  from public.game_state
  where id=true;

  select
    minimum_active_members::integer,
    activation_coin_target::integer
  into v_minimum,v_activation_target
  from public.national_association_config
  where id=true;

  -- Forming/inactive Associations activate only after BOTH founding gates:
  -- enough eligible managers and the permanent one-time activation pool.
  update public.national_associations a
  set status='active',
      activated_on_game_date=coalesce(a.activated_on_game_date,v_today),
      inactive_on_game_date=null,
      last_status_change_on_game_date=v_today,
      updated_at=now()
  where a.status in ('forming','inactive')
    and private.national_association_active_member_count_v1(a.id)>=coalesce(v_minimum,5)
    and coalesce((
      select sum(e.amount)
      from public.national_association_activation_coin_events e
      where e.association_id=a.id
    ),0)>=coalesce(v_activation_target,50);

  get diagnostics v_activated=row_count;

  -- Existing active Associations are not dissolved mid-season if a manager
  -- leaves. Eligibility is revalidated at the annual January checkpoint.
  -- The founding Coin pool is permanent and is never charged again.
  if v_month=1 and v_day=1 then
    update public.national_associations a
    set status='inactive',
        inactive_on_game_date=v_today,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where a.status='active'
      and private.national_association_active_member_count_v1(a.id)<coalesce(v_minimum,5);

    get diagnostics v_inactivated=row_count;

    update public.national_coach_terms t
    set status='ineligible',
        term_end_game_date=greatest(t.term_start_game_date,v_today),
        updated_at=now()
    where t.status='active'
      and exists(
        select 1
        from public.national_associations a
        where a.id=t.association_id
          and a.status='inactive'
      );
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'activated',v_activated,
    'inactivated_at_annual_checkpoint',v_inactivated,
    'minimum_members',coalesce(v_minimum,5),
    'activation_coin_target',coalesce(v_activation_target,50)
  );
end;
$function$;
