do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'universal_race_worker_secret_v1'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'universal_race_worker_secret_v1',
      'Private scheduler secret for the authoritative Supabase Universal race worker.'
    );
  end if;
end
$$;

create or replace function public.verify_universal_race_worker_secret_v1(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_secret) > 0
    and exists (
      select 1
      from vault.decrypted_secrets s
      where s.name = 'universal_race_worker_secret_v1'
        and s.decrypted_secret = p_secret
    ),
    false
  );
$$;

revoke all on function public.verify_universal_race_worker_secret_v1(text) from public;
revoke all on function public.verify_universal_race_worker_secret_v1(text) from anon;
revoke all on function public.verify_universal_race_worker_secret_v1(text) from authenticated;
grant execute on function public.verify_universal_race_worker_secret_v1(text) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'universal-race-stage-runner-supabase-v1') then
    perform cron.unschedule('universal-race-stage-runner-supabase-v1');
  end if;
end
$$;

select cron.schedule(
  'universal-race-stage-runner-supabase-v1',
  '* * * * *',
  $cmd$
    select net.http_post(
      url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-universal-race-worker-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'universal_race_worker_secret_v1'
          limit 1
        )
      ),
      body := '{"action":"tick"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cmd$
);
