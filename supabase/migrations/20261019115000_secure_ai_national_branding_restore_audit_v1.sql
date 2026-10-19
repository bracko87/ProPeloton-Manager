-- Keep one-time production asset restoration snapshots private.
alter table public.ai_national_pool_branding_restore_audit_v1
  enable row level security;
revoke all on table public.ai_national_pool_branding_restore_audit_v1
  from anon, authenticated;
comment on table public.ai_national_pool_branding_restore_audit_v1 is
  'Private audit of original AI national club logo and jersey configuration before restoration; no public access.';
