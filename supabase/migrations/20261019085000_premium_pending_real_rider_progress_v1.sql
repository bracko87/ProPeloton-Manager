-- Premium-only read of genuinely earned fractional skill progress.
-- Pending bank points are not historical increases and never alter rider skills.
create or replace function public.premium_get_rider_pending_progress_v1(p_club_id uuid)
returns table (
  rider_id uuid,
  pending_progress numeric,
  ready_attribute_points integer
)
language sql stable security definer set search_path to 'public','auth','pg_temp'
as $$
  select cr.rider_id,
    coalesce(sum(greatest(b.progress_points,0)),0)::numeric as pending_progress,
    coalesce(sum(greatest(trunc(b.progress_points),0)),0)::integer as ready_attribute_points
  from public.club_riders cr
  left join public.rider_attribute_progress_bank b on b.rider_id=cr.rider_id
  where cr.club_id = public.premium_assert_manager_access_v1(p_club_id)
  group by cr.rider_id;
$$;
revoke all on function public.premium_get_rider_pending_progress_v1(uuid) from public,anon;
grant execute on function public.premium_get_rider_pending_progress_v1(uuid) to authenticated,service_role;
comment on function public.premium_get_rider_pending_progress_v1(uuid) is
'Premium-authenticated earned pending progress for active club riders. Separate from real eight-week skill changes.';
