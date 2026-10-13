-- Repeated Youth Academy eligibility calls search youth_race_lineups by
-- youth_rider_id, but existing indexes start with entry_id.
-- Without this reverse index, each candidate can scan thousands of lineup
-- rows for each race, eventually timing out the daily automation.
CREATE INDEX IF NOT EXISTS youth_race_lineups_rider_entry_idx
  ON public.youth_race_lineups (youth_rider_id, entry_id);
