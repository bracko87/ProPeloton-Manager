-- Youth Academy Phase 1 data repair.
-- The first AI seed ran before the exact-age generator fix and a few riders
-- landed as age 11 because random month/day could fall after the current game date.
-- Preserve identity/skills/potential and shift only those riders into the valid 12-16 band.

update public.youth_riders r
set
  birth_date=(r.birth_date - interval '1 year')::date,
  updated_at=now()
where r.status in ('academy','graduating')
  and private.youth_academy_age_v1(r.birth_date)<12;

-- Defensive repair for any pre-V1 data outside the upper Youth Academy age band.
-- Do not silently delete or convert these riders yet; graduation/AI age-out is
-- handled by the dedicated season-transition phase.
update public.youth_riders r
set
  status='graduating',
  updated_at=now()
where r.status='academy'
  and private.youth_academy_age_v1(r.birth_date)>16;
