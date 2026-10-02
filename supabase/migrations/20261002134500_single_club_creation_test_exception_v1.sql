-- Keep global new-club creation closed while allowing explicitly approved
-- testing accounts to complete the normal onboarding flow.

create table if not exists public.club_creation_test_exceptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null
);

alter table public.club_creation_test_exceptions enable row level security;

revoke all on table public.club_creation_test_exceptions from anon, authenticated;

insert into public.club_creation_test_exceptions(user_id,reason)
values(
  '13747fea-414a-4fa6-87c6-c5e47de373d5'::uuid,
  'Single testing exception for Soda_Meckel while public club creation is disabled.'
)
on conflict(user_id) do update
set reason=excluded.reason,
    revoked_at=null;

create or replace function public.is_current_user_club_creation_exception_v1()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists(
    select 1
    from public.club_creation_test_exceptions e
    where e.user_id=auth.uid()
      and e.revoked_at is null
      and (e.expires_at is null or e.expires_at>now())
  );
$function$;

grant execute on function public.is_current_user_club_creation_exception_v1() to authenticated;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='create_club'
  limit 1;

  if v_definition is null then
    raise exception 'create_club not found';
  end if;

  if v_definition not ilike '%is_current_user_club_creation_exception_v1%' then
    v_definition := replace(
      v_definition,
      E'  if not found then\r\n    raise exception \'Profile not found for authenticated user.\';\r\n  end if;\r\n\r\n  v_stage := \'check existing club\';',
      E'  if not found then\r\n    raise exception \'Profile not found for authenticated user.\';\r\n  end if;\r\n\r\n  v_stage := \'club creation gate\';\r\n  if not public.is_current_user_club_creation_exception_v1() then\r\n    raise exception \'New club creation is temporarily disabled.\';\r\n  end if;\r\n\r\n  v_stage := \'check existing club\';'
    );

    execute v_definition;
  end if;
end
$migration$;
