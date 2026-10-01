-- Election candidate registration uses ON CONFLICT(election_id,user_id);
-- restore the matching uniqueness contract.
alter table public.national_coach_candidates
  add constraint national_coach_candidates_election_user_key
  unique(election_id,user_id);
