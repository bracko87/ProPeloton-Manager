-- Avoid classifying ordinary clubs with "International" in the name
-- as National Teams. The previous naive %%national%% test was a substring match.
create or replace function public.is_national_team_club_v1(p_club_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists(
    select 1 from public.clubs c where c.id=p_club_id
      and (
        c.club_type ~* '(^|[_ -])national([_ -]|$)'
        or c.name ~* '(^|[[:space:]])national([[:space:]]+(cycling[[:space:]]+)?team|$)'
      )
  );
$$;
comment on function public.is_national_team_club_v1(uuid) is
'Only actual national AI pool / technical teams, never International-named ordinary clubs.';
