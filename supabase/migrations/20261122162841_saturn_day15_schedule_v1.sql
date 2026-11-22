-- The private maintenance worker uses real UTC time, including while the game clock is paused.
select cron.schedule('propeloton_saturn_day15_guest_retirement_v1','*/15 * * * *',
  $job$select control_center_private.retire_expired_saturn_test_clubs_v1(false,20);$job$);