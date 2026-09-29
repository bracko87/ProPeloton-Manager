create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  sender_name text not null,
  sender_email text not null,
  message text not null,
  source text not null default 'contact-form',
  email_status text not null default 'pending',
  resend_email_id text null,
  delivery_error text null,
  email_sent_at timestamptz null,
  admin_status text not null default 'open',
  archived_at timestamptz null,
  archived_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_messages_email_status_chk
    check (email_status in ('pending','sent','failed')),
  constraint contact_messages_admin_status_chk
    check (admin_status in ('open','archived'))
);

create table if not exists public.contact_message_admin_reads (
  contact_message_id uuid not null references public.contact_messages(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (contact_message_id, admin_user_id)
);

create index if not exists contact_messages_admin_status_created_idx
  on public.contact_messages(admin_status, created_at desc);

create index if not exists contact_messages_email_status_created_idx
  on public.contact_messages(email_status, created_at desc);

create index if not exists contact_message_admin_reads_admin_idx
  on public.contact_message_admin_reads(admin_user_id, read_at desc);

alter table public.contact_messages enable row level security;
alter table public.contact_message_admin_reads enable row level security;

revoke all on table public.contact_messages from anon, authenticated;
revoke all on table public.contact_message_admin_reads from anon, authenticated;

create or replace function public.get_admin_contact_message_unread_count_v1()
returns integer
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.contact_messages m
  where m.admin_status = 'open'
    and not exists (
      select 1
      from public.contact_message_admin_reads r
      where r.contact_message_id = m.id
        and r.admin_user_id = v_admin_user_id
    );

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.get_admin_contact_messages_v1(
  p_view text default 'open',
  p_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_user_id uuid := auth.uid();
  v_view text := lower(trim(coalesce(p_view, 'open')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_view not in ('open','archived','all') then
    raise exception 'Invalid contact message view'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'counts',
    jsonb_build_object(
      'total', count(*)::integer,
      'open', count(*) filter (where m.admin_status = 'open')::integer,
      'archived', count(*) filter (where m.admin_status = 'archived')::integer,
      'unread', count(*) filter (
        where m.admin_status = 'open'
          and not exists (
            select 1
            from public.contact_message_admin_reads rr
            where rr.contact_message_id = m.id
              and rr.admin_user_id = v_admin_user_id
          )
      )::integer,
      'failed_email', count(*) filter (where m.email_status = 'failed')::integer
    ),
    'messages',
    coalesce(
      (
        select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
        from (
          select
            cm.id,
            cm.user_id,
            cm.sender_name,
            cm.sender_email,
            cm.message,
            cm.source,
            cm.email_status,
            cm.resend_email_id,
            cm.delivery_error,
            cm.email_sent_at,
            cm.admin_status,
            cm.archived_at,
            cm.archived_by,
            cm.created_at,
            cm.updated_at,
            not exists (
              select 1
              from public.contact_message_admin_reads r
              where r.contact_message_id = cm.id
                and r.admin_user_id = v_admin_user_id
            ) as is_unread
          from public.contact_messages cm
          where
            v_view = 'all'
            or (v_view = 'open' and cm.admin_status = 'open')
            or (v_view = 'archived' and cm.admin_status = 'archived')
          order by cm.created_at desc
          limit v_limit
        ) row_data
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.contact_messages m;

  return v_result;
end;
$$;

create or replace function public.mark_admin_contact_message_read_v1(
  p_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.contact_messages where id = p_message_id
  ) then
    return false;
  end if;

  insert into public.contact_message_admin_reads (
    contact_message_id,
    admin_user_id,
    read_at
  )
  values (
    p_message_id,
    v_admin_user_id,
    now()
  )
  on conflict (contact_message_id, admin_user_id)
  do update set read_at = excluded.read_at;

  return true;
end;
$$;

create or replace function public.admin_archive_contact_message_v1(
  p_message_id uuid,
  p_archived boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  update public.contact_messages
  set
    admin_status = case when p_archived then 'archived' else 'open' end,
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then v_admin_user_id else null end,
    updated_at = now()
  where id = p_message_id;

  return found;
end;
$$;

revoke all on function public.get_admin_contact_message_unread_count_v1() from public;
revoke all on function public.get_admin_contact_messages_v1(text, integer) from public;
revoke all on function public.mark_admin_contact_message_read_v1(uuid) from public;
revoke all on function public.admin_archive_contact_message_v1(uuid, boolean) from public;

revoke all on function public.get_admin_contact_message_unread_count_v1() from anon;
revoke all on function public.get_admin_contact_messages_v1(text, integer) from anon;
revoke all on function public.mark_admin_contact_message_read_v1(uuid) from anon;
revoke all on function public.admin_archive_contact_message_v1(uuid, boolean) from anon;

grant execute on function public.get_admin_contact_message_unread_count_v1() to authenticated, service_role;
grant execute on function public.get_admin_contact_messages_v1(text, integer) to authenticated, service_role;
grant execute on function public.mark_admin_contact_message_read_v1(uuid) to authenticated, service_role;
grant execute on function public.admin_archive_contact_message_v1(uuid, boolean) to authenticated, service_role;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname='supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='contact_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.contact_messages';
  end if;
end
$$;
