-- Assign the consolidated National-system notification family, plus its
-- historical aliases, to dedicated Core preference groups.

insert into public.notification_preference_groups(
  code,label,description,sort_order,is_active
)
values
  (
    'nationalAssociation',
    'National Association & elections',
    'Show National Association activation, candidature, voting and National Coach status notifications.',
    23,
    true
  ),
  (
    'nationalTeam',
    'National Team & call-ups',
    'Show National Team selection windows, call-ups, squad changes and National Duty notifications.',
    24,
    true
  ),
  (
    'nationalChampionships',
    'Championships & ranking',
    'Show National Championship and World Road Championship participation, qualification, final confirmation and result notifications.',
    25,
    true
  ),
  (
    'worldNations',
    'World Nations & international competitions',
    'Show World Nations draws, race updates and finals.',
    26,
    true
  )
on conflict(code) do update
set
  label=excluded.label,
  description=excluded.description,
  sort_order=excluded.sort_order,
  is_active=true;

update public.notification_types
set preference_group='nationalAssociation'
where code in (
  'NATIONAL_ASSOCIATION_STATUS',
  'NATIONAL_COACH_CANDIDATURE_OPEN',
  'NATIONAL_COACH_VOTING_REQUIRED',
  'NATIONAL_COACH_STATUS_CHANGED',
  'NATIONAL_ASSOCIATION_ACTIVATED',
  'NATIONAL_COACH_ELECTION_OPEN',
  'NATIONAL_COACH_VOTING_OPEN',
  'NATIONAL_COACH_RUNOFF_OPEN',
  'NATIONAL_COACH_ELECTED',
  'NATIONAL_COACH_POSITION_VACANT',
  'NATIONAL_COACH_RESIGNED'
);

update public.notification_types
set preference_group='nationalTeam'
where code in (
  'NATIONAL_TEAM_SELECTION_WINDOW',
  'NATIONAL_TEAM_CALLUP_REQUIRED',
  'NATIONAL_TEAM_SQUAD_UPDATE',
  'NATIONAL_TEAM_DUTY_UPDATE',
  'NATIONAL_TEAM_NEW_SELECTION_WINDOW',
  'NATIONAL_TEAM_CALLUP_RECEIVED',
  'NATIONAL_TEAM_CALLUP_RESPONSE',
  'NATIONAL_TEAM_SQUAD_CONFIRMED',
  'NATIONAL_TEAM_DUTY_STARTED',
  'NATIONAL_TEAM_DUTY_COMPLETED'
);

update public.notification_types
set preference_group='nationalChampionships'
where code in (
  'CHAMPIONSHIP_PARTICIPATION_REQUIRED',
  'CHAMPIONSHIP_QUALIFICATION_UPDATE',
  'CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
  'CHAMPIONSHIP_RESULT',
  'NATIONAL_CHAMPIONSHIP_SELECTED',
  'NATIONAL_CHAMPIONSHIP_QUALIFICATION_RESULT',
  'NATIONAL_CHAMPIONSHIP_QUALIFIED',
  'NATIONAL_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
  'NATIONAL_CHAMPIONSHIP_FINAL_RESULT',
  'NATIONAL_CHAMPION',
  'WORLD_ROAD_CHAMPIONSHIP_INVITATION',
  'WORLD_ROAD_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
  'WORLD_ROAD_CHAMPIONSHIP_RESULT',
  'WORLD_ROAD_CHAMPION'
);

update public.notification_types
set preference_group='worldNations'
where code in (
  'NATIONS_DRAW_NEXT_ROUND',
  'NATIONS_RACE_UPDATE',
  'NATIONS_FINAL_INFO',
  'NATIONS_FINAL_RESULT_MERGED',
  'NATIONS_QUALIFICATION_DRAW',
  'NATIONS_RACE_RESULT',
  'NATIONS_ADVANCED',
  'NATIONS_ELIMINATED',
  'NATIONS_WORLD_FINAL_QUALIFIED',
  'NATIONS_HOST_SELECTED',
  'NATIONS_FINAL_RESULT',
  'NATIONS_CHAMPION'
);
