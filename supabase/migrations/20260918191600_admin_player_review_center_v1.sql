-- Administrator player review moderation center.
-- Pending reviews are visible only to app admins. Approval publishes the review;
-- decline permanently deletes it.

create index if not exists homepage_player_reviews_status_created_at_idx
  on public.homepage_player_reviews(status, created_at);

create or replace function public.get_admin_homepage_review_pending_count_v1()
returns integer
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.homepage_player_reviews
  where status = 'pending';

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.admin_get_homepage_review_queue_v1()
returns table(
  id uuid,
  user_id uuid,
  reviewer_name text,
  reviewer_email text,
  rating smallint,
  review_text text,
  status text,
  moderation_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.user_id,
    r.reviewer_name,
    r.reviewer_email,
    r.rating,
    r.review_text,
    r.status,
    r.moderation_note,
    r.created_at,
    r.updated_at
  from public.homepage_player_reviews r
  where r.status = 'pending'
  order by r.created_at asc;
end;
$$;

create or replace function public.admin_moderate_homepage_player_review_v1(
  p_review_id uuid,
  p_status text,
  p_moderation_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_review_id uuid;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_status not in ('approved', 'rejected') then
    raise exception 'Status must be approved or rejected.'
      using errcode = '22023';
  end if;

  if v_status = 'approved' then
    update public.homepage_player_reviews r
    set
      status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      rejected_at = null,
      rejected_by = null,
      moderation_note = nullif(trim(coalesce(p_moderation_note, '')), '')
    where r.id = p_review_id
      and r.status = 'pending'
    returning r.id into v_review_id;

    if v_review_id is null then
      raise exception 'Pending review not found.'
        using errcode = 'P0002';
    end if;

    return jsonb_build_object(
      'ok', true,
      'review_id', v_review_id,
      'status', 'approved'
    );
  end if;

  delete from public.homepage_player_reviews r
  where r.id = p_review_id
    and r.status = 'pending'
  returning r.id into v_review_id;

  if v_review_id is null then
    raise exception 'Pending review not found.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'review_id', v_review_id,
    'status', 'deleted'
  );
end;
$$;

revoke all on function public.get_admin_homepage_review_pending_count_v1() from public;
revoke all on function public.get_admin_homepage_review_pending_count_v1() from anon;
revoke all on function public.get_admin_homepage_review_pending_count_v1() from authenticated;

revoke all on function public.admin_get_homepage_review_queue_v1() from public;
revoke all on function public.admin_get_homepage_review_queue_v1() from anon;
revoke all on function public.admin_get_homepage_review_queue_v1() from authenticated;

revoke all on function public.admin_moderate_homepage_player_review_v1(uuid, text, text) from public;
revoke all on function public.admin_moderate_homepage_player_review_v1(uuid, text, text) from anon;
revoke all on function public.admin_moderate_homepage_player_review_v1(uuid, text, text) from authenticated;

grant execute on function public.get_admin_homepage_review_pending_count_v1() to authenticated, service_role;
grant execute on function public.admin_get_homepage_review_queue_v1() to authenticated, service_role;
grant execute on function public.admin_moderate_homepage_player_review_v1(uuid, text, text) to authenticated, service_role;

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
      and tablename = 'homepage_player_reviews'
  ) then
    execute 'alter publication supabase_realtime add table public.homepage_player_reviews';
  end if;
end
$$;
