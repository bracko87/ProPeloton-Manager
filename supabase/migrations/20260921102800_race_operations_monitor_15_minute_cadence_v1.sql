-- Reduce Race Operations monitoring cadence from 5 minutes / Realtime-style
-- refresh pressure to a 15-minute administrative monitoring interval.
--
-- The race engine calculation workers keep their existing fast schedules.
-- Only the operations monitor and its alert sender are slowed down.

select cron.alter_job(
  job_id := 131,
  schedule := '*/15 * * * *'
);

select cron.alter_job(
  job_id := 132,
  schedule := '2-59/15 * * * *'
);
