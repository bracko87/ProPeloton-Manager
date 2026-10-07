-- Add category-based participation and prize settings to the
-- American Samoa reserve race.
--
-- Tour of Tutuila is Class 2.2. The current race_category_rules row for 2.2 is:
-- target 12 teams, 8-16 allowed, 4-6 riders per team, prize range $60k-$120k.
-- Use the midpoint ($90k) for this reserve edition. Scheduling/application
-- dates stay null until the race is promoted to a real calendar slot.

select public.initialize_race_entry_rules_v1(
  '99b98873-60e6-4643-879d-7d2bd5a9edea'::uuid,
  '2.2',
  null,
  90000
);
