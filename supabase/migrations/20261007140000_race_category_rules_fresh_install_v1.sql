-- Recreate canonical race category rules on a fresh database.
-- Values verified READ-ONLY against the existing ProPeloton Manager catalog.
-- Earlier baseline seeds may omit them; never modify installed category rows.
insert into public.race_category_rules(
  race_class_code,
  display_name,
  race_format,
  target_teams,
  min_teams,
  max_teams,
  min_riders_per_team,
  max_riders_per_team,
  application_open_days_before,
  application_close_days_before,
  prize_fund_min_cash,
  prize_fund_max_cash,
  ranking_points_enabled
)
values
  ('1.1','Class 1.1 One-Day Race','one_day',16,10,20,4,6,90,3,45000,90000,true),
  ('1.2','Class 1.2 One-Day Race','one_day',14,8,18,4,6,90,3,15000,45000,true),
  ('1.HC','HC One-Day Race','one_day',18,12,22,5,7,90,3,100000,200000,true),
  ('1.Pro','Pro One-Day Race','one_day',18,12,22,5,7,90,3,120000,230000,true),
  ('1.UWT','UWT One-Day Race','one_day',22,16,25,6,7,90,3,250000,400000,true),
  ('2.1','Class 2.1 Stage Race','stage_race',14,10,18,5,6,90,3,140000,260000,true),
  ('2.2','Class 2.2 Stage Race','stage_race',12,8,16,4,6,90,3,60000,120000,true),
  ('2.HC','HC Stage Race','stage_race',16,12,20,5,7,90,3,280000,460000,true),
  ('2.Pro','Pro Stage Race','stage_race',16,12,20,5,7,90,3,320000,520000,true),
  ('2.UWT','UWT Stage Race','stage_race',20,16,22,6,8,90,3,900000,1350000,true)
on conflict (race_class_code) do nothing;
