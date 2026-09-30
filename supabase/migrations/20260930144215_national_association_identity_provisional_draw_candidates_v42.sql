-- National Association identity/customization, provisional World Nations draw,
-- full host presentation, and richer National Coach candidate profiles.

alter table public.national_associations
  add column if not exists logo_url text,
  add column if not exists jersey_url text;

alter table public.national_coach_candidates
  add column if not exists first_name text,
  add column if not exists last_name text;

create table if not exists public.national_association_customization_events (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  user_id uuid not null,
  customization_type text not null check (customization_type in ('logo','jersey')),
  asset_url text,
  coin_cost integer not null default 0 check (coin_cost >= 0),
  game_date date not null default public.get_current_game_date_date(),
  created_at timestamptz not null default now()
);

create index if not exists idx_national_association_customization_events_assoc_season
  on public.national_association_customization_events(association_id,season_number,created_at);

alter table public.national_association_customization_events enable row level security;
revoke all on public.national_association_customization_events from anon,authenticated;

create or replace function private.national_association_default_jersey_url_v1(
  p_country_code text
)
returns text
language plpgsql
immutable
security definer
set search_path=''
as $function$
declare
  v_code text:=upper(coalesce(p_country_code,'XX'));
  v_index integer;
begin
  v_index:=(
    (ascii(substr(v_code||'X',1,1))*31 + ascii(substr(v_code||'X',2,1))) % 18
  )+1;

  return 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit'
    ||v_index::text||'.png';
end;
$function$;

revoke all on function private.national_association_default_jersey_url_v1(text)
from public,anon,authenticated;

create or replace function private.national_association_resolved_logo_url_v1(
  p_country_code text,
  p_logo_url text
)
returns text
language sql
immutable
security definer
set search_path=''
as $function$
  select coalesce(
    nullif(btrim(p_logo_url),''),
    'https://flagcdn.com/w160/'||lower(p_country_code)||'.png'
  );
$function$;

revoke all on function private.national_association_resolved_logo_url_v1(text,text)
from public,anon,authenticated;

create or replace function private.sync_national_association_identity_v1(
  p_association_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assoc public.national_associations%rowtype;
  v_team_id uuid;
  v_logo text;
  v_jersey text;
  v_jersey_mode text;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null then
    return;
  end if;

  select technical_club_id
  into v_team_id
  from public.national_association_race_team_identities
  where association_id=v_assoc.id
  limit 1;

  if v_team_id is null then
    return;
  end if;

  v_logo:=private.national_association_resolved_logo_url_v1(
    v_assoc.country_code,
    v_assoc.logo_url
  );
  v_jersey:=coalesce(
    nullif(btrim(v_assoc.jersey_url),''),
    private.national_association_default_jersey_url_v1(v_assoc.country_code)
  );

  update public.clubs
  set logo_path=v_logo,
      updated_at=now()
  where id=v_team_id;

  v_jersey_mode:=case
    when v_assoc.jersey_url is null or btrim(v_assoc.jersey_url)=''
      then 'generic_pool'
    else 'image_url'
  end;

  insert into public.team_kits(team_id,name,config,updated_at)
  values(
    v_team_id,
    'home',
    jsonb_build_object(
      'version',1,
      'template',case when v_jersey_mode='generic_pool' then 'generic_pool' else 'striped-tshirt' end,
      'mode',v_jersey_mode,
      'image_url',v_jersey,
      'image_data_url',null,
      'original_generic_image_url',
        private.national_association_default_jersey_url_v1(v_assoc.country_code),
      'source',case
        when v_jersey_mode='generic_pool' then 'national_association_default'
        else 'national_association_customization'
      end
    ),
    now()
  )
  on conflict(team_id,name) do update
  set config=excluded.config,
      updated_at=now();
end;
$function$;

revoke all on function private.sync_national_association_identity_v1(uuid)
from public,anon,authenticated;

create or replace function private.trg_sync_national_association_identity_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.sync_national_association_identity_v1(new.id);
  return new;
end;
$function$;

drop trigger if exists national_association_identity_sync_v1
on public.national_associations;

create trigger national_association_identity_sync_v1
after update of logo_url,jersey_url
on public.national_associations
for each row
execute function private.trg_sync_national_association_identity_v1();

create or replace function private.trg_sync_national_association_race_identity_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.sync_national_association_identity_v1(new.association_id);
  return new;
end;
$function$;

drop trigger if exists national_association_race_identity_sync_v1
on public.national_association_race_team_identities;

create trigger national_association_race_identity_sync_v1
after insert or update of technical_club_id
on public.national_association_race_team_identities
for each row
execute function private.trg_sync_national_association_race_identity_v1();

create or replace function public.get_my_national_association_customization_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_count integer:=0;
  v_balance integer:=0;
  v_can_edit boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select season_number into v_season
  from public.game_state
  where id=true;

  select m.association_id
  into v_ctx
  from public.national_association_memberships m
  where m.user_id=v_uid
    and m.status='active'
  order by m.created_at desc
  limit 1;

  if v_ctx.association_id is null then
    return jsonb_build_object('available',false,'reason','not_association_member');
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_ctx.association_id;

  if v_assoc.id is null then
    return jsonb_build_object('available',false,'reason','association_not_found');
  end if;

  select count(*)::integer
  into v_count
  from public.national_association_customization_events e
  where e.association_id=v_assoc.id
    and e.season_number=v_season;

  select coalesce(w.balance,0)
  into v_balance
  from public.user_wallets w
  where w.user_id=v_uid;

  select exists(
    select 1
    from public.national_coach_terms t
    where t.association_id=v_assoc.id
      and t.user_id=v_uid
      and t.season_number=v_season
      and t.status='active'
  )
  into v_can_edit;

  return jsonb_build_object(
    'available',true,
    'association_id',v_assoc.id,
    'country_code',v_assoc.country_code,
    'season_number',v_season,
    'can_edit',v_can_edit,
    'flag_url','https://flagcdn.com/w160/'||lower(v_assoc.country_code)||'.png',
    'logo_url',private.national_association_resolved_logo_url_v1(
      v_assoc.country_code,v_assoc.logo_url
    ),
    'custom_logo_url',v_assoc.logo_url,
    'jersey_url',coalesce(
      nullif(btrim(v_assoc.jersey_url),''),
      private.national_association_default_jersey_url_v1(v_assoc.country_code)
    ),
    'custom_jersey_url',v_assoc.jersey_url,
    'default_jersey_url',private.national_association_default_jersey_url_v1(v_assoc.country_code),
    'change_count',v_count,
    'free_change_limit',3,
    'free_changes_remaining',greatest(3-v_count,0),
    'next_change_cost',case when v_count<3 then 0 else 2 end,
    'coin_balance',coalesce(v_balance,0)
  );
end;
$function$;

revoke all on function public.get_my_national_association_customization_v1()
from public,anon;
grant execute on function public.get_my_national_association_customization_v1()
to authenticated;

create or replace function private.apply_national_association_customization_cost_v1(
  p_association_id uuid,
  p_user_id uuid,
  p_customization_type text,
  p_asset_url text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_season integer;
  v_count integer:=0;
  v_cost integer:=0;
  v_balance integer:=0;
begin
  select season_number into v_season
  from public.game_state
  where id=true;

  perform pg_advisory_xact_lock(
    hashtext(p_association_id::text||':'||v_season::text||':association-customization')
  );

  select count(*)::integer
  into v_count
  from public.national_association_customization_events e
  where e.association_id=p_association_id
    and e.season_number=v_season;

  v_cost:=case when v_count<3 then 0 else 2 end;

  if v_cost>0 then
    perform public.apply_coin_delta(
      p_user_id,
      -v_cost,
      'national_association_customization',
      jsonb_build_object(
        'association_id',p_association_id,
        'season_number',v_season,
        'customization_type',p_customization_type,
        'change_number',v_count+1,
        'coin_cost',v_cost
      )
    );
  end if;

  insert into public.national_association_customization_events(
    association_id,season_number,user_id,customization_type,asset_url,coin_cost,game_date
  )
  values(
    p_association_id,v_season,p_user_id,p_customization_type,p_asset_url,v_cost,
    public.get_current_game_date_date()
  );

  select coalesce(w.balance,0)
  into v_balance
  from public.user_wallets w
  where w.user_id=p_user_id;

  return jsonb_build_object(
    'season_number',v_season,
    'change_count',v_count+1,
    'coin_charged',v_cost,
    'coin_balance',coalesce(v_balance,0),
    'free_changes_remaining',greatest(3-(v_count+1),0),
    'next_change_cost',case when v_count+1<3 then 0 else 2 end
  );
end;
$function$;

revoke all on function private.apply_national_association_customization_cost_v1(uuid,uuid,text,text)
from public,anon,authenticated;

create or replace function public.save_my_national_association_logo_v1(
  p_logo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_assoc public.national_associations%rowtype;
  v_next text:=nullif(btrim(coalesce(p_logo_url,'')),'');
  v_cost jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can change Association branding.';
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_ctx.association_id
  for update;

  if coalesce(v_assoc.logo_url,'')=coalesce(v_next,'') then
    return public.get_my_national_association_customization_v1()
      ||jsonb_build_object('changed',false,'coin_charged',0);
  end if;

  if v_next is not null and v_next !~* '^https?://' then
    raise exception 'Association logo must be a public HTTP(S) image URL.';
  end if;

  v_cost:=private.apply_national_association_customization_cost_v1(
    v_assoc.id,v_uid,'logo',v_next
  );

  update public.national_associations
  set logo_url=v_next,
      updated_at=now()
  where id=v_assoc.id;

  perform private.sync_national_association_identity_v1(v_assoc.id);

  return public.get_my_national_association_customization_v1()
    ||v_cost
    ||jsonb_build_object('changed',true);
end;
$function$;

revoke all on function public.save_my_national_association_logo_v1(text)
from public,anon;
grant execute on function public.save_my_national_association_logo_v1(text)
to authenticated;

create or replace function public.save_my_national_association_jersey_v1(
  p_jersey_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_assoc public.national_associations%rowtype;
  v_next text:=nullif(btrim(coalesce(p_jersey_url,'')),'');
  v_cost jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can change Association branding.';
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_ctx.association_id
  for update;

  if coalesce(v_assoc.jersey_url,'')=coalesce(v_next,'') then
    return public.get_my_national_association_customization_v1()
      ||jsonb_build_object('changed',false,'coin_charged',0);
  end if;

  if v_next is not null and v_next !~* '^https?://' then
    raise exception 'Association jersey must be a public HTTP(S) image URL.';
  end if;

  v_cost:=private.apply_national_association_customization_cost_v1(
    v_assoc.id,v_uid,'jersey',v_next
  );

  update public.national_associations
  set jersey_url=v_next,
      updated_at=now()
  where id=v_assoc.id;

  perform private.sync_national_association_identity_v1(v_assoc.id);

  return public.get_my_national_association_customization_v1()
    ||v_cost
    ||jsonb_build_object('changed',true);
end;
$function$;

revoke all on function public.save_my_national_association_jersey_v1(text)
from public,anon;
grant execute on function public.save_my_national_association_jersey_v1(text)
to authenticated;

create or replace function public.register_national_coach_candidate_v2(
  p_election_id uuid,
  p_first_name text,
  p_last_name text,
  p_manifesto text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_first text:=btrim(coalesce(p_first_name,''));
  v_last text:=btrim(coalesce(p_last_name,''));
  v_manifesto text:=btrim(coalesce(p_manifesto,''));
  v_candidate_id uuid;
  v_registration_allowed boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if char_length(v_first)<2 or char_length(v_first)>40 then
    raise exception 'First name must contain between 2 and 40 characters.';
  end if;

  if char_length(v_last)<2 or char_length(v_last)>40 then
    raise exception 'Last name must contain between 2 and 40 characters.';
  end if;

  if char_length(v_manifesto)<10 or char_length(v_manifesto)>1000 then
    raise exception 'Manifesto must contain between 10 and 1000 characters.';
  end if;

  select * into v_e
  from public.national_coach_elections
  where id=p_election_id
  for update;

  if v_e.id is null then
    raise exception 'Election not found.';
  end if;

  if v_e.status='candidate_registration'
     and v_today>=v_e.registration_open_date
     and v_today<v_e.registration_close_date then
    v_registration_allowed:=true;
  elsif v_e.status='runoff'
     and v_e.runoff_registration_open
     and v_e.current_round_close_date is not null
     and v_today>=v_e.current_round_open_date
     and v_today<v_e.current_round_close_date then
    v_registration_allowed:=true;
  end if;

  if not v_registration_allowed then
    raise exception 'Candidate registration is closed.';
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_e.association_id
    and user_id=v_uid
    and status='active'
    and coach_eligible=true
  limit 1;

  if v_membership.id is null
     or not private.national_association_member_is_eligible_v1(v_e.association_id,v_uid) then
    raise exception 'You are not eligible to stand in this National Coach election.';
  end if;

  insert into public.national_coach_candidates(
    election_id,membership_id,user_id,club_id,first_name,last_name,
    manifesto,status,registered_on_game_date
  )
  values(
    v_e.id,v_membership.id,v_uid,v_membership.club_id,v_first,v_last,
    v_manifesto,'active',v_today
  )
  on conflict(election_id,user_id) do update
  set membership_id=excluded.membership_id,
      club_id=excluded.club_id,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      manifesto=excluded.manifesto,
      status='active',
      withdrawn_on_game_date=null,
      updated_at=now()
  returning id into v_candidate_id;

  update public.profiles
  set first_name=coalesce(nullif(first_name,''),v_first),
      last_name=coalesce(nullif(last_name,''),v_last),
      updated_at=now()
  where id=v_uid;

  if v_e.status='runoff' and v_e.runoff_registration_open then
    insert into public.national_coach_runoff_candidates(
      election_id,round_number,candidate_id
    )
    values(v_e.id,v_e.current_round,v_candidate_id)
    on conflict do nothing;
  end if;

  return v_candidate_id;
end;
$function$;

revoke all on function public.register_national_coach_candidate_v2(uuid,text,text,text)
from public,anon;
grant execute on function public.register_national_coach_candidate_v2(uuid,text,text,text)
to authenticated;

create or replace function public.get_national_coach_candidate_profiles_v1(
  p_election_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'candidate_id',c.id,
        'user_id',c.user_id,
        'club_id',c.club_id,
        'club_name',cl.name,
        'first_name',coalesce(nullif(c.first_name,''),nullif(p.first_name,'')),
        'last_name',coalesce(nullif(c.last_name,''),nullif(p.last_name,'')),
        'manifesto',c.manifesto,
        'status',c.status,
        'registered_on',c.registered_on_game_date,
        'is_me',c.user_id=auth.uid()
      )
      order by c.registered_on_game_date,c.created_at
    ),
    '[]'::jsonb
  )
  from public.national_coach_candidates c
  left join public.clubs cl on cl.id=c.club_id
  left join public.profiles p on p.id=c.user_id
  where c.election_id=p_election_id;
$function$;

revoke all on function public.get_national_coach_candidate_profiles_v1(uuid)
from public,anon;
grant execute on function public.get_national_coach_candidate_profiles_v1(uuid)
to authenticated;

create or replace function public.get_my_national_coach_candidate_form_v1(
  p_election_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_candidate public.national_coach_candidates%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_candidate
  from public.national_coach_candidates
  where election_id=p_election_id
    and user_id=v_uid
  limit 1;

  select * into v_profile
  from public.profiles
  where id=v_uid;

  return jsonb_build_object(
    'first_name',coalesce(nullif(v_candidate.first_name,''),nullif(v_profile.first_name,''),''),
    'last_name',coalesce(nullif(v_candidate.last_name,''),nullif(v_profile.last_name,''),''),
    'manifesto',coalesce(v_candidate.manifesto,''),
    'candidate_id',v_candidate.id
  );
end;
$function$;

revoke all on function public.get_my_national_coach_candidate_form_v1(uuid)
from public,anon;
grant execute on function public.get_my_national_coach_candidate_form_v1(uuid)
to authenticated;

-- Allow a live provisional World Nations draw during the open Season-1 field.
create or replace function private.rebuild_planned_nations_structure_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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

  delete from public.nations_competition_rounds
  where edition_id=v_edition.id;

  update public.nations_competition_editions
  set active_association_count=v_count,
      finalist_target=least(16,v_count),
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
$function$;

create or replace function private.sync_nations_open_field_draw_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
     or v_round.entrants_target<>v_expected_entrants then
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
    'field_lock_gate',v_lock,
    'structure',v_rebuild
  );
end;
$function$;

revoke all on function private.sync_nations_open_field_draw_v1(uuid)
from public,anon,authenticated;

create or replace function private.lock_nations_provisional_draw_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_round public.nations_competition_rounds%rowtype;
  v_count integer:=0;
begin
  select * into v_round
  from public.nations_competition_rounds
  where edition_id=p_edition_id
    and round_index=1
  for update;

  if v_round.id is null then
    raise exception 'World Nations first round is unavailable.';
  end if;

  select count(*)::integer
  into v_count
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  where g.round_id=v_round.id;

  if v_count=0 then
    return public.draw_nations_round_v1(v_round.id);
  end if;

  update public.nations_competition_groups
  set status='drawn',updated_at=now()
  where round_id=v_round.id;

  update public.nations_competition_rounds
  set status='drawn',updated_at=now()
  where id=v_round.id;

  update public.nations_competition_editions
  set status='qualification',updated_at=now()
  where id=p_edition_id
    and status='planned';

  return jsonb_build_object(
    'status','provisional_draw_locked',
    'edition_id',p_edition_id,
    'round_id',v_round.id,
    'drawn_entries',v_count,
    'group_count',v_round.group_count
  );
end;
$function$;

revoke all on function private.lock_nations_provisional_draw_v1(uuid)
from public,anon,authenticated;

create or replace function private.auto_enroll_national_association_in_nations_v1(
  p_association_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_edition public.nations_competition_editions%rowtype;
  v_minimum integer:=5;
  v_inserted integer:=0;
  v_today date:=public.get_current_game_date_date();
  v_lock date;
  v_rebuild jsonb:=null;
  v_schedule jsonb:=null;
  v_hosts jsonb:=null;
  v_draw jsonb:=null;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return jsonb_build_object('status','not_active');
  end if;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  if private.national_association_active_member_count_v1(v_assoc.id)<coalesce(v_minimum,5) then
    return jsonb_build_object('status','not_eligible_yet');
  end if;

  select season_number into v_season
  from public.game_state where id=true;

  v_lock:=public.nations_field_lock_gate_v1(v_season);

  select * into v_edition
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object('status','queued_for_automatic_generation','season_number',v_season);
  end if;

  if v_today>=v_lock or v_edition.status<>'planned' then
    return jsonb_build_object(
      'status','current_draw_locked_next_season_automatic',
      'edition_id',v_edition.id,
      'season_number',v_season,
      'field_lock_gate',v_lock
    );
  end if;

  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  values(v_edition.id,v_assoc.id,v_assoc.country_code,0,'entered')
  on conflict(edition_id,association_id) do nothing;

  get diagnostics v_inserted=row_count;

  if v_inserted>0 then
    v_rebuild:=private.rebuild_planned_nations_structure_v1(v_edition.id);
  end if;

  v_schedule:=public.schedule_nations_edition_v1(v_edition.id);
  v_hosts:=public.assign_nations_event_hosts_v1(v_edition.id);
  v_draw:=private.sync_nations_open_field_draw_v1(v_edition.id);

  return jsonb_build_object(
    'status',case when v_inserted>0 then 'automatically_entered' else 'already_entered' end,
    'edition_id',v_edition.id,
    'season_number',v_season,
    'structure',v_rebuild,
    'schedule',v_schedule,
    'hosts',v_hosts,
    'provisional_draw',v_draw
  );
end;
$function$;

create or replace function public.process_national_association_nations_runtime_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_field_lock date;
  v_status jsonb;
  v_elections jsonb;
  v_expired integer;
  v_duties jsonb;
  v_plan jsonb;
  v_edition_id uuid;
  v_schedule jsonb:=null;
  v_hosts jsonb:=null;
  v_next_round record;
  v_draw jsonb:=null;
begin
  select season_number into v_season
  from public.game_state where id=true;

  v_field_lock:=public.nations_field_lock_gate_v1(v_season);
  v_status:=public.refresh_national_association_statuses_v1();
  v_elections:=public.process_national_coach_elections_v1();
  v_expired:=public.expire_national_team_callups_v1();
  v_duties:=public.refresh_national_team_duty_status_v1();
  v_plan:=public.process_nations_competition_planning_v1();

  v_edition_id:=nullif(v_plan->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season
    limit 1;
  end if;

  if v_edition_id is not null then
    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);
    v_hosts:=public.assign_nations_event_hosts_v1(v_edition_id);

    if v_today<v_field_lock then
      v_draw:=private.sync_nations_open_field_draw_v1(v_edition_id);
    else
      select r.id,r.round_type,r.round_index
      into v_next_round
      from public.nations_competition_rounds r
      where r.edition_id=v_edition_id
        and r.status='planned'
        and (
          r.round_index=1
          or exists(
            select 1
            from public.nations_competition_rounds prev
            where prev.edition_id=r.edition_id
              and prev.round_index=r.round_index-1
              and prev.status='completed'
          )
        )
      order by r.round_index
      limit 1;

      if v_next_round.id is not null then
        if v_next_round.round_index=1 then
          v_draw:=private.lock_nations_provisional_draw_v1(v_edition_id);
        else
          v_draw:=public.draw_nations_round_v1(v_next_round.id);

          update public.nations_competition_editions
          set status=case
              when v_next_round.round_type='world_final' then 'world_final'
              else 'qualification'
            end,
            updated_at=now()
          where id=v_edition_id
            and status<>'completed';
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'association_statuses',v_status,
    'coach_elections',v_elections,
    'expired_or_auto_accepted_callups',v_expired,
    'national_duties',v_duties,
    'nations_planning',v_plan,
    'nations_schedule',v_schedule,
    'group_hosts',v_hosts,
    'field_lock_gate',v_field_lock,
    'draw_state',v_draw
  );
end;
$function$;

create or replace function public.get_nations_competition_event_schedule_v2(
  p_edition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'round_id',r.id,
        'round_index',r.round_index,
        'round_type',r.round_type,
        'round_label',r.round_label,
        'group_id',g.id,
        'group_number',g.group_number,
        'group_label',g.group_label,
        'event_id',e.id,
        'race_day',e.race_day,
        'race_type',e.race_type,
        'cycle_key',e.cycle_key,
        'event_date',e.event_date,
        'race_id',e.race_id,
        'stage_id',e.stage_id,
        'source_stage_id',e.source_stage_id,
        'host_association_id',e.host_association_id,
        'host_country_code',e.host_country_code,
        'host_country_name',coalesce(c.name,e.host_country_code),
        'status',e.status
      )
      order by r.round_index,g.group_number,e.race_day
    ),
    '[]'::jsonb
  )
  from public.nations_competition_rounds r
  join public.nations_competition_groups g on g.round_id=r.id
  join public.nations_group_events e on e.group_id=g.id
  left join public.countries c on upper(c.code)=upper(e.host_country_code)
  where r.edition_id=p_edition_id;
$function$;

revoke all on function public.get_nations_competition_event_schedule_v2(uuid)
from public,anon;
grant execute on function public.get_nations_competition_event_schedule_v2(uuid)
to authenticated;

create or replace function public.get_nations_competition_event_page_v2(
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_group_id uuid;
  v_participants jsonb;
begin
  v_base:=public.get_nations_competition_event_page_v1(p_event_id);

  select group_id into v_group_id
  from public.nations_group_events
  where id=p_event_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'group_entry_id',nge.id,
      'competition_entry_id',ce.id,
      'association_id',ce.association_id,
      'association_name',a.name,
      'country_code',ce.country_code,
      'seed_position',nge.seed_position,
      'status',nge.status,
      'team_id',ti.technical_club_id,
      'flag_url','https://flagcdn.com/w160/'||lower(ce.country_code)||'.png',
      'logo_url',private.national_association_resolved_logo_url_v1(
        a.country_code,a.logo_url
      ),
      'jersey_url',coalesce(
        nullif(btrim(a.jersey_url),''),
        private.national_association_default_jersey_url_v1(a.country_code)
      )
    )
    order by nge.seed_position nulls last,ce.country_code
  ),'[]'::jsonb)
  into v_participants
  from public.nations_group_entries nge
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  join public.national_associations a on a.id=ce.association_id
  left join public.national_association_race_team_identities ti
    on ti.association_id=ce.association_id
  where nge.group_id=v_group_id
    and nge.status<>'withdrawn';

  return v_base
    ||jsonb_build_object(
      'participants',v_participants,
      'participants_known',jsonb_array_length(v_participants)>0,
      'team_count',jsonb_array_length(v_participants)
    );
end;
$function$;

revoke all on function public.get_nations_competition_event_page_v2(uuid)
from public,anon;
grant execute on function public.get_nations_competition_event_page_v2(uuid)
to authenticated;

create or replace function public.get_nations_host_application_workspace_v2(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_final_code text;
  v_final_name text;
begin
  v_base:=public.get_nations_host_application_workspace_v1(p_edition_id);
  v_final_code:=v_base->>'world_final_host_country_code';

  select name into v_final_name
  from public.countries
  where upper(code)=upper(v_final_code)
  limit 1;

  return v_base||jsonb_build_object(
    'world_final_host_country_name',coalesce(v_final_name,v_final_code)
  );
end;
$function$;

revoke all on function public.get_nations_host_application_workspace_v2(uuid)
from public,anon;
grant execute on function public.get_nations_host_application_workspace_v2(uuid)
to authenticated;

-- Backfill candidate names where the profile already contains them.
update public.national_coach_candidates c
set first_name=coalesce(c.first_name,p.first_name),
    last_name=coalesce(c.last_name,p.last_name),
    updated_at=now()
from public.profiles p
where p.id=c.user_id
  and (c.first_name is null or c.last_name is null);

-- Keep all current hidden National Team identities in sync with their Association.
do $block$
declare
  v_assoc record;
  v_edition uuid;
begin
  for v_assoc in
    select id from public.national_associations
  loop
    perform private.sync_national_association_identity_v1(v_assoc.id);
  end loop;

  select id into v_edition
  from public.nations_competition_editions
  where season_number=(select season_number from public.game_state where id=true)
  limit 1;

  if v_edition is not null
     and public.get_current_game_date_date()
       < public.nations_field_lock_gate_v1(
           (select season_number from public.game_state where id=true)
         ) then
    perform private.sync_nations_open_field_draw_v1(v_edition);
    perform public.schedule_nations_edition_v1(v_edition);
    perform public.assign_nations_event_hosts_v1(v_edition);
  end if;
end;
$block$;
