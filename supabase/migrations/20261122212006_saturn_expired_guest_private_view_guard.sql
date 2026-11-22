-- SAT-09 follow-up: exclude expired, unconverted anonymous test identities
-- from exact rider skills and club financial records, even before cleanup.
-- Preserves existing function ownership/grants and server service-role access.
-- No player, team, wallet or trial rows are changed.

create or replace function private.saturn_can_view_club_private_v1(p_club_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select coalesce((auth.jwt()->>'role' = 'service_role'), false)
    or (
      auth.uid() is not null
      and not exists (
        select 1 from public.saturn_test_accounts_v1 t
        where t.user_id = auth.uid()
          and t.converted_at is null
          and (t.expires_at is null or t.expires_at <= now())
      )
      and exists (
        select 1
        from public.clubs c
        where c.id = p_club_id
          and c.deleted_at is null
          and (
            c.owner_user_id = auth.uid()
            or exists (
              select 1
              from public.club_memberships cm
              where cm.club_id = c.id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
$function$;

create or replace function private.saturn_can_view_rider_private_v1(p_rider_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select coalesce((auth.jwt()->>'role' = 'service_role'), false)
    or (
      auth.uid() is not null
      and not exists (
        select 1 from public.saturn_test_accounts_v1 t
        where t.user_id = auth.uid()
          and t.converted_at is null
          and (t.expires_at is null or t.expires_at <= now())
      )
      and exists (
        select 1
        from public.club_riders cr
        join public.clubs c on c.id = cr.club_id
        where cr.rider_id = p_rider_id
          and c.deleted_at is null
          and (
            c.owner_user_id = auth.uid()
            or exists (
              select 1
              from public.club_memberships cm
              where cm.club_id = c.id
                and cm.user_id = auth.uid()
            )
          )
      )
    );
$function$;
