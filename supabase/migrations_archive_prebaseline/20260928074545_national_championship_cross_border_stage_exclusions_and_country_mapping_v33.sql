update public.race_stages s
set metadata =
      jsonb_set(
        jsonb_set(
          coalesce(s.metadata,'{}'::jsonb),
          '{national_championship_host_eligibility}',
          '"excluded"'::jsonb,
          true
        ),
        '{national_championship_host_exclusion_reason}',
        '"cross_border_stage_confirmed_by_admin"'::jsonb,
        true
      ),
    updated_at=now()
from public.races r
where r.id=s.race_id
  and (
    (r.name='Baltic Link Tour' and s.stage_number=1)
    or (r.name='Swiss Tour' and s.stage_number=4)
    or (r.name='Road to Caucasus Tour' and s.stage_number in (3,6))
    or (r.name='Belgrade - Banja Luka Tour' and s.stage_number=1)
  );

-- Correct stage-level country ownership for the audited pure-country
-- Road to Caucasus stages. Cross-border stages above remain excluded.
update public.race_stages s
set host_country_code=case s.stage_number
      when 1 then 'GE'
      when 2 then 'GE'
      when 4 then 'AM'
      when 5 then 'AM'
      when 7 then 'AZ'
      else s.host_country_code
    end,
    metadata=jsonb_set(
      coalesce(s.metadata,'{}'::jsonb),
      '{national_championship_stage_country_code}',
      to_jsonb(case s.stage_number
        when 1 then 'GE'
        when 2 then 'GE'
        when 4 then 'AM'
        when 5 then 'AM'
        when 7 then 'AZ'
        else coalesce(s.host_country_code,'GE')
      end),
      true
    ),
    updated_at=now()
from public.races r
where r.id=s.race_id
  and r.name='Road to Caucasus Tour'
  and s.stage_number in (1,2,4,5,7);

-- Gibraltar is the explicit admin-approved exception: the route may cross
-- Spain but is still allowed to host Gibraltar's National Championship.
update public.races
set metadata=jsonb_set(
      jsonb_set(
        coalesce(metadata,'{}'::jsonb),
        '{national_championship_host_eligibility}',
        '"allowed"'::jsonb,
        true
      ),
      '{national_championship_host_exception_reason}',
      '"gibraltar_cross_border_route_explicitly_allowed_by_admin"'::jsonb,
      true
    ),
    updated_at=now()
where name='Gibraltar Rock Classic';
