-- ProPeloton Manager: secure admin finance statement RPC.
-- Production repair on 19 November 2026: a verified app administrator
-- could not read its own administrative finance panel (HTTP 403).
-- Admin rights are checked INSIDE the security-definer function.
-- Ordinary users, unauthenticated clients and non-admin teams are denied.
-- Existing service-role automation access is retained.
-- This migration is replayable and does not alter financial ledger data.

CREATE OR REPLACE FUNCTION public.finance_get_club_statement_admin(p_club_id uuid, p_limit integer DEFAULT 200, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(created_at timestamp with time zone, transaction_id uuid, type text, type_name text, category text, net_amount bigint, metadata jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (
    (auth.uid() is not null and public.is_app_admin_v1())
    or coalesce(auth.jwt()->>'role','') = 'service_role'
  ) then
    raise exception 'Administrator access required for club financial statements'
      using errcode='42501';
  end if;

  return query
  with restart_boundary as (
    select max(h.created_at) restarted_at
    from public.club_restart_history h
    where h.club_id=p_club_id
  )
  select
    t.created_at,
    t.id,
    t.type,
    coalesce(tt.name,t.type),
    coalesce(tt.category,'unknown'),
    sum(e.amount)::bigint,
    t.metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id=t.id
  join finance.accounts a on a.id=e.account_id
  left join finance.transaction_types tt on tt.code=t.type
  cross join restart_boundary rb
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
    and (p_before is null or t.created_at<p_before)
    and t.created_at>coalesce(rb.restarted_at,'-infinity'::timestamptz)
  group by t.created_at,t.id,t.type,tt.name,tt.category,t.metadata
  order by t.created_at desc
  limit greatest(p_limit,1);
end
$function$


revoke all on function public.finance_get_club_statement_admin(uuid,integer,timestamptz)
  from public,anon;
grant execute on function public.finance_get_club_statement_admin(uuid,integer,timestamptz)
  to authenticated,service_role;
