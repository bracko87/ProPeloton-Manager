-- Admin bug report center: admin-only queue, unread badges, notes, status/priority,
-- and private screenshot access.

alter table public.bug_reports
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists priority text not null default 'normal',
  add column if not exists assigned_admin_id uuid null,
  add column if not exists resolved_at timestamptz null;

create table if not exists public.bug_report_admin_reads (
  bug_report_id uuid not null references public.bug_reports(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (bug_report_id, admin_user_id)
);

create table if not exists public.bug_report_notes (
  id uuid primary key default gen_random_uuid(),
  bug_report_id uuid not null references public.bug_reports(id) on delete cascade,
  admin_user_id uuid null references auth.users(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_created_at_idx
  on public.bug_reports(created_at desc);

create index if not exists bug_reports_status_created_at_idx
  on public.bug_reports(status, created_at desc);

create index if not exists bug_report_admin_reads_admin_idx
  on public.bug_report_admin_reads(admin_user_id, read_at desc);

create index if not exists bug_report_notes_report_idx
  on public.bug_report_notes(bug_report_id, created_at);

alter table public.bug_report_admin_reads enable row level security;
alter table public.bug_report_notes enable row level security;

drop policy if exists "authenticated users can insert bug reports" on public.bug_reports;
drop policy if exists "users can insert own bug reports" on public.bug_reports;
drop policy if exists "app admins can read bug reports" on public.bug_reports;

create policy "users can insert own bug reports"
on public.bug_reports
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy "app admins can read bug reports"
on public.bug_reports
for select
to authenticated
using (public.is_app_admin_v1());

drop policy if exists "app admins can read bug report notes" on public.bug_report_notes;
drop policy if exists "app admins can add bug report notes" on public.bug_report_notes;
drop policy if exists "app admins can read own bug report read state" on public.bug_report_admin_reads;
drop policy if exists "app admins can insert own bug report read state" on public.bug_report_admin_reads;
drop policy if exists "app admins can update own bug report read state" on public.bug_report_admin_reads;

create policy "app admins can read bug report notes"
on public.bug_report_notes
for select
to authenticated
using (public.is_app_admin_v1());

create policy "app admins can add bug report notes"
on public.bug_report_notes
for insert
to authenticated
with check (
  public.is_app_admin_v1()
  and admin_user_id = auth.uid()
);

create policy "app admins can read own bug report read state"
on public.bug_report_admin_reads
for select
to authenticated
using (
  public.is_app_admin_v1()
  and admin_user_id = auth.uid()
);

create policy "app admins can insert own bug report read state"
on public.bug_report_admin_reads
for insert
to authenticated
with check (
  public.is_app_admin_v1()
  and admin_user_id = auth.uid()
);

create policy "app admins can update own bug report read state"
on public.bug_report_admin_reads
for update
to authenticated
using (
  public.is_app_admin_v1()
  and admin_user_id = auth.uid()
)
with check (
  public.is_app_admin_v1()
  and admin_user_id = auth.uid()
);

grant select, insert on public.bug_reports to authenticated;
grant select, insert on public.bug_report_notes to authenticated;
grant select, insert, update on public.bug_report_admin_reads to authenticated;

update storage.buckets
set public = false
where id = 'bug-report-screenshots';

drop policy if exists "authenticated users can upload bug screenshots" on storage.objects;
drop policy if exists "users can upload own bug screenshots" on storage.objects;
drop policy if exists "app admins can read bug screenshots" on storage.objects;

create policy "users can upload own bug screenshots"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'bug-report-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "app admins can read bug screenshots"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'bug-report-screenshots'
  and public.is_app_admin_v1()
);

create or replace function public.get_admin_bug_report_unread_count_v1()
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
  from public.bug_reports br
  where not exists (
    select 1
    from public.bug_report_admin_reads r
    where r.bug_report_id = br.id
      and r.admin_user_id = v_admin_user_id
  );

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.get_admin_bug_reports_v1(
  p_status text default null,
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if p_status is not null
     and p_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Invalid bug report status'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'counts',
    jsonb_build_object(
      'total', count(*)::integer,
      'unread', count(*) filter (
        where not exists (
          select 1
          from public.bug_report_admin_reads rr
          where rr.bug_report_id = br.id
            and rr.admin_user_id = v_admin_user_id
        )
      )::integer,
      'open', count(*) filter (where br.status = 'open')::integer,
      'in_progress', count(*) filter (where br.status = 'in_progress')::integer,
      'resolved', count(*) filter (where br.status = 'resolved')::integer,
      'closed', count(*) filter (where br.status = 'closed')::integer
    ),
    'reports',
    coalesce(
      (
        select jsonb_agg(to_jsonb(report_row) order by report_row.created_at desc)
        from (
          select
            b.id,
            b.created_at,
            b.updated_at,
            b.user_id,
            b.page_label,
            b.page_path,
            b.page_url,
            b.description,
            b.severity,
            b.browser,
            b.viewport,
            b.reported_from,
            b.status,
            b.priority,
            b.assigned_admin_id,
            b.resolved_at,
            b.bug_type,
            b.expected_result,
            b.actual_result,
            b.steps_to_reproduce,
            b.screenshot_path,
            b.screenshot_url,
            p.username as reporter_username,
            p.email as reporter_email,
            nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as reporter_full_name,
            c.id as club_id,
            c.name as club_name,
            not exists (
              select 1
              from public.bug_report_admin_reads r
              where r.bug_report_id = b.id
                and r.admin_user_id = v_admin_user_id
            ) as is_unread
          from public.bug_reports b
          left join public.profiles p
            on p.id = b.user_id
          left join lateral (
            select club.id, club.name
            from public.clubs club
            where club.owner_user_id = b.user_id
              and club.deleted_at is null
            order by
              case when club.club_type = 'main' then 0 else 1 end,
              club.created_at asc
            limit 1
          ) c on true
          where p_status is null or b.status = p_status
          order by b.created_at desc
          limit v_limit
        ) report_row
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.bug_reports br;

  return v_result;
end;
$$;

create or replace function public.mark_admin_bug_report_read_v1(
  p_report_id uuid
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
    select 1
    from public.bug_reports
    where id = p_report_id
  ) then
    return false;
  end if;

  insert into public.bug_report_admin_reads (
    bug_report_id,
    admin_user_id,
    read_at
  )
  values (
    p_report_id,
    v_admin_user_id,
    now()
  )
  on conflict (bug_report_id, admin_user_id)
  do update set read_at = excluded.read_at;

  return true;
end;
$$;

create or replace function public.get_admin_bug_report_notes_v1(
  p_report_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'bug_report_id', n.bug_report_id,
        'admin_user_id', n.admin_user_id,
        'author', coalesce(p.username, p.email, 'Administrator'),
        'note', n.note,
        'created_at', n.created_at
      )
      order by n.created_at asc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.bug_report_notes n
  left join public.profiles p
    on p.id = n.admin_user_id
  where n.bug_report_id = p_report_id;

  return v_result;
end;
$$;

create or replace function public.admin_add_bug_report_note_v1(
  p_report_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_user_id uuid := auth.uid();
  v_note_id uuid;
  v_note text := trim(coalesce(p_note, ''));
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_note = '' then
    raise exception 'Note cannot be empty'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.bug_reports
    where id = p_report_id
  ) then
    raise exception 'Bug report not found'
      using errcode = 'P0002';
  end if;

  insert into public.bug_report_notes (
    bug_report_id,
    admin_user_id,
    note
  )
  values (
    p_report_id,
    v_admin_user_id,
    v_note
  )
  returning id into v_note_id;

  return v_note_id;
end;
$$;

create or replace function public.admin_update_bug_report_v1(
  p_report_id uuid,
  p_status text,
  p_priority text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_admin_user_id uuid := auth.uid();
  v_status text := coalesce(nullif(trim(p_status), ''), 'open');
  v_priority text := coalesce(nullif(trim(p_priority), ''), 'normal');
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Invalid bug report status'
      using errcode = '22023';
  end if;

  if v_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid bug report priority'
      using errcode = '22023';
  end if;

  update public.bug_reports
  set
    status = v_status,
    priority = v_priority,
    updated_at = now(),
    resolved_at = case
      when v_status in ('resolved', 'closed') then coalesce(resolved_at, now())
      else null
    end
  where id = p_report_id;

  return found;
end;
$$;

revoke all on function public.get_admin_bug_report_unread_count_v1() from public;
revoke all on function public.get_admin_bug_reports_v1(text, integer) from public;
revoke all on function public.mark_admin_bug_report_read_v1(uuid) from public;
revoke all on function public.get_admin_bug_report_notes_v1(uuid) from public;
revoke all on function public.admin_add_bug_report_note_v1(uuid, text) from public;
revoke all on function public.admin_update_bug_report_v1(uuid, text, text) from public;

grant execute on function public.get_admin_bug_report_unread_count_v1() to authenticated;
grant execute on function public.get_admin_bug_reports_v1(text, integer) to authenticated;
grant execute on function public.mark_admin_bug_report_read_v1(uuid) to authenticated;
grant execute on function public.get_admin_bug_report_notes_v1(uuid) to authenticated;
grant execute on function public.admin_add_bug_report_note_v1(uuid, text) to authenticated;
grant execute on function public.admin_update_bug_report_v1(uuid, text, text) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bug_reports'
  ) then
    execute 'alter publication supabase_realtime add table public.bug_reports';
  end if;
end
$$;
