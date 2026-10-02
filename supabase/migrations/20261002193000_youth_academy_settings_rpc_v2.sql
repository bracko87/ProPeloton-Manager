-- Avoid PostgREST ambiguity while Phase 1 and Phase 2A frontends overlap.
-- Keep the original eight-argument v1 RPC and give the extended twelve-argument
-- function its own v2 name.

alter function public.update_my_youth_academy_settings_v1(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint
)
rename to update_my_youth_academy_settings_v2;

grant execute on function public.update_my_youth_academy_settings_v2(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint
) to authenticated;
