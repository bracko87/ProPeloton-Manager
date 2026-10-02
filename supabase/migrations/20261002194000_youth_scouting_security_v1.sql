-- Lock Phase 2A Youth scouting internals behind the authenticated public RPCs.

revoke all on function private.youth_scout_score_v1(uuid)
from public,anon,authenticated;
revoke all on function private.youth_band_rank_v1(text)
from public,anon,authenticated;
revoke all on function private.draw_youth_potential_v1()
from public,anon,authenticated;
revoke all on function private.youth_exact_birth_date_v1(integer)
from public,anon,authenticated;
revoke all on function private.youth_country_allowed_v1(text,text,text)
from public,anon,authenticated;
revoke all on function private.pick_youth_scouting_country_v1(text,text)
from public,anon,authenticated;
revoke all on function private.youth_relocation_difficulty_v1(text,text)
from public,anon,authenticated;
revoke all on function private.youth_strengths_v1(
  integer,integer,integer,integer,integer,integer,integer,integer,integer,integer
)
from public,anon,authenticated;
revoke all on function private.process_youth_recruitment_offer_v1(
  uuid,uuid,integer,integer,bigint,text
)
from public,anon,authenticated;

revoke all on function public.get_my_youth_scouting_v1() from public,anon;
revoke all on function public.run_my_youth_scouting_cycle_v1() from public,anon;
revoke all on function public.submit_youth_recruitment_offer_v1(
  uuid,integer,integer,bigint
) from public,anon;
revoke all on function public.update_my_youth_academy_settings_v2(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint
) from public,anon;

grant execute on function public.get_my_youth_scouting_v1() to authenticated;
grant execute on function public.run_my_youth_scouting_cycle_v1() to authenticated;
grant execute on function public.submit_youth_recruitment_offer_v1(
  uuid,integer,integer,bigint
) to authenticated;
grant execute on function public.update_my_youth_academy_settings_v2(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint
) to authenticated;
