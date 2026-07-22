/**
 * Manual.tsx
 * Full in-game manual for ProPeloton Manager.
 *
 * - No table of contents.
 * - All sections are closed by default.
 * - Search + category filter.
 * - Deep manual text is stored in manualSections below.
 *
 * EXPANDED VERSION:
 * - Adds detailed sections for all major pages sent by the user.
 * - Includes more rider, staff, training, equipment, race, finance and FAQ topics.
 * - Adds expanded guide paragraphs and rule-by-rule explanations for every opened section.
 */

import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'

type ManualLink = {
  label: string
  to: string
}

type ManualFact = {
  label: string
  value: string
}

type ManualSection = {
  id: string
  category: string
  title: string
  subtitle: string
  overview: string
  facts?: ManualFact[]
  details: string[]
  tips?: string[]
  relatedLinks?: ManualLink[]
}

const manualSections: ManualSection[] = [
  {
    id: 'quick-start',
    category: 'Getting Started',
    title: 'Quick Start for New Managers',
    subtitle: 'The best first steps after creating your club.',
    overview:
      'ProPeloton Manager is a full cycling club management game. You are not only choosing riders for races. You are managing money, staff, equipment, infrastructure, sponsors, training, race applications, race preparation and long-term rankings.',
    facts: [
      { label: 'Start here', value: 'Overview, Squad, Training, Calendar, Race Preparation, Finance' },
      { label: 'Main early danger', value: 'Spending too much before understanding salaries and recurring costs' },
    ],
    details: [
      'Start on Overview. This page shows alerts, club condition, finances, sponsors, upcoming races, news, today’s races and quick actions. If something important needs attention, Overview should usually point you toward it.',
      'Open Squad and learn your riders before buying anyone. Check role, age, country, overall, potential, fatigue, morale, salary, contract and skills. A rider with high overall is not automatically the best rider for every race.',
      'Open Training and set reasonable training. Hard training can help development but can also create fatigue. A tired team will often perform worse even when the riders look strong on paper.',
      'Open Calendar to understand the season. Apply for races that fit your team, but do not overload your riders. A small team can lose performance quickly if the same riders race too often.',
      'Open Race Preparation when your team is accepted for a race. Accepted entry is not enough. You still need a Race Plan and then Stage Plans before the race.',
      'Open Finance before transfers, equipment, infrastructure or training camps. Cash is needed for salaries, staff, tax, equipment, race support, training camps, policies and transfers.',
    ],
    tips: [
      'Use Overview as your daily checklist.',
      'Prepare races early. Do not wait until the final game day.',
      'Do not spend all starting money on transfers before checking wages and recurring costs.',
    ],
    relatedLinks: [
      { label: 'Open Overview', to: '/dashboard/overview' },
      { label: 'Open Squad', to: '/dashboard/squad' },
      { label: 'Open Finance', to: '/dashboard/finance' },
    ],
  },
  {
    id: 'game-time',
    category: 'Getting Started',
    title: 'Game Time and Deadlines',
    subtitle: 'How in-game time works compared with real life.',
    overview:
      'Game time controls race deadlines, training camps, market expiry, finance periods, tax periods and season flow. The footer shows the authoritative live game time from the backend.',
    facts: [
      { label: 'Time scale', value: '1 in-game day = 12 real-life hours' },
      { label: 'Conversion', value: '2 in-game days = 1 real-life day' },
      { label: 'Displayed in', value: 'Dashboard footer and many game-date labels' },
    ],
    details: [
      'One in-game day equals 12 real-life hours. This means two in-game days equal one real-life day.',
      'If a rider submission deadline is two in-game days away, you have around one real-life day. If it is one in-game day away, you have around 12 real-life hours.',
      'Game dates are used for race applications, rider submission deadlines, stage plan locks, training camps, transfer expiry, finance transactions and tax periods.',
      'Real technical timestamps are not the same thing as game time. Some backend rows have created_at for sorting or pagination, but the player-facing date should use stored game-date metadata when available.',
      'Always prepare before the last moment. Missing deadlines can block race plans or leave stage plans incomplete.',
    ],
    tips: ['Check the footer game time before important actions.', 'Use Calendar and Race Preparation together.'],
  },
  {
    id: 'coins',
    category: 'Coins and Account',
    title: 'Coins, Coin Packages and Referral Rewards',
    subtitle: 'The difference between account coins and club cash.',
    overview:
      'Coins are account currency. Club cash is the team economy. Do not confuse coins with in-game cash used for salaries, transfers, equipment and infrastructure.',
    facts: [
      { label: 'Current play cost constant', value: '2 coins per day in the current Pro Packages page' },
      { label: 'Package source', value: 'coin_packages database table' },
      { label: 'Checkout', value: 'create-coin-checkout Edge Function' },
      { label: 'Invite reward', value: '40 coins when a referred friend creates a club and buys their first coin package' },
    ],
    details: [
      'The Pro Packages page loads active coin packages from the database. This means exact package sizes and prices are database-driven and should be trusted from the live shop page.',
      'The page calculates price per coin and can highlight the best value package. Package labels such as Starter boost or Most popular are based on coin amount.',
      'Purchase history is loaded from user_coin_ledger where reason is purchase. Stripe session details are intentionally not displayed to users.',
      'Invite Friends creates a referral link. A referral is completed when the referred user creates a club and buys their first coin package. The current reward text says 40 coins.',
      'Coins are attached to the user/account. If a club is liquidated, the user account and coins remain active; only that club is closed.',
    ],
    tips: ['Use Pro Packages for exact live prices.', 'Use Invite Friends to share your referral link.'],
    relatedLinks: [
      { label: 'Coin Packages', to: '/dashboard/pro-packages' },
      { label: 'Invite Friends', to: '/dashboard/invite-friends' },
    ],
  },
  {
    id: 'club-identity',
    category: 'Club Identity',
    title: 'Club Branding, Logo and Jersey',
    subtitle: 'Team name, colors, logo, jersey and sponsor naming-rights locks.',
    overview:
      'Your club identity includes name, colors, logo and jersey. It is managed through Customize Team, but sponsor naming-rights deals can temporarily lock or change parts of the public display.',
    facts: [
      { label: 'Logo formats', value: 'JPG, PNG, WEBP' },
      { label: 'Logo max size', value: '0.5 MB' },
      { label: 'Jersey formats', value: 'JPG, PNG, WEBP' },
      { label: 'Jersey max size', value: '1 MB and 512 × 512 px or smaller' },
      { label: 'Logo storage', value: 'Uploaded logos are converted to PNG and stored in club-logos' },
    ],
    details: [
      'Customize Team persists branding through backend functions, not only local UI state. This is important because sponsor naming-rights can lock the name or affect the display name.',
      'Logo uploads are validated for type and file size, converted to PNG in-browser and stored in the club-logos bucket.',
      'Removing a logo restores a generated base logo instead of leaving the club without a logo. The base logo uses the team colors.',
      'The jersey system stores a home kit in team_kits. It can use generic pool jerseys, generic fallback, image URLs or uploaded images depending on the selected mode.',
      'A naming-rights sponsor usually pays more, but temporarily changes the displayed team name during the season. The original name returns at the beginning of the next season.',
    ],
    tips: ['Use clear logos that still work at small sizes.', 'Do not accept naming rights only for money; understand the identity effect.'],
    relatedLinks: [{ label: 'Customize Team', to: '/dashboard/customize-team' }],
  },
  {
    id: 'overview',
    category: 'Dashboard',
    title: 'Overview Page',
    subtitle: 'Your daily control room.',
    overview:
      'Overview combines the most important information from the whole club into one dashboard: alerts, KPIs, operations, squad pulse, schedule, race world, finance, emergency debt, news, quick actions and main sponsor.',
    facts: [
      { label: 'Main purpose', value: 'Daily checklist and quick navigation' },
      { label: 'Important finance data', value: 'Balance, operating income/expense, sponsor income, policy cost, trip forecast and debt health' },
      { label: 'Squad Pulse', value: 'Fitness, morale, readiness, form, available riders, injured/sick/not fully fit riders and expiring contracts' },
    ],
    details: [
      'Alerts show what needs attention. If an alert has a link, it usually opens the page where the problem can be fixed.',
      'KPIs give quick numbers, while Operations show active systems such as finance, training, infrastructure, medical, sponsor or inbox events.',
      'Squad Pulse helps you understand whether the team is ready. High fatigue, injuries, sickness or many expiring contracts should be handled quickly.',
      'Race world panels show upcoming schedule, today’s races and news. They help you follow the game world even when your team is not racing.',
      'Finance panels help you avoid dangerous spending. Emergency Debt Health is especially important if rescues were used or liquidation risk exists.',
      'The Main Sponsor panel can show sponsor identity and link into the sponsor dashboard.',
    ],
    tips: ['Open Overview first every login.', 'If Overview shows financial risk, check Finance before spending.'],
    relatedLinks: [{ label: 'Open Overview', to: '/dashboard/overview' }],
  },
  {
    id: 'notifications-inbox',
    category: 'Dashboard',
    title: 'Notifications and Inbox',
    subtitle: 'System alerts, unread/read pages and conversations.',
    overview:
      'Notifications are game/admin alerts. Inbox is for direct or admin conversations. Together they help users avoid missed deadlines and communicate with other managers or admins.',
    facts: [
      { label: 'Notification tabs', value: 'Unread and Read' },
      { label: 'Notification tools', value: 'Search, category filter, pagination, action links' },
      { label: 'Inbox thread types', value: 'Direct and admin direct' },
    ],
    details: [
      'Notifications can be searched by title, message, type, source, preference group or creation time.',
      'Categories are resolved from preference group, source or type code. This helps separate finance, race, sponsor, transfer and system messages.',
      'Notification preferences can control which notification types the user receives.',
      'Inbox lists conversations, unread counts, last message preview and whether the conversation can be replied to.',
      'Opening a conversation loads messages and marks it as read. Sending a message uses inbox RPCs.',
    ],
    tips: ['Check unread notifications before race deadlines.', 'Use Inbox for conversations, Notifications for system/game alerts.'],
    relatedLinks: [
      { label: 'Notifications', to: '/dashboard/notifications' },
      { label: 'Inbox', to: '/dashboard/inbox' },
      { label: 'Preferences', to: '/dashboard/preferences' },
    ],
  },
  {
    id: 'squad-riders',
    category: 'Riders',
    title: 'Squad, First Team and Rider List Views',
    subtitle: 'How to understand your roster.',
    overview:
      'Squad is where you manage and inspect your First Team riders. It includes different views for general roster data, finances, skills and form/development.',
    facts: [
      { label: 'First Squad max in UI', value: '18 riders' },
      { label: 'List views', value: 'General, Financial, Skills, Form & Development' },
      { label: 'Common rider data', value: 'Country, role, age, overall, fatigue, status, market value, salary, contract, skills, morale and potential' },
    ],
    details: [
      'General View gives the fastest overview of your roster. Use it for everyday checks.',
      'Financial View shows salary, market value and contract information. Use it before renewing, releasing or selling riders.',
      'Skills View shows specialist attributes. Use it before race selection because a climber, sprinter and time-trial rider need different skills.',
      'Form & Development shows readiness data such as fatigue, morale, potential and availability.',
      'The squad dashboard can also show wins, podiums, top 10s, best GC, last race rows, next race selection and race-type snapshots.',
    ],
    tips: ['Do not judge riders only by overall.', 'Check contracts before the end of the season.', 'Open rider profiles for deeper decisions.'],
    relatedLinks: [{ label: 'Open Squad', to: '/dashboard/squad' }],
  },
  {
    id: 'rider-profile-skills',
    category: 'Riders',
    title: 'Rider Profile, Skills, Fitness and Race Sharpness',
    subtitle: 'Why rider quality is more than overall.',
    overview:
      'Rider profiles show identity, attributes, contract, training, comparison and history. A rider’s real race value depends on skill mix, fitness, morale, fatigue, health and race sharpness.',
    facts: [
      { label: 'Own rider tabs', value: 'Overview, Contract, Training, Compare, History' },
      { label: 'Core attributes', value: 'Overall, potential, sprint, climbing, time trial, endurance, flat, recovery, resistance, race IQ, teamwork' },
      { label: 'Availability statuses', value: 'Fit, not fully fit, injured, sick' },
    ],
    details: [
      'Overall is a broad summary. It is useful, but exact attributes decide race role. Sprint matters in bunch finishes. Climbing matters on mountains. Time Trial matters in TT stages. Recovery is important in stage races.',
      'Fatigue represents tiredness and accumulated stress. High fatigue can make strong riders underperform or become risky to select.',
      'Morale affects confidence and can influence performance. Low morale should not be ignored.',
      'Race sharpness measures racing rhythm. Too little racing can reduce sharpness, but too much racing creates overload risk.',
      'Rider comparison shows two riders side by side with attributes such as sprint, climbing, time trial, endurance, flat, recovery, resistance, race IQ and teamwork.',
      'External rider profiles can hide exact information unless scouted. Scouting reports improve precision.',
    ],
    tips: ['For sprints, check sprint, flat, endurance and teamwork.', 'For mountains, check climbing, endurance, resistance and recovery.', 'Use compare before transfer decisions.'],
  },
  {
    id: 'developing-team',
    category: 'Riders',
    title: 'Developing Team',
    subtitle: 'U23/development structure, purchase and movement windows.',
    overview:
      'The Developing Team is a second team connected to the main club. It is used for young or secondary riders and has its own roster limit and movement-window rules.',
    facts: [
      { label: 'Developing Team max in UI', value: '8 riders' },
      { label: 'Purchase location', value: 'Preferences page' },
      { label: 'Movement rule', value: 'Riders can move only when the movement window is open' },
      { label: 'Age warning', value: 'Riders aged 24+ require attention' },
    ],
    details: [
      'Preferences loads Developing Team status from the backend. It shows real days played, game days played, coin balance, coin cost, requirement status, movement-window state and whether purchase is allowed.',
      'After purchase, the app pins the active club back to the main club so the dashboard does not accidentally switch to the developing club.',
      'Developing Team riders can be moved to the First Squad only if the movement window is open and the First Squad has space.',
      'If a Developing Team rider is 24 or older, the UI can show an action warning. If the movement window is open, action is required now; otherwise the rider must move next window.',
    ],
    tips: ['Use Developing Team for future talent.', 'Keep a First Squad slot open if you plan to promote a rider.'],
    relatedLinks: [
      { label: 'Preferences', to: '/dashboard/preferences' },
      { label: 'Squad', to: '/dashboard/squad' },
    ],
  },
  {
    id: 'staff',
    category: 'Riders',
    title: 'Staff, Staff Roles and Staff Courses',
    subtitle: 'How staff support your club.',
    overview:
      'Staff improve training, recovery, scouting, mechanics, race support and operations. Staff roles have capacity limits that are often connected to infrastructure.',
    facts: [
      { label: 'Roles', value: 'Head Coach, Trainer, U23 Head Coach, Team Doctor, Physio, Nutritionist, Mechanic, Sport Director, Scout / Analyst' },
      { label: 'Staff stats', value: 'Expertise, experience, potential, leadership, efficiency, loyalty' },
      { label: 'Courses', value: 'Can improve staff attributes over game days and cost cash' },
    ],
    details: [
      'Head Coach and Trainers support regular training, training camps and rider development.',
      'Team Doctor, Physio and Nutritionist support health, recovery, fatigue and medical handling.',
      'Mechanic supports equipment maintenance and technical systems.',
      'Sport Director supports race preparation, tactics and stage-plan suggestions.',
      'Scout / Analyst supports scouting reports and market knowledge.',
      'Staff courses can be active or recently completed, with duration days, cost and attribute gains.',
      'Staff contract extensions can include current salary, requested salary, minimum acceptable salary, interest score, willingness and decision reasons.',
    ],
    tips: ['Hire staff based on club weakness.', 'Upgrade infrastructure if staff capacity is blocked.'],
    relatedLinks: [
      { label: 'Staff Market', to: '/dashboard/transfers?tab=staff' },
      { label: 'Infrastructure', to: '/dashboard/infrastructure' },
    ],
  },
  {
    id: 'training',
    category: 'Training',
    title: 'Regular Training and Training Camps',
    subtitle: 'Improve riders without destroying freshness.',
    overview:
      'Training controls rider development and fatigue. Regular training is ongoing. Training camps are stronger, more expensive blocks with location, weather, riders and staff.',
    facts: [
      { label: 'Training tabs', value: 'Regular and Camps' },
      { label: 'Regular intensities', value: 'Recovery, light, normal, hard' },
      { label: 'Camp types', value: 'General, sprint, climbing, flat, time trial' },
      { label: 'Camp plan intensities', value: 'Day off, light, normal, hard' },
    ],
    details: [
      'Regular training can use team defaults and individual rider plans. Focus areas include general, recovery, sprint, climbing, flat, time trial, endurance, resistance, race IQ and teamwork.',
      'Hard training can create more gains but also more fatigue and risk. Recovery training is useful after hard races or stage races.',
      'Training camps include location, region, camp type, terrain profile, altitude, stars, cost index, quality multiplier, recovery comfort, preferred weeks, risky weeks and closed weeks.',
      'Camp quotes can include travel, accommodation, camp fee, logistics, total cost, per-rider cost, weather state, training modifier, missed-day chance and warnings.',
      'Current camp pages show participants, staff, weather, staff boost summaries, daily reports and training plans for upcoming camp days.',
    ],
    tips: ['Do not train everyone hard all the time.', 'Match training to race calendar and rider role.', 'Check camp cost before booking.'],
    relatedLinks: [{ label: 'Open Training', to: '/dashboard/training' }],
  },
  {
    id: 'equipment',
    category: 'Equipment',
    title: 'Equipment, Setups, Inventory and Market',
    subtitle: 'Durable race gear and performance bonuses.',
    overview:
      'Equipment controls race setups, owned gear, market purchases, maintenance and technical sponsor support. Good equipment can improve terrain performance and reduce fatigue.',
    facts: [
      { label: 'Equipment tabs', value: 'Overview, Inventory, Market, Race Supplies' },
      { label: 'Durable categories', value: 'Frame, wheelset, tires, groupset, helmet, shoes' },
      { label: 'Bonus types', value: 'Flat, hilly, mountain, cobble, time trial, sprint, fatigue reduction' },
      { label: 'Quality labels', value: 'Basic, Good, Super' },
    ],
    details: [
      'Overview shows readiness, category summaries, default setup, setup presets, race supplies and technical sponsor support.',
      'Default Race Setup is used when no specific setup is chosen. Setup presets allow specialized setups for sprint, mountain, time trial or cobbled races.',
      'Inventory shows active owned equipment. Sold and discarded items are hidden from active inventory.',
      'Equipment statuses include ready, assigned, in maintenance and worn. Ready and worn items can usually be repaired/sold/discarded, while assigned items are restricted.',
      'Repair is generally available when condition is 90% or lower and the item can run actions.',
      'Market shows items with category, quality, terrain role, bonuses, sponsor discounts and buy action. Technical sponsor discounts can reduce purchase cost.',
    ],
    tips: ['Create setups for different race types.', 'Repair important equipment before key races.', 'Check sponsor discounts before buying.'],
    relatedLinks: [{ label: 'Open Equipment', to: '/dashboard/equipment' }],
  },
  {
    id: 'race-supplies',
    category: 'Equipment',
    title: 'Race Supplies',
    subtitle: 'Consumables and durable stage-plan supplies.',
    overview:
      'Race Supplies are used by Race Preparation and Stage Plans. Some supplies are consumed every stage, while jerseys and rain jackets are durable reusable items with stage-use limits.',
    facts: [
      { label: 'Consumables', value: 'Bidons / Water Bottles, Energy Gels, Nutrition Packs' },
      { label: 'Durable supplies', value: 'Race Jersey Complete, Rain Jackets' },
      { label: 'Race Jersey Complete', value: 'Mandatory; 10 stage uses per unit' },
      { label: 'Rain Jackets', value: 'Optional weather item; 25 stage uses per unit' },
    ],
    details: [
      'Bidons use 1–4 per rider in stage setup. They are one-use consumables and support hydration and fatigue control. Below minimum can increase fatigue risk.',
      'Energy Gels use 0–4 per rider. They support stamina and final effort efficiency. There is no extra benefit after four gels per rider.',
      'Nutrition Packs use 0–2 per rider. They support stamina stability and post-stage recovery. Long stages without nutrition can increase fatigue pressure.',
      'Race Jersey Complete is mandatory in Stage Plans. Missing jersey kits can block stage setup.',
      'Rain Jackets are optional but valuable in wet/cold weather. Worn-out durable supplies are no longer usable.',
      'Stage races consume supplies quickly because quantities are used per rider per stage.',
    ],
    tips: ['Buy supplies before deadlines.', 'Check stock before stage races.', 'Use rain jackets for bad-weather stages.'],
    relatedLinks: [{ label: 'Race Supplies', to: '/dashboard/equipment?tab=race-supplies' }],
  },
  {
    id: 'infrastructure',
    category: 'Infrastructure',
    title: 'Infrastructure Facilities and Assets',
    subtitle: 'Long-term club buildings, staff capacity and support vehicles.',
    overview:
      'Infrastructure is your long-term development system. Facilities unlock staff capacity and improve training, health, scouting and mechanics. Assets provide vehicles and support resources for races and operations.',
    facts: [
      { label: 'Facilities', value: 'Club House, Training Center, Medical Center, Youth Academy, Mechanics Workshop, Scouting Office' },
      { label: 'Facility max levels', value: 'Club House 5, Training Center 5, Medical Center 5, Youth Academy 2, Mechanics Workshop 4, Scouting Office 4' },
      { label: 'Assets', value: 'Team Cars, Team Bus, Equipment Van, Mobile Workshop, Medical Van' },
    ],
    details: [
      'Club House is the main administrative headquarters. It supports organization and future management systems.',
      'Training Center improves coaching effectiveness, training quality, development support and overload-risk management.',
      'Medical Center supports Team Doctors, Physios and Nutritionists and improves injury prevention/recovery support.',
      'Youth Academy supports future riders and U23 development and can unlock U23 Head Coach systems.',
      'Mechanics Workshop improves repairs, technical support and mechanic capacity.',
      'Scouting Office improves scouting report quality cap, scouting capacity and market intelligence.',
      'Infrastructure jobs cost cash and take game days. Active jobs show duration, completion date, paid cost and construction slots.',
      'Jobs and assets can have cancellation, repair or sale quotes. Quotes show refund/cost/value and whether the action is allowed.',
      'Assets have condition and status. Assigned or locked assets cannot be repaired or sold until free.',
    ],
    tips: ['Upgrade based on your bottleneck.', 'Do not start too many expensive jobs at once.', 'Keep race assets repaired.'],
    relatedLinks: [{ label: 'Open Infrastructure', to: '/dashboard/infrastructure' }],
  },
  {
    id: 'calendar-race-detail',
    category: 'Calendar and Races',
    title: 'Calendar, Race Applications and Race Detail',
    subtitle: 'Find races, apply, inspect profiles and follow results.',
    overview:
      'Calendar shows the season and race opportunities. Race Detail shows the full profile, stages, participants, results, classifications and replay information for a race.',
    facts: [
      { label: 'Calendar views', value: 'Season and Races' },
      { label: 'Season filters', value: 'Races, Training Camps, Events, Holidays' },
      { label: 'Race statuses', value: 'Not open, open, closed, race active, race finished, cancelled' },
      { label: 'Classifications', value: 'General, points, mountain, young, team' },
    ],
    details: [
      'Season Calendar shows a day-by-day view of races, camps, events and holidays.',
      'Race Calendar shows race cards with category, country, city, date, race type, team limits, accepted teams and application status.',
      'Race applications depend on open/close dates. If applications are closed, your team cannot apply anymore.',
      'Race Detail shows entry rules such as team limits, rider limits, application deadline, team list announcement, rider submission deadline and prize fund.',
      'Stage details can include route, distance, terrain, finish type, summit finish, terrain percentages, elevation gain, profile image, weather, sprints and KOM points.',
      'After a race starts, Race Detail can show live state, replay frames, commentary, standings, results and classifications.',
    ],
    tips: ['Apply to races that fit your team.', 'Inspect stage profiles before race preparation.', 'Check weather close to race day.'],
    relatedLinks: [{ label: 'Open Calendar', to: '/dashboard/calendar' }],
  },
  {
    id: 'race-preparation',
    category: 'Calendar and Races',
    title: 'Race Preparation and Stage Plans',
    subtitle: 'Accepted races, Race Plan, Stage Plans and readiness.',
    overview:
      'Race Preparation turns an accepted race into a real plan. It is one of the most important pages in the game because the race engine depends on rider selection, staff, assets, equipment, supplies and stage tactics.',
    facts: [
      { label: 'Tabs', value: 'Accepted Races, Race Plan, Stage Plans' },
      { label: 'Race staff', value: 'Sport Director, Team Doctor, Physio, Mechanic' },
      { label: 'Race assets', value: 'Team Bus, Equipment Van, Mobile Workshop, Medical Van, Team Car 1–3' },
      { label: 'Stage readiness tones', value: 'Green, yellow, orange, red, gray' },
    ],
    details: [
      'Accepted Races shows races where your team was accepted and what preparation status each race has.',
      'Race Plan selects riders, staff, assets, equipment setup and race supplies. Rider limits must match race rules.',
      'Blocked riders or assets may already be assigned to overlapping events. This prevents impossible schedules.',
      'Quote preview shows costs and support bonuses from staff, assets, equipment and policies.',
      'After Race Plan is submitted, Stage Plans open. Stage Plans set rider roles, team tactics, individual tactics, equipment and supplies for each stage.',
      'Stage plan readiness tracks saved plans, usable plans, missing plans, empty plans, missing supplies, tactical completeness and recommended action.',
      'Sport Director suggestions can help with equipment, team tactics, individual tactics and supplies, but they are guidance, not guaranteed perfect plans.',
    ],
    tips: ['Prepare before deadlines.', 'Use different plans for different stage types.', 'Do not ignore supplies and weather.'],
    relatedLinks: [{ label: 'Open Race Preparation', to: '/dashboard/race-preparation' }],
  },
  {
    id: 'team-ranking',
    category: 'Rankings and Statistics',
    title: 'Team Ranking, Tiers, Divisions and Playoffs',
    subtitle: 'Promotion, relegation and standings structure.',
    overview:
      'Team Ranking shows your place in the cycling world. Teams earn international points from race results. Final standings can decide promotion, playoffs and relegation.',
    facts: [
      { label: 'Tiers', value: 'WorldTeam, ProTeam, Continental, Amateur' },
      { label: 'Pro divisions', value: 'ProTeam West, ProTeam East' },
      { label: 'Continental divisions', value: 'Europe, America, Asia, Africa, Oceania' },
      { label: 'Amateur divisions', value: 'North America, South America, Western Europe, Central Europe, Southern & Balkan Europe, Northern & Eastern Europe, West & North Africa, Central & South Africa, West & Central Asia, South Asia, East & Southeast Asia, Oceania' },
    ],
    details: [
      'WorldTeam is the top standing. The UI shows bottom five relegated.',
      'ProTeam West and ProTeam East each show winner promoted directly, 2nd–4th enter World playoff and bottom five relegated.',
      'Continental Europe and America feed Pro West playoff. Continental Asia, Africa and Oceania feed Pro East playoff.',
      'Continental Europe and Asia show bottom six relegated. Continental America and Africa show bottom five relegated. Continental Oceania shows bottom three relegated.',
      'Amateur Oceania shows top three promoted directly. European Amateur divisions show winner promoted directly and 2nd–3rd enter promotion playoff. Other Amateur divisions show winner promoted directly and 2nd–4th enter promotion playoff.',
      'Inactive managers can stay visible in standings/results. The UI can show an Inactive manager badge for inactive and season-end-removal-pending teams.',
    ],
    tips: ['Use ranking as your long-term target.', 'Consistent points can be better than one lucky result.'],
    relatedLinks: [{ label: 'Open Team Ranking', to: '/dashboard/team-ranking' }],
  },
  {
    id: 'statistics-team-profile',
    category: 'Rankings and Statistics',
    title: 'Statistics and Team Profiles',
    subtitle: 'Compare teams, riders and public club information.',
    overview:
      'Statistics helps identify strong teams and riders. Team Profiles show public information about user and AI clubs.',
    facts: [
      { label: 'Statistics tabs', value: 'Teams and Riders' },
      { label: 'Team sub-tabs', value: 'Current and History' },
      { label: 'Rider sub-tabs', value: 'Rankings and Breakdown' },
      { label: 'Rider metrics', value: 'Overall season points, sprint points, climbing points' },
    ],
    details: [
      'Team Current shows active/current team performance by tier, division and points.',
      'Team History shows previous winners and snapshots once multiple seasons exist.',
      'Rider Rankings show best riders by points and can include role, country, age, club, market value, salary, fatigue and availability.',
      'Rider Breakdown helps find specialists, such as sprinters or climbers.',
      'Team Profile shows logo, country, tier, division, sponsors, kit preview, public roster, points summary and recent races.',
      'Team Profile can include a report button for moderation when needed.',
    ],
    tips: ['Use Statistics before buying riders.', 'Use Team Profiles to study rivals.'],
    relatedLinks: [
      { label: 'Open Statistics', to: '/dashboard/statistics' },
      { label: 'Open Team Ranking', to: '/dashboard/team-ranking' },
    ],
  },
  {
    id: 'transfers-scouting',
    category: 'Transfers',
    title: 'Transfers, Free Agents, Negotiations and Scouting',
    subtitle: 'How to sign riders and understand the market.',
    overview:
      'Transfers is where you improve the roster through transfer-listed riders, free agents, scouting reports and staff hiring.',
    facts: [
      { label: 'Transfer tabs', value: 'Riders and Staff' },
      { label: 'Rider sub-tabs', value: 'Transfer List and Free Agents' },
      { label: 'Negotiation statuses', value: 'Draft, open, pending, accepted, rejected, expired, declined, completed, countered' },
      { label: 'Contract years in transfer negotiation UI', value: '1–5 years' },
      { label: 'Scouting filters', value: 'All, New, Reviewed' },
    ],
    details: [
      'Transfer-listed riders belong to another team. You first make a transfer offer to the selling club. If accepted, you negotiate the rider contract.',
      'Free agents do not have a selling club. You negotiate directly with the rider.',
      'Negotiation previews can show acceptance percent, acceptance band, predicted outcome, salary score, duration score, bonus score, fee score, tier score and hard-block reasons.',
      'Repeated poor offers can use attempts and may lead to rejection, countering, expiry or closure.',
      'Scouting reduces uncertainty. External rider profiles can hide exact data until a scout report exists.',
      'Scout reports show rider, scout, completion date, overall, potential, strengths, notes and New/Reviewed status.',
    ],
    tips: ['Scout expensive riders before bidding.', 'Check salary and duration, not only transfer price.', 'Do not buy riders who do not fit your race calendar.'],
    relatedLinks: [
      { label: 'Open Transfers', to: '/dashboard/transfers' },
      { label: 'Open Scouting', to: '/dashboard/scouting' },
    ],
  },
  {
    id: 'finance',
    category: 'Finance',
    title: 'Finance Overview, Transactions and Taxes',
    subtitle: 'Balance, operating cashflow, statement rows and monthly tax audits.',
    overview:
      'Finance shows the long-term safety of your club. Strong riders do not matter if the club cannot pay salaries, taxes, policies, equipment or mandatory obligations.',
    facts: [
      { label: 'Finance tabs', value: 'Overview, Sponsors, Transactions, Tax, Team Policies & Operations' },
      { label: 'Cashflow grouping', value: 'Daily, weekly, monthly' },
      { label: 'Recent transactions', value: 'Last 30 game days' },
      { label: 'Archive transactions', value: 'Older rows grouped by in-game month, previous 6 game months' },
      { label: 'Tax audit statuses', value: 'OK, adjusted, refunded' },
    ],
    details: [
      'Finance Overview separates real operating income/expenses from debt movement. Emergency loan disbursement is not operating income. Emergency loan principal repayment is not operating expense. Emergency loan interest is operating expense.',
      'Transactions show the ledger. Use them to explain every balance movement: salaries, sponsor payments, tax, infrastructure, assets, equipment, training camps, bonuses and prize money.',
      'Visible transaction dates should come from in-game date metadata, not real created_at timestamps.',
      'Tax shows taxable income, expected tax, already withheld, adjustment amount and audit history. Tax rows include withholding, monthly adjustment and monthly refund.',
      'If the club earns large sponsor or prize income, check the Tax tab for withholding and monthly audit results.',
    ],
    tips: ['Open Finance before big spending.', 'Use Transactions when balance changes unexpectedly.', 'Do not treat emergency loan money as profit.'],
    relatedLinks: [{ label: 'Open Finance', to: '/dashboard/finance' }],
  },
  {
    id: 'sponsors-policies',
    category: 'Finance',
    title: 'Sponsors, Technical Sponsors and Team Policies',
    subtitle: 'Guaranteed money, objectives, discounts, naming rights and operating standards.',
    overview:
      'Sponsors bring income and objectives. Team policies define travel, accommodation, housing, nutrition, recovery and bonuses. Both can improve the club but both can also create obligations or costs.',
    facts: [
      { label: 'Sponsor kinds', value: 'Main, secondary, technical' },
      { label: 'Main sponsor objectives', value: 'Race start, win, podium, top 5, top 10, GC top 10/top 5, stage top 5, stage win, classification visibility' },
      { label: 'Policy operations', value: 'Flights, accommodation, ground transport, logistics, staff travel accommodation' },
      { label: 'Team policies', value: 'Housing, nutrition, recovery, staff equipment, rider bonus, staff bonus' },
    ],
    details: [
      'Main sponsors are the most visible. They can provide guaranteed money, bonus pools and objectives.',
      'Secondary sponsors provide additional support through slots and are shown without logos/country in the current UI.',
      'Technical sponsors can provide cash support, equipment support budget and category equipment discounts.',
      'Sponsor objectives can be scheduled, checked, achieved, missed or paid. They can link to target races or calendar views.',
      'Standard sponsor contracts give money without changing the team name. Naming-rights contracts usually pay more but temporarily change the team display name during the season.',
      'Team Policies and Operations affect recurring and trip costs. Better travel, housing, nutrition or recovery policies can help the club but increase spending.',
      'Policy estimates show weekly and monthly totals, last month actual costs and upcoming trip forecasts.',
    ],
    tips: ['Check sponsor objectives before accepting offers.', 'Technical sponsors are valuable if buying equipment.', 'Do not upgrade policies if the club cannot afford recurring costs.'],
    relatedLinks: [
      { label: 'Sponsors', to: '/dashboard/finance?tab=sponsors' },
      { label: 'Team Policies', to: '/dashboard/finance?tab=teamPoliciesOperations' },
    ],
  },
  {
    id: 'emergency-liquidation',
    category: 'Finance',
    title: 'Emergency Rescues, Debt and Club Liquidation',
    subtitle: 'What happens when a club cannot pay mandatory obligations.',
    overview:
      'The game has a rescue and liquidation system. Emergency rescue protects a club temporarily, but repeated failure to cover obligations can close the club.',
    facts: [
      { label: 'Lifetime rescues', value: '3' },
      { label: 'Liquidation condition shown in UI', value: 'All 3 rescues used, then another mandatory obligation cannot be covered' },
      { label: 'After liquidation', value: 'The club can no longer perform game actions' },
      { label: 'Coins/account', value: 'User account and coins remain active' },
    ],
    details: [
      'If a club is liquidated, the dashboard is replaced by a Club Liquidated screen.',
      'The screen explains rescue count, liquidation reason and closure time when available.',
      'Create new club clears stored club IDs and sends the user to club creation.',
      'Restart team is currently a placeholder/notice. The future version would reset the liquidated club in the same competition with a fresh squad, no staff and zero points.',
      'Emergency debt appears in Overview and Finance. Principal and interest should be read separately.',
    ],
    tips: ['Avoid risky spending after rescues are used.', 'Watch mandatory costs such as salaries, taxes and policies.'],
  },
  {
    id: 'support-account',
    category: 'Support and Account',
    title: 'Profile, Preferences, Contact, Forum and Bug Reports',
    subtitle: 'Account settings, notification settings and support channels.',
    overview:
      'Account and support pages help users manage profile data, notification preferences, developing-team purchase, invite links, Discord support and bug reports.',
    facts: [
      { label: 'Profile username rule', value: '3–24 characters, spaces become underscores, only letters/numbers/underscore' },
      { label: 'Birthday rule', value: 'Saved once during registration and read-only later' },
      { label: 'Shutdown confirmation', value: 'Type DELETE exactly' },
      { label: 'Contact Us', value: 'Current form is UI-only and shows a thank-you message' },
      { label: 'Forum', value: 'Community discussions move to Discord' },
    ],
    details: [
      'My Profile edits user profile data such as username, email, first name, last name, city and country. It is separate from club branding.',
      'Preferences stores notification settings and includes Developing Team purchase/status and Danger Zone actions.',
      'Shutdown Team requires a valid session token and exact DELETE confirmation.',
      'Contact Us currently shows a form and thank-you message, but backend submission still needs to be connected for production.',
      'Forum is a Discord notice page. Community discussions, questions and manual help should go to Discord.',
      'Bug report buttons should include current page/path context. Good reports include page name, team, rider, race, screenshots and reproduction steps.',
    ],
    tips: ['Use Contact Us for support details.', 'Use Discord for community help.', 'Never post sensitive account/payment data publicly.'],
    relatedLinks: [
      { label: 'My Profile', to: '/dashboard/my-profile' },
      { label: 'Preferences', to: '/dashboard/preferences' },
      { label: 'Contact Us', to: '/dashboard/contact-us' },
      { label: 'Forum', to: '/dashboard/forum' },
    ],
  },,

  {
    "id": "public-home-beta",
    "category": "Getting Started",
    "title": "Public Home and Beta Notice",
    "subtitle": "What players see before login and why the beta notice matters.",
    "overview": "The public home page is the entry point before the dashboard. It can route authenticated users to create-club or dashboard and shows live public game information.",
    "facts": [
      {
        "label": "Live snapshot",
        "value": "Game time, active managers, total teams, races and stages"
      },
      {
        "label": "Beta warning",
        "value": "Game systems, UI, balancing and data may still change"
      }
    ],
    "details": [
      "If the user is signed in and has no club, the app routes to club creation.",
      "If the user is signed in and already has a club, the app routes to the dashboard overview.",
      "The beta notice tells testers that the game is online for testing but not final.",
      "Homepage race-day widgets can show yesterday, today and tomorrow races."
    ],
    "tips": [
      "Keep player expectations clear during beta."
    ]
  },
  {
    "id": "sidebar-footer-layout",
    "category": "Getting Started",
    "title": "Sidebar, Footer and Dashboard Lock",
    "subtitle": "How the main layout helps users move around the game.",
    "overview": "The left sidebar is the main in-game navigation, while the footer shows authoritative live game time. Some dashboard states can lock interaction.",
    "facts": [
      {
        "label": "Sidebar pages",
        "value": "Overview, Squad, Calendar, Race Preparation, Team Ranking, Training, Equipment, Infrastructure, Finance, Transfers, Statistics"
      },
      {
        "label": "Footer",
        "value": "Shows Season, weekday, date and time"
      }
    ],
    "details": [
      "The sidebar descriptions tell users what each page does.",
      "The footer game time should be treated as the source of truth for deadlines.",
      "Dashboard Locked means the player cannot make changes at that time.",
      "Sign Out and Bug Report live in the lower sidebar area."
    ],
    "tips": [
      "When a user is confused about deadlines, first tell them to check footer game time."
    ]
  },
  {
    "id": "profile-settings",
    "category": "Coins and Account",
    "title": "My Profile",
    "subtitle": "User profile data, username, email and password.",
    "overview": "My Profile edits the user account profile. It is separate from the team name, team logo and jersey.",
    "facts": [
      {
        "label": "Username rule",
        "value": "3–24 characters; letters, numbers and underscores"
      },
      {
        "label": "Birthday rule",
        "value": "Saved once during registration and read-only later"
      }
    ],
    "details": [
      "The username is normalized by trimming spaces, changing spaces to underscores and removing unsupported characters.",
      "Email changes use the auth system and may require confirmation.",
      "First name, last name, city and country are optional profile fields.",
      "Password can be changed from the profile page with confirmation.",
      "Birthday is displayed but not saved again from My Profile."
    ],
    "tips": [
      "Tell users that profile display name and club name are different."
    ],
    "relatedLinks": [
      {
        "label": "My Profile",
        "to": "/dashboard/my-profile"
      }
    ]
  },
  {
    "id": "preferences-notifications",
    "category": "Coins and Account",
    "title": "Preferences and Notification Settings",
    "subtitle": "Where players control notifications and special team/account options.",
    "overview": "Preferences stores notification controls, Developing Team purchase/status and danger zone actions.",
    "facts": [
      {
        "label": "Notification storage",
        "value": "Local preference settings"
      },
      {
        "label": "Developing team RPCs",
        "value": "get_developing_team_status and purchase_developing_team"
      },
      {
        "label": "Shutdown confirm",
        "value": "User must type DELETE"
      }
    ],
    "details": [
      "Notification toggles decide which notification groups the player wants to receive.",
      "Developing Team status shows requirements, coin cost, balance and movement-window information.",
      "After Developing Team purchase, the active club context is pinned back to the main club.",
      "Shutdown Team uses a backend Edge Function and requires the active session token.",
      "Restart Team is currently a placeholder/action notice and should not be described as fully active."
    ],
    "tips": [
      "Use Preferences when users complain about too many notifications."
    ],
    "relatedLinks": [
      {
        "label": "Preferences",
        "to": "/dashboard/preferences"
      }
    ]
  },
  {
    "id": "invite-friends",
    "category": "Coins and Account",
    "title": "Invite Friends",
    "subtitle": "Referral link, referral states and coin reward.",
    "overview": "Invite Friends creates a referral link and shows referral activity. The reward is granted when a friend completes the required steps.",
    "facts": [
      {
        "label": "Referral URL",
        "value": "/#/referral/:code"
      },
      {
        "label": "Reward",
        "value": "40 coins"
      },
      {
        "label": "Statuses",
        "value": "Pending, completed, rejected"
      }
    ],
    "details": [
      "The page loads the current club referral code from the clubs table.",
      "The referral link uses the current website origin plus the referral route.",
      "Pending means a friend created a club but has not bought the first coin package yet.",
      "Completed means the first coin purchase happened and the reward was granted.",
      "User and club identifiers are masked for privacy."
    ],
    "tips": [
      "Use Invite Friends to grow the community."
    ],
    "relatedLinks": [
      {
        "label": "Invite Friends",
        "to": "/dashboard/invite-friends"
      }
    ]
  },
  {
    "id": "pro-packages-deep",
    "category": "Coins and Account",
    "title": "Coin Packages Shop",
    "subtitle": "Package prices, checkout and purchase history.",
    "overview": "Coin Packages loads live packages from the database, shows balance and starts checkout through an Edge Function.",
    "facts": [
      {
        "label": "Package source",
        "value": "coin_packages"
      },
      {
        "label": "Balance source",
        "value": "get_my_coin_status"
      },
      {
        "label": "Checkout",
        "value": "create-coin-checkout"
      },
      {
        "label": "Purchase history",
        "value": "user_coin_ledger reason='purchase'"
      }
    ],
    "details": [
      "Exact prices are database-driven and should not be hardcoded in the manual.",
      "The shop calculates price per coin and can highlight best value.",
      "Package taglines are generated from coin amount, such as Starter boost or Best for long-term play.",
      "Purchase history intentionally does not show Stripe session technical information.",
      "Coins are account currency, not club cash."
    ],
    "tips": [
      "For current prices, trust the live Coin Packages page."
    ],
    "relatedLinks": [
      {
        "label": "Coin Packages",
        "to": "/dashboard/pro-packages"
      }
    ]
  },
  {
    "id": "contact-forum-support",
    "category": "Support and Account",
    "title": "Contact Us, Forum and Discord",
    "subtitle": "Where players ask questions or report problems.",
    "overview": "Contact Us, Forum and Discord are support/community entry points. Current Contact Us is UI-only; Forum points users to Discord.",
    "facts": [
      {
        "label": "Contact Us",
        "value": "UI-only form in current code"
      },
      {
        "label": "Forum",
        "value": "Discord notice page"
      },
      {
        "label": "Discord use",
        "value": "Community, help, manuals and questions"
      }
    ],
    "details": [
      "Contact Us has name, email and message fields and shows a thank-you message after submit.",
      "Forum explains there will not be an in-game forum on that page.",
      "Discord is the community place for questions and manual help.",
      "Bug reports should include page, expected behavior, actual behavior and screenshots."
    ],
    "tips": [
      "Do not promise Contact Us backend delivery until it is wired."
    ],
    "relatedLinks": [
      {
        "label": "Contact Us",
        "to": "/dashboard/contact-us"
      },
      {
        "label": "Forum",
        "to": "/dashboard/forum"
      }
    ]
  },
  {
    "id": "club-creation-route",
    "category": "Club Identity",
    "title": "Club Creation and First Club Check",
    "subtitle": "How authenticated users are routed into the game.",
    "overview": "After login, the app checks whether the user has a club. Users without a club go to Create Club; users with a club go to Overview.",
    "facts": [
      {
        "label": "No club",
        "value": "Route to /create-club"
      },
      {
        "label": "Has club",
        "value": "Route to /dashboard/overview"
      }
    ],
    "details": [
      "The public homepage calls get_my_club_id to choose the next route.",
      "Club creation is separate from profile creation.",
      "Starting money and exact starting resources should come from backend config, not guessed manual text.",
      "After club creation, dashboard pages normally resolve the main club automatically."
    ],
    "tips": [
      "Do not invent starting cash unless backend config is provided."
    ]
  },
  {
    "id": "customize-team-deep",
    "category": "Club Identity",
    "title": "Customize Team",
    "subtitle": "Branding, team colors, logo, base logo and jersey.",
    "overview": "Customize Team manages club name, primary/secondary colors, logo and home jersey configuration.",
    "facts": [
      {
        "label": "Logo types",
        "value": "JPG, PNG, WEBP"
      },
      {
        "label": "Logo max",
        "value": "0.5 MB"
      },
      {
        "label": "Jersey max",
        "value": "1 MB and 512 × 512 px"
      },
      {
        "label": "Logo bucket",
        "value": "club-logos"
      }
    ],
    "details": [
      "Uploaded logos are converted to PNG in-browser before storage.",
      "Removing a logo restores a generated shield-style base logo instead of leaving no logo.",
      "Team colors are validated as hex colors.",
      "Jersey config is stored in team_kits with name home.",
      "A jersey can be generic, from a generic pool, a remote image URL or an uploaded image."
    ],
    "tips": [
      "Use small clean logos because they appear in tiny UI areas."
    ],
    "relatedLinks": [
      {
        "label": "Customize Team",
        "to": "/dashboard/customize-team"
      }
    ]
  },
  {
    "id": "branding-locks",
    "category": "Club Identity",
    "title": "Branding Locks from Naming Rights",
    "subtitle": "Why users may not be able to edit a team name or logo.",
    "overview": "Sponsor naming-rights can temporarily lock branding fields and change the displayed club name.",
    "facts": [
      {
        "label": "Lock status source",
        "value": "club_branding_lock_status_v1"
      },
      {
        "label": "Possible fields",
        "value": "Name, colors and logo"
      },
      {
        "label": "Display names",
        "value": "Original, season and full display name"
      }
    ],
    "details": [
      "Customize Team reads the branding lock before allowing edits.",
      "locked_by_sponsor means the club identity is controlled by a sponsor deal.",
      "Standard sponsors normally do not rename the team.",
      "Naming-rights sponsors usually pay more but affect public identity.",
      "Display-name helpers should be used in rankings/profiles when sponsor names matter."
    ],
    "tips": [
      "Warn players before they sign naming-rights deals."
    ]
  },
  {
    "id": "team-profile-deep",
    "category": "Club Identity",
    "title": "Team Profile",
    "subtitle": "Public club page with identity, sponsors, roster and points.",
    "overview": "Team Profile lets users inspect another club or their own club from rankings, races and statistics.",
    "facts": [
      {
        "label": "Route",
        "value": "/dashboard/teams/:clubId"
      },
      {
        "label": "Shows",
        "value": "Logo, country, tier, division, sponsors, kit, roster, points and recent races"
      }
    ],
    "details": [
      "The page shows whether the club is user or AI controlled.",
      "It can show active sponsor count, monthly sponsor totals and main sponsor logo.",
      "It can show kit preview from team_kits or AI kit preview rows.",
      "It can show public roster and recent race results.",
      "It includes a report player/team button for moderation."
    ],
    "tips": [
      "Use Team Profile to study rivals before important races."
    ]
  },
  {
    "id": "overview-deep",
    "category": "Dashboard",
    "title": "Overview Deep Guide",
    "subtitle": "All major blocks on the manager dashboard.",
    "overview": "Overview is the daily control room combining alerts, KPIs, squad pulse, finance, debt, race world, operations, news and sponsor data.",
    "facts": [
      {
        "label": "Core blocks",
        "value": "Alerts, KPIs, operations, squad pulse, schedule, news, finance, emergency debt"
      },
      {
        "label": "Main use",
        "value": "Daily checklist"
      }
    ],
    "details": [
      "Alerts show what needs attention first.",
      "KPIs summarize club state in compact cards.",
      "Operations cards show active systems like training, infrastructure, medical, sponsor, inbox, finance or system events.",
      "Squad Pulse summarizes fitness, morale, readiness, availability and contract risk.",
      "Finance Health shows balance, operating income/expense, sponsor income, policy cost and trip forecast.",
      "Emergency Debt Health shows rescue count, outstanding principal, next repayment and liquidation risk.",
      "Race world panels show today’s races, upcoming races and news."
    ],
    "tips": [
      "If Overview shows financial danger, open Finance before doing anything else."
    ],
    "relatedLinks": [
      {
        "label": "Overview",
        "to": "/dashboard/overview"
      }
    ]
  },
  {
    "id": "overview-race-world",
    "category": "Dashboard",
    "title": "Overview Race World",
    "subtitle": "Today’s races, upcoming schedule and world news.",
    "overview": "The Overview page includes world-facing data so users can follow the cycling world even when their own team is not racing.",
    "facts": [
      {
        "label": "Day race data",
        "value": "Title, subtitle, time label, country and link"
      },
      {
        "label": "News data",
        "value": "Title, subtitle, time, details and related links"
      }
    ],
    "details": [
      "Today’s races help users see what is happening now.",
      "Upcoming schedule helps plan near-future attention.",
      "World news makes the game world feel active.",
      "Related links can open races or other game pages.",
      "Use expanded text/detail fields when users need more context."
    ],
    "tips": [
      "Use Overview for awareness, then open detailed pages for decisions."
    ]
  },
  {
    "id": "notification-center-deep",
    "category": "Dashboard",
    "title": "Notification Center",
    "subtitle": "Unread/read notification management with search and categories.",
    "overview": "The full notification center helps users handle game/admin notifications without losing important deadlines.",
    "facts": [
      {
        "label": "Tabs",
        "value": "Unread and Read"
      },
      {
        "label": "Tools",
        "value": "Search, category filter, pagination, action buttons"
      },
      {
        "label": "Local fetch size",
        "value": "Up to 500 per tab in current page"
      }
    ],
    "details": [
      "Notifications can be searched by title, message, type, source, preference group and created time.",
      "Category is derived from preference group, source or type code.",
      "Templates can add image, intro text, details, extra text and actions.",
      "Actions can link directly to race preparation, finance, infrastructure, transfers, rider profiles or races.",
      "Preferences can prevent some notification types from showing."
    ],
    "tips": [
      "Read notifications before race deadlines."
    ],
    "relatedLinks": [
      {
        "label": "Notifications",
        "to": "/dashboard/notifications"
      }
    ]
  },
  {
    "id": "notification-examples",
    "category": "Dashboard",
    "title": "Important Notification Examples",
    "subtitle": "Events users should not ignore.",
    "overview": "Notifications can represent important state changes across race preparation, finance, infrastructure, transfers, developing team and sponsors.",
    "facts": [
      {
        "label": "Examples",
        "value": "Race plan reminders, stage plan reminders, developing window, emergency loan, facility complete, rider release, sponsor objective"
      }
    ],
    "details": [
      "Race preparation notifications warn when plans or stage plans need action.",
      "Developing-team window notifications tell users when movement is possible.",
      "Infrastructure completion notifications tell users that a facility/asset is ready.",
      "Emergency loan notifications mean the club could not cover a mandatory cost.",
      "Rider release notifications link to rider profile or free-agent market.",
      "Sponsor objective notifications can link to calendar or target race."
    ],
    "tips": [
      "Treat finance/deadline notifications as high priority."
    ]
  },
  {
    "id": "inbox-deep",
    "category": "Dashboard",
    "title": "Inbox",
    "subtitle": "Direct and admin conversations.",
    "overview": "Inbox is for conversations, unlike notifications which are system/game alerts.",
    "facts": [
      {
        "label": "Conversation types",
        "value": "Direct and admin direct"
      },
      {
        "label": "Read logic",
        "value": "Opening a thread marks it read"
      },
      {
        "label": "Compose target",
        "value": "Can be initialized from sessionStorage"
      }
    ],
    "details": [
      "The thread list shows display name, subject, preview, last message time and unread count.",
      "Search filters threads by name, subject and preview.",
      "Messages are loaded by conversation id and then marked read.",
      "If the user opens compose to an existing direct contact, the existing conversation is reused.",
      "Some conversations cannot be replied to depending on can_reply."
    ],
    "tips": [
      "Use Inbox for conversations, Notifications for game events."
    ],
    "relatedLinks": [
      {
        "label": "Inbox",
        "to": "/dashboard/inbox"
      }
    ]
  },
  {
    "id": "top-menu",
    "category": "Dashboard",
    "title": "Top Menu",
    "subtitle": "Account, coins, notifications and utility pages.",
    "overview": "The top-right menu contains account and support pages that are not all visible in the left sidebar.",
    "facts": [
      {
        "label": "Typical items",
        "value": "Inbox, profile, customize team, preferences, help, contact, coin packages, invite friends, logout"
      }
    ],
    "details": [
      "Users can reach profile settings and password tools from the menu.",
      "Coin Packages and Invite Friends are account/coin tools.",
      "Preferences controls notification settings and developing-team purchase.",
      "Help and Manual should link to this page.",
      "Logout ends the current session."
    ],
    "tips": [
      "Make Help/Manual easy to find from the menu."
    ]
  },
  {
    "id": "first-squad-deep",
    "category": "Riders",
    "title": "First Squad",
    "subtitle": "Main rider roster and list views.",
    "overview": "First Squad is where users inspect their main roster, financial information, skills and form.",
    "facts": [
      {
        "label": "First squad max in UI",
        "value": "18 riders"
      },
      {
        "label": "Views",
        "value": "General, financial, skills, form"
      }
    ],
    "details": [
      "General view is best for quick everyday roster checks.",
      "Financial view shows salary, market value and contracts.",
      "Skills view helps compare sprint, climbing, time trial, flat, endurance, recovery, resistance, race IQ, teamwork and morale.",
      "Form view helps judge fatigue, morale, availability and potential.",
      "Season dashboard widgets can show wins, podiums, top 10s, best GC, last race and next selection."
    ],
    "tips": [
      "Do not buy riders before understanding current squad."
    ],
    "relatedLinks": [
      {
        "label": "Squad",
        "to": "/dashboard/squad"
      }
    ]
  },
  {
    "id": "rider-skills-deep",
    "category": "Riders",
    "title": "Rider Skills Explained",
    "subtitle": "What every skill is useful for.",
    "overview": "Overall is a useful shortcut, but specific rider attributes decide the correct race role and tactical use.",
    "facts": [
      {
        "label": "Skills",
        "value": "Sprint, climbing, time trial, endurance, flat, recovery, resistance, race IQ, teamwork, morale"
      }
    ],
    "details": [
      "Sprint matters in bunch finishes and sprint trains.",
      "Climbing matters on mountain stages and summit finishes.",
      "Time trial matters in TT, prologue and TTT contexts.",
      "Endurance keeps riders strong through long stages.",
      "Flat helps on rolling/flat roads, chasing and positioning.",
      "Recovery matters across stage races.",
      "Resistance helps in hard weather, high pace and difficult terrain.",
      "Race IQ affects tactical decisions and positioning.",
      "Teamwork helps domestiques, lead-outs and chasing.",
      "Morale affects confidence and can influence performance."
    ],
    "tips": [
      "Match rider skills to role and stage type."
    ]
  },
  {
    "id": "rider-profile-deep",
    "category": "Riders",
    "title": "Rider Profile Tabs",
    "subtitle": "Overview, contract, training, compare and history.",
    "overview": "Rider Profile is the deep page for individual rider decisions.",
    "facts": [
      {
        "label": "Tabs",
        "value": "Overview, Contract, Training, Compare, History"
      },
      {
        "label": "Skill view",
        "value": "Basic or modern"
      }
    ],
    "details": [
      "Overview shows rider identity, status and core condition.",
      "Contract shows salary, renewal and release-related information.",
      "Training shows plans/history when available.",
      "Compare lets users compare riders without leaving the page.",
      "History shows career seasons and recent race data.",
      "Transfer-listed state is visible and can block release."
    ],
    "tips": [
      "Open profiles before renewing, selling or building race plans."
    ]
  },
  {
    "id": "fitness-health-deep",
    "category": "Riders",
    "title": "Fitness, Fatigue and Health",
    "subtitle": "Why a strong rider can be a poor choice today.",
    "overview": "Performance depends on more than attributes. Fatigue, sickness, injury, not-fully-fit status and morale can all change race value.",
    "facts": [
      {
        "label": "Availability",
        "value": "Fit, not fully fit, injured, sick"
      },
      {
        "label": "Condition",
        "value": "Fatigue, morale, health case, recovery"
      }
    ],
    "details": [
      "Fit riders are normally safe if not blocked by schedule.",
      "Not fully fit riders can be risky and may need medical support.",
      "Injured or sick riders should usually not race or train hard.",
      "High fatigue can reduce performance and increase risk.",
      "Morale should be monitored because low morale can hurt output.",
      "Medical staff and Medical Center investment improve recovery support."
    ],
    "tips": [
      "A tired star can perform worse than a fresh helper."
    ]
  },
  {
    "id": "race-sharpness-deep",
    "category": "Riders",
    "title": "Race Sharpness",
    "subtitle": "Racing rhythm and overload risk.",
    "overview": "Race sharpness helps show whether a rider has enough recent racing rhythm or is overloaded by too many race days.",
    "facts": [
      {
        "label": "Tracked",
        "value": "Last race date, race days last 14/30, total race days, overload warning"
      }
    ],
    "details": [
      "Too little racing can reduce sharpness.",
      "Too much racing can create overload penalty.",
      "Sharpness should be read together with fatigue and health.",
      "Race Preparation can show sharpness during selection.",
      "Sharpness is especially useful when building a race calendar."
    ],
    "tips": [
      "Use smaller races to prepare riders for bigger goals."
    ]
  },
  {
    "id": "contracts-renewals-release",
    "category": "Riders",
    "title": "Contracts, Renewals and Release",
    "subtitle": "Financial decisions around riders.",
    "overview": "Contracts affect wages, expiry, release cost, renewal timing and transfer-list status.",
    "facts": [
      {
        "label": "Release preview",
        "value": "Remaining weeks, salary, release cost and balance after release"
      },
      {
        "label": "Block",
        "value": "Release blocked while transfer listed"
      }
    ],
    "details": [
      "A rider with a high salary can become a financial problem.",
      "Expiring contracts should be reviewed before the end of season.",
      "Releasing a rider can cost remaining salary/compensation.",
      "The preview shows whether the club can afford release.",
      "Transfer-listed riders cannot be released while the listing is active."
    ],
    "tips": [
      "Check contracts before making transfers."
    ]
  },
  {
    "id": "developing-team-deep",
    "category": "Riders",
    "title": "Developing Team",
    "subtitle": "U23/development roster, purchase and movement windows.",
    "overview": "Developing Team is a second connected team for young/development riders.",
    "facts": [
      {
        "label": "Max in UI",
        "value": "8 riders"
      },
      {
        "label": "Purchase",
        "value": "Preferences"
      },
      {
        "label": "Movement",
        "value": "Only during movement windows"
      },
      {
        "label": "Age warning",
        "value": "24+ riders require attention"
      }
    ],
    "details": [
      "The status panel shows real days played, game days played, coin balance, coin cost and purchase permission.",
      "After purchase, the app must keep active club context on the main club.",
      "Movement window labels explain when riders can move.",
      "Older developing riders can trigger warnings.",
      "Developing-team riders may still be treated as user-family riders in race result displays."
    ],
    "tips": [
      "Use it to develop talent, not as unlimited roster storage."
    ],
    "relatedLinks": [
      {
        "label": "Preferences",
        "to": "/dashboard/preferences"
      }
    ]
  },
  {
    "id": "staff-roles-deep",
    "category": "Riders",
    "title": "Staff Roles",
    "subtitle": "What staff do for the club.",
    "overview": "Staff affect training, recovery, scouting, equipment and race planning.",
    "facts": [
      {
        "label": "Roles",
        "value": "Head Coach, Trainer, U23 Head Coach, Doctor, Physio, Nutritionist, Mechanic, Sport Director, Scout/Analyst"
      }
    ],
    "details": [
      "Head Coach supports training and development.",
      "Trainer improves daily training quality.",
      "U23 Head Coach supports developing riders.",
      "Team Doctor, Physio and Nutritionist support health and recovery.",
      "Mechanic supports equipment and technical systems.",
      "Sport Director supports race tactics and planning.",
      "Scout/Analyst supports market intelligence and reports."
    ],
    "tips": [
      "Hire staff based on weakness, not just because they are available."
    ]
  },
  {
    "id": "staff-capacity-deep",
    "category": "Riders",
    "title": "Staff Capacity",
    "subtitle": "Why hiring can be blocked.",
    "overview": "Staff roles have limits. Infrastructure often determines how many staff members of each role the club can employ.",
    "facts": [
      {
        "label": "Capacity fields",
        "value": "Limit count, active count, open slots, can hire"
      }
    ],
    "details": [
      "If open slots is 0, hiring is blocked for that role.",
      "Infrastructure upgrades can unlock additional staff capacity.",
      "Staff can also be unavailable due to courses or assignments.",
      "A higher staff limit does not mean the club can afford the salary.",
      "Capacity warnings should guide users to Infrastructure when relevant."
    ],
    "tips": [
      "Check both open slots and salary before hiring."
    ]
  },
  {
    "id": "staff-courses-deep",
    "category": "Riders",
    "title": "Staff Courses",
    "subtitle": "Improving staff over game days.",
    "overview": "Staff courses cost cash and take game days, but can improve staff attributes.",
    "facts": [
      {
        "label": "Gains",
        "value": "Expertise, experience, potential, leadership, efficiency, loyalty"
      }
    ],
    "details": [
      "Active courses show start date, completion date, duration and cost.",
      "Recent completed courses show attribute gains.",
      "Staff on courses may be unavailable for some tasks.",
      "Courses are best for staff the club plans to keep.",
      "Course spending should be delayed if finances are dangerous."
    ],
    "tips": [
      "Train important staff, not temporary hires."
    ]
  },
  {
    "id": "regular-training-deep",
    "category": "Training",
    "title": "Regular Training Details",
    "subtitle": "Team defaults and individual plans.",
    "overview": "Regular training is the everyday development system for riders.",
    "facts": [
      {
        "label": "Intensities",
        "value": "Recovery, light, normal, hard"
      },
      {
        "label": "Focuses",
        "value": "General, recovery, sprint, climbing, flat, time trial, endurance, resistance, race IQ, teamwork"
      }
    ],
    "details": [
      "Team defaults control the normal plan for a team scope.",
      "Individual rider plans can override defaults.",
      "Hard training increases development pressure but can create fatigue.",
      "Recovery training helps reduce fatigue and protect riders.",
      "Focus should match rider role and future race goals."
    ],
    "tips": [
      "Do not use hard training permanently."
    ]
  },
  {
    "id": "training-camps-deep",
    "category": "Training",
    "title": "Training Camps",
    "subtitle": "Location, type, weather, staff and cost.",
    "overview": "Training camps are stronger development blocks with higher planning requirements and cost.",
    "facts": [
      {
        "label": "Camp types",
        "value": "General, sprint, climbing, flat, time trial"
      },
      {
        "label": "Regions",
        "value": "Europe, North America, South America, Asia, Africa, Oceania, Middle East"
      }
    ],
    "details": [
      "Camps include stars, quality multiplier, recovery comfort, cost index and weather note.",
      "Preferred, risky and closed weeks affect calendar suitability.",
      "Quotes include travel, accommodation, camp fee, logistics and total cost.",
      "Validation can block injured riders or unavailable staff.",
      "Staff boosts can improve development, recovery, organization and risk reduction."
    ],
    "tips": [
      "Book camps only after checking Finance."
    ]
  },
  {
    "id": "current-camp-deep",
    "category": "Training",
    "title": "Current Camp Page",
    "subtitle": "Daily camp planning and reports.",
    "overview": "The current camp page shows active camp progress, weather, staff boosts, reports and next-day planning.",
    "facts": [
      {
        "label": "States",
        "value": "Booked notice, prestart, active, post, hidden"
      },
      {
        "label": "Plan options",
        "value": "Day off, light, normal, hard"
      }
    ],
    "details": [
      "Future camps show the full interface only close to start.",
      "Weather forecast helps users adjust intensity.",
      "Daily reports show completed/missed sessions and fatigue changes.",
      "Staff boost summary explains what staff are contributing.",
      "The next three camp days can be planned by team or individual intensity."
    ],
    "tips": [
      "Use day off when camp fatigue becomes too high."
    ]
  },
  {
    "id": "equipment-category-deep",
    "category": "Equipment",
    "title": "Equipment Categories and Bonuses",
    "subtitle": "The six durable equipment categories.",
    "overview": "Durable equipment includes frames, wheelsets, tires, groupsets, helmets and shoes.",
    "facts": [
      {
        "label": "Categories",
        "value": "Frame, wheelset, tires, groupset, helmet, shoes"
      },
      {
        "label": "Bonuses",
        "value": "Flat, hilly, mountain, cobble, time trial, sprint, fatigue reduction"
      }
    ],
    "details": [
      "Frames often define the broad setup identity.",
      "Wheelsets and tires are very route-sensitive.",
      "Groupsets, helmets and shoes can add important support bonuses.",
      "Specialist items can include negative trade-offs.",
      "Quality labels include Basic, Good and Super."
    ],
    "tips": [
      "Match equipment to stage type."
    ]
  },
  {
    "id": "equipment-caps-deep",
    "category": "Equipment",
    "title": "Equipment Weights and Caps",
    "subtitle": "Why equipment bonuses are controlled.",
    "overview": "Equipment helps, but capped bonuses protect rider ability and game balance.",
    "facts": [
      {
        "label": "Known caps",
        "value": "Equipment stage around 4%, team support around 5%, total support around 8%, fatigue reduction around 10%"
      }
    ],
    "details": [
      "A full set of +4% items does not become +24%.",
      "Bonuses are weighted by equipment category.",
      "Support bonuses have caps.",
      "Fatigue reduction also has a cap.",
      "Specialist gear is still valuable in close races."
    ],
    "tips": [
      "Use gear to support strategy, not replace rider quality."
    ]
  },
  {
    "id": "equipment-inventory-deep",
    "category": "Equipment",
    "title": "Inventory and Maintenance",
    "subtitle": "Condition, statuses and repair decisions.",
    "overview": "Inventory shows active owned equipment and maintenance focuses on items needing attention.",
    "facts": [
      {
        "label": "Statuses",
        "value": "Ready, assigned, in maintenance, worn"
      },
      {
        "label": "Maintenance threshold",
        "value": "Condition <= 90%"
      }
    ],
    "details": [
      "Sold and discarded items are hidden from active inventory.",
      "Ready and worn items can usually run actions if rules allow.",
      "Assigned items are locked because they are in use.",
      "Repair quotes show cost and permission.",
      "Condition should be fixed before important races."
    ],
    "tips": [
      "Repair early; do not wait until all gear is worn."
    ]
  },
  {
    "id": "race-supplies-deep",
    "category": "Equipment",
    "title": "Race Supplies Details",
    "subtitle": "Bidons, gels, nutrition, jerseys and rain jackets.",
    "overview": "Race supplies are consumed or used during stage plans and can affect fatigue, stamina, readiness and weather support.",
    "facts": [
      {
        "label": "Consumables",
        "value": "Bidons, energy gels, nutrition packs"
      },
      {
        "label": "Durables",
        "value": "Race Jersey Complete, rain jackets"
      }
    ],
    "details": [
      "Bidons: 1–4 per rider; hydration and fatigue control.",
      "Gels: 0–4 per rider; stamina and final effort support.",
      "Nutrition: 0–2 per rider; endurance and recovery support.",
      "Race jerseys: mandatory durable kit; 10 stage uses per unit.",
      "Rain jackets: optional durable weather item; 25 stage uses per unit."
    ],
    "tips": [
      "Stage races consume supplies quickly."
    ]
  },
  {
    "id": "technical-sponsor-deep",
    "category": "Equipment",
    "title": "Technical Sponsor Support in Equipment",
    "subtitle": "Discounts and support budgets.",
    "overview": "Technical sponsors can reduce equipment costs and provide equipment support budgets.",
    "facts": [
      {
        "label": "Benefits",
        "value": "Cash support, equipment support budget, used/remaining budget, category discounts"
      }
    ],
    "details": [
      "Equipment Overview can show active technical sponsor support.",
      "Market purchases can quote category discounts.",
      "Remaining budget helps plan purchase timing.",
      "Discounts can differ by category.",
      "Technical sponsors are especially useful before major gear upgrades."
    ],
    "tips": [
      "Buy expensive gear while useful support is active."
    ]
  },
  {
    "id": "facilities-overview-deep",
    "category": "Infrastructure",
    "title": "Facilities Overview",
    "subtitle": "Buildings and staff capacity.",
    "overview": "Facilities improve training, medical, scouting, mechanics, youth and club administration systems.",
    "facts": [
      {
        "label": "Facilities",
        "value": "Club House, Training Center, Medical Center, Youth Academy, Mechanics Workshop, Scouting Office"
      }
    ],
    "details": [
      "Club House supports administration and future management.",
      "Training Center supports coaching and development.",
      "Medical Center supports doctors, physios, nutritionists and recovery.",
      "Youth Academy supports U23/youth development.",
      "Mechanics Workshop supports equipment/repairs.",
      "Scouting Office supports scouting reports and market intelligence."
    ],
    "tips": [
      "Choose upgrades based on your current bottleneck."
    ]
  },
  {
    "id": "facility-jobs-deep",
    "category": "Infrastructure",
    "title": "Infrastructure Jobs",
    "subtitle": "Builds, deliveries, slots and refunds.",
    "overview": "Infrastructure jobs are pending facility upgrades or asset deliveries with cash cost and game-day duration.",
    "facts": [
      {
        "label": "Job types",
        "value": "Facility upgrade, asset delivery"
      },
      {
        "label": "Statuses",
        "value": "Pending, completed, cancelled, failed"
      }
    ],
    "details": [
      "Active jobs show paid cost, game duration and completion date.",
      "Facility construction slots limit how many builds can happen at once.",
      "Cancellation quotes show refund cash, refund percent, cancellation cost and reason.",
      "Immediate cancellation can refund more than late cancellation.",
      "Completed jobs update facilities or deliver assets."
    ],
    "tips": [
      "Do not start too many expensive jobs during cash pressure."
    ]
  },
  {
    "id": "assets-deep",
    "category": "Infrastructure",
    "title": "Assets Overview",
    "subtitle": "Team cars, buses and support vans.",
    "overview": "Assets are vehicles/support resources with levels, condition, assignment status and support values.",
    "facts": [
      {
        "label": "Assets",
        "value": "Team Cars, Team Bus, Equipment Van, Mobile Workshop, Medical Van"
      }
    ],
    "details": [
      "Team Cars support race convoy and can be selected as Team Car 1–3.",
      "Team Bus transports riders and staff.",
      "Equipment Van carries bikes and gear.",
      "Mobile Workshop supports repairs and technical operations.",
      "Medical Van supports medical/logistics needs.",
      "Assigned or locked assets cannot be repaired or sold."
    ],
    "tips": [
      "Keep important assets repaired before races."
    ]
  },
  {
    "id": "season-calendar-deep",
    "category": "Calendar and Races",
    "title": "Season Calendar Details",
    "subtitle": "Daily team activity planning.",
    "overview": "Season Calendar shows the club’s daily activity and the wider season.",
    "facts": [
      {
        "label": "Filters",
        "value": "Races, Training Camps, Events, Holidays"
      },
      {
        "label": "Game month length",
        "value": "30 days in current UI grid"
      }
    ],
    "details": [
      "Use it to see race days, camps and events.",
      "Filters reduce clutter.",
      "Calendar helps avoid overbooking riders and staff.",
      "Training camp dates should be checked here.",
      "Important race months can be planned in advance."
    ],
    "tips": [
      "Use Season Calendar before booking camps."
    ]
  },
  {
    "id": "race-calendar-deep",
    "category": "Calendar and Races",
    "title": "Race Calendar Details",
    "subtitle": "Race cards and application statuses.",
    "overview": "Race Calendar lists all races and their application state.",
    "facts": [
      {
        "label": "Status values",
        "value": "not_open, open, closed, race_active, race_finished, cancelled"
      }
    ],
    "details": [
      "Race cards can show category, country, host city, type, start/end date and team limits.",
      "Applications are possible only while status is open.",
      "Accepted teams count shows how full the race is.",
      "Sponsor objectives can target specific races or categories.",
      "Open Race sends users to the Race Detail page."
    ],
    "tips": [
      "Apply only when the race suits your team."
    ]
  },
  {
    "id": "race-detail-deep",
    "category": "Calendar and Races",
    "title": "Race Detail Page",
    "subtitle": "Race profile, stages, participants, results and replay.",
    "overview": "Race Detail is the full race hub.",
    "facts": [
      {
        "label": "Info tabs",
        "value": "Participants, Results"
      },
      {
        "label": "Classifications",
        "value": "General, points, mountain, young, team"
      }
    ],
    "details": [
      "Race overview includes dates, country, category, race type and status.",
      "Entry rules show deadlines, team limits, rider limits and prize fund.",
      "Stages show route, terrain, distance, weather, sprints and climbs.",
      "Participants show team and rider snapshots.",
      "Results and classifications become available according to race state.",
      "Replay can show live or historical frames if access allows."
    ],
    "tips": [
      "Review race detail before preparing a team."
    ]
  },
  {
    "id": "stage-terrain-points",
    "category": "Calendar and Races",
    "title": "Stage Terrain and Points",
    "subtitle": "Flat, hilly, mountain, TT, cobbled, sprints and KOM.",
    "overview": "Stage terrain and point definitions help users decide riders, tactics and equipment.",
    "facts": [
      {
        "label": "Terrain",
        "value": "Flat, hilly, mountain, individual time trial, team time trial, prologue, cobbled"
      },
      {
        "label": "Point types",
        "value": "START, INTERMEDIATE_SPRINT, KOM, BONUS_SPRINT, FINISH"
      }
    ],
    "details": [
      "Flat stages often favor sprinters and lead-outs.",
      "Hilly stages favor versatile riders and attackers.",
      "Mountain stages favor climbers and GC leaders.",
      "TT/prologue stages favor time-trialists and TT equipment.",
      "Cobbled stages favor resistance and specialist equipment.",
      "KOM and sprint points matter for secondary classifications."
    ],
    "tips": [
      "Stage terrain should drive Stage Plan roles."
    ]
  },
  {
    "id": "replay-results-deep",
    "category": "Calendar and Races",
    "title": "Replay, Results and Commentary",
    "subtitle": "How to understand what happened in a stage.",
    "overview": "Replay and commentary explain race dynamics beyond the final result table.",
    "facts": [
      {
        "label": "Replay speeds",
        "value": "1x, 2x, 4x, 8x"
      },
      {
        "label": "Frame limit",
        "value": "Up to 50000 rows loaded in current code"
      }
    ],
    "details": [
      "Replay frames show groups, gaps, riders, teams, speed and kilometer markers.",
      "Live state controls whether results are visible and whether replay speed is locked.",
      "Standing rows can show leader badges and group position.",
      "Commentary/report events describe attacks, sprints, climbs, incidents and decisive moments.",
      "Results show stage rank, time, gap, points, bonus/penalty seconds and status."
    ],
    "tips": [
      "Use replay to diagnose tactics and rider performance."
    ]
  },
  {
    "id": "race-plan-deep",
    "category": "Race Preparation",
    "title": "Race Plan Details",
    "subtitle": "Riders, staff, assets, equipment and supplies.",
    "overview": "Race Plan is the race-level plan submitted before Stage Plans.",
    "facts": [
      {
        "label": "Main pieces",
        "value": "Riders, staff, assets, equipment setup, supplies and quote"
      }
    ],
    "details": [
      "Riders must match race min/max rules.",
      "Blocked riders cannot be selected for overlapping events.",
      "Staff and assets can also be blocked by assignments.",
      "Equipment setup should match race terrain.",
      "Supplies should be sufficient for all stages.",
      "Quote preview should be checked before submit."
    ],
    "tips": [
      "Never submit a plan without reading cost and blocked resources."
    ]
  },
  {
    "id": "stage-plan-deep",
    "category": "Race Preparation",
    "title": "Stage Plan Details",
    "subtitle": "Per-stage roles and tactics.",
    "overview": "Stage Plans tell the race engine what each rider should do on each stage.",
    "facts": [
      {
        "label": "Components",
        "value": "Roles, team tactics, individual tactics, equipment, supplies"
      }
    ],
    "details": [
      "A flat sprint stage needs different roles than a mountain stage.",
      "TT and TTT stages need pacing and specialist equipment.",
      "Supplies are assigned per stage and can be consumed or use durable capacity.",
      "Readiness checks indicate whether a stage plan is usable.",
      "Saved but empty plans are not the same as complete plans."
    ],
    "tips": [
      "Check every stage in a stage race."
    ]
  },
  {
    "id": "stage-roles-deep",
    "category": "Race Preparation",
    "title": "Stage Roles and Use Cases",
    "subtitle": "Choosing leaders, sprinters, helpers and specialists.",
    "overview": "Stage roles should match rider skills and stage goals.",
    "facts": [
      {
        "label": "Roles",
        "value": "Leader, sprinter, lead-out, sprint train, climber, mountain domestique, helper, breakaway, chaser, rouleur, protected, free"
      }
    ],
    "details": [
      "Team Leader/GC is for riders protected for overall time.",
      "Sprinter needs sprint skill and lead-out support.",
      "Lead-out/Sprint Train helps the sprinter in flat finishes.",
      "Climber/Mountain Domestique is for mountain control.",
      "Breakaway roles are risky but can chase stage wins or visibility.",
      "Rouleurs and helpers support chasing, pacing and protection."
    ],
    "tips": [
      "Do not make every rider a leader."
    ]
  },
  {
    "id": "stage-readiness-deep",
    "category": "Race Preparation",
    "title": "Stage Readiness System",
    "subtitle": "Green/yellow/orange/red/gray plan checks.",
    "overview": "Readiness tells users whether stage plans are complete enough for the engine.",
    "facts": [
      {
        "label": "Counts",
        "value": "Saved, usable, missing, incomplete, empty, without supplies"
      },
      {
        "label": "Tones",
        "value": "Green, yellow, orange, red, gray"
      }
    ],
    "details": [
      "Missing plans should be created.",
      "Empty plans should be filled with roles/tactics/supplies.",
      "Plans without supplies may be risky or incomplete.",
      "Recommended action explains what to fix.",
      "All required stage plans should be saved before race day."
    ],
    "tips": [
      "Fix red/orange readiness before the deadline."
    ]
  },
  {
    "id": "sport-director-deep",
    "category": "Race Preparation",
    "title": "Sport Director Suggestions",
    "subtitle": "Assistant suggestions for stage plans.",
    "overview": "Sport Director suggestions can help managers build plans but should not replace judgement.",
    "facts": [
      {
        "label": "Suggestion areas",
        "value": "Equipment, team, individual, supplies"
      }
    ],
    "details": [
      "The suggestion response can include stage kind, stage name, suggestion data and explanation.",
      "Suggestions can be limited by staff quality or backend logic.",
      "Users should compare suggestions with actual rider skills and team goals.",
      "Weather and supplies should still be checked manually.",
      "Good managers adjust suggestions instead of applying blindly."
    ],
    "tips": [
      "Use suggestions as a learning tool."
    ]
  },
  {
    "id": "ranking-tiers-deep",
    "category": "Rankings and Statistics",
    "title": "Competition Tiers",
    "subtitle": "WorldTeam, ProTeam, Continental and Amateur.",
    "overview": "Team ranking is organized into a competition pyramid with promotion, playoffs and relegation.",
    "facts": [
      {
        "label": "Tiers",
        "value": "WorldTeam, ProTeam, Continental, Amateur"
      }
    ],
    "details": [
      "WorldTeam is the top level.",
      "ProTeam is split into West and East.",
      "Continental is split into Europe, America, Asia, Africa and Oceania.",
      "Amateur is split into many regional divisions.",
      "Points decide positions and season-end consequences."
    ],
    "tips": [
      "Track your own division first."
    ]
  },
  {
    "id": "promotion-relegation-deep",
    "category": "Rankings and Statistics",
    "title": "Promotion, Playoffs and Relegation",
    "subtitle": "How season-end movement is shown.",
    "overview": "Standing labels explain which positions promote, enter playoffs or relegate.",
    "facts": [
      {
        "label": "WorldTeam",
        "value": "Bottom 5 relegated"
      },
      {
        "label": "ProTeam",
        "value": "Winner promoted, 2nd–4th World playoff, bottom 5 relegated"
      }
    ],
    "details": [
      "Continental Europe/America feed Pro West playoff.",
      "Continental Asia/Africa/Oceania feed Pro East playoff.",
      "Different Continental divisions have different relegation cutoffs.",
      "Amateur Oceania promotes top three directly.",
      "European Amateur divisions use winner direct and 2nd–3rd playoff.",
      "Other Amateur divisions use winner direct and 2nd–4th playoff."
    ],
    "tips": [
      "Read the label for the selected division."
    ]
  },
  {
    "id": "statistics-deep",
    "category": "Rankings and Statistics",
    "title": "Statistics Deep Guide",
    "subtitle": "Teams, riders, filters and history.",
    "overview": "Statistics helps compare performance and scout the game world.",
    "facts": [
      {
        "label": "Main tabs",
        "value": "Teams and Riders"
      },
      {
        "label": "Rider metrics",
        "value": "Overall, sprint and climbing season points"
      }
    ],
    "details": [
      "Team Current compares current standings and points.",
      "Team History stores past winners and snapshots.",
      "Rider Rankings show top performers.",
      "Rider Breakdown helps find specialists.",
      "Filters include season, team type, status, tier, division, country and search.",
      "Opening a rider uses own or external profile route depending on ownership."
    ],
    "tips": [
      "Use Statistics before Transfers."
    ]
  },
  {
    "id": "transfer-list-deep",
    "category": "Transfers and Scouting",
    "title": "Transfer List Riders",
    "subtitle": "Buying from another club.",
    "overview": "Transfer-listed riders require a club-to-club offer before rider contract negotiation.",
    "facts": [
      {
        "label": "Listing data",
        "value": "Seller, asking price, salary, market value, expiry, availability"
      }
    ],
    "details": [
      "The selling club can accept/reject offers.",
      "Asking prices can be automatically clamped.",
      "If accepted, a separate rider negotiation starts.",
      "Scouting can affect how much exact information is visible.",
      "Listings expire by game date."
    ],
    "tips": [
      "Check salary before making a big transfer offer."
    ]
  },
  {
    "id": "free-agents-deep",
    "category": "Transfers and Scouting",
    "title": "Free Agents",
    "subtitle": "Signing unattached riders.",
    "overview": "Free agents do not require a selling club offer, but contract negotiation still matters.",
    "facts": [
      {
        "label": "Negotiation",
        "value": "Salary, duration, signing bonus, agent fee and tier fit"
      }
    ],
    "details": [
      "Free agents can be cheaper because there is no transfer fee.",
      "They may still demand high salary or bonuses.",
      "Offer preview helps estimate acceptance.",
      "Hard blocks can prevent a deal.",
      "Negotiations can expire or be countered/rejected."
    ],
    "tips": [
      "Zero transfer fee does not mean a cheap rider."
    ]
  },
  {
    "id": "transfer-negotiation-deep",
    "category": "Transfers and Scouting",
    "title": "Negotiation Outlook",
    "subtitle": "Acceptance percent, scores and rejection reasons.",
    "overview": "Negotiation previews help users understand why an offer may succeed or fail.",
    "facts": [
      {
        "label": "Scores",
        "value": "Salary, duration, bonus, fee, tier and total score"
      },
      {
        "label": "Statuses",
        "value": "Open, pending, accepted, rejected, expired, declined, completed, countered"
      }
    ],
    "details": [
      "Acceptance percent is only a preview, not a guarantee.",
      "Primary reason tells what is wrong with the offer.",
      "Tier score can matter if a rider wants a higher competition level.",
      "Attempt counts limit repeated offers.",
      "Locked-until prevents immediate repeat negotiations."
    ],
    "tips": [
      "Improve the reason the rider complains about, not random fields."
    ]
  },
  {
    "id": "scouting-deep",
    "category": "Transfers and Scouting",
    "title": "Scouting Reports",
    "subtitle": "Reducing hidden information risk.",
    "overview": "Scouting reports help users avoid bad transfer decisions by improving knowledge of external riders.",
    "facts": [
      {
        "label": "Filters",
        "value": "All, New, Reviewed"
      },
      {
        "label": "Report fields",
        "value": "Rider, scout, date, overall, potential, strengths, notes"
      }
    ],
    "details": [
      "Reports use real rider UUIDs so profile links work.",
      "New reports should be reviewed before bidding.",
      "Overall and potential may be labels rather than exact values.",
      "Strengths identify what the rider is good at.",
      "Notes provide scouting context."
    ],
    "tips": [
      "Scout before expensive signings."
    ]
  },
  {
    "id": "staff-market-deep",
    "category": "Transfers and Scouting",
    "title": "Staff Market",
    "subtitle": "Hiring free-agent staff.",
    "overview": "The Staff tab lists available staff and respects role capacity.",
    "facts": [
      {
        "label": "Roles",
        "value": "Head coach, trainer, U23 coach, doctor, physio, nutritionist, mechanic, sport director, scout/analyst"
      },
      {
        "label": "Sort",
        "value": "Salary, skills, name, country"
      }
    ],
    "details": [
      "Candidates show expertise, experience, potential, leadership, efficiency, loyalty and salary.",
      "Role limits can block hiring.",
      "Scouting Office can affect report quality for candidates.",
      "Weekly salary affects Finance long term.",
      "Staff should be hired for a clear purpose."
    ],
    "tips": [
      "Do not hire staff if capacity or budget is tight."
    ]
  },
  {
    "id": "finance-health-deep",
    "category": "Finance",
    "title": "Finance Health",
    "subtitle": "How to read financial safety.",
    "overview": "Finance health is about sustainability, not just current balance.",
    "facts": [
      {
        "label": "Operating view",
        "value": "Income, expense and net by day/week/month"
      },
      {
        "label": "Debt separation",
        "value": "Loan disbursement and principal are separated from operating cashflow"
      }
    ],
    "details": [
      "A high balance can still be unsafe if recurring expenses are too high.",
      "Salaries, policies, staff, taxes and loan repayments can create future pressure.",
      "Sponsor income may arrive monthly or by contract timing.",
      "Race rewards are performance-dependent and should not be assumed.",
      "Use cashflow trends to understand whether the club is improving or declining."
    ],
    "tips": [
      "Check Finance before every major spending decision."
    ]
  },
  {
    "id": "transactions-deep",
    "category": "Finance",
    "title": "Transactions",
    "subtitle": "Financial ledger and archive.",
    "overview": "Transactions is the place to audit exactly why money moved.",
    "facts": [
      {
        "label": "Recent",
        "value": "Last 30 game days"
      },
      {
        "label": "Archive",
        "value": "Previous 6 game months"
      },
      {
        "label": "Page size",
        "value": "20"
      }
    ],
    "details": [
      "Visible dates use game-date metadata.",
      "created_at is only a technical fallback.",
      "Known transaction types have readable labels.",
      "Unknown transaction types are prettified automatically.",
      "Archive groups old rows by in-game month."
    ],
    "tips": [
      "Use Transactions when balance surprises you."
    ]
  },
  {
    "id": "tax-deep",
    "category": "Finance",
    "title": "Tax Audits",
    "subtitle": "Withholding, monthly adjustment and refund.",
    "overview": "Tax tracks taxable income and monthly audit outcomes.",
    "facts": [
      {
        "label": "Types",
        "value": "tax_withholding, tax_monthly_adjustment, tax_monthly_refund"
      },
      {
        "label": "Statuses",
        "value": "OK, adjusted, refunded"
      }
    ],
    "details": [
      "Expected tax is calculated from taxable gross income and tax rate.",
      "Already withheld is tax already taken.",
      "Adjustment amount is what must be charged or refunded.",
      "Monthly audit compares expected tax against what was paid.",
      "Tax can become dangerous after large income events."
    ],
    "tips": [
      "Keep cash available for tax adjustments."
    ]
  },
  {
    "id": "sponsors-deep",
    "category": "Finance",
    "title": "Sponsors Deep Guide",
    "subtitle": "Main, secondary and technical sponsors.",
    "overview": "Sponsors bring guaranteed money, bonus pools and objectives. Technical sponsors can also help equipment.",
    "facts": [
      {
        "label": "Kinds",
        "value": "Main, secondary, technical"
      },
      {
        "label": "Money",
        "value": "Guaranteed amount, bonus pool, monthly amount"
      },
      {
        "label": "Technical",
        "value": "Discount percentage and support package"
      }
    ],
    "details": [
      "Main sponsors are the most visible.",
      "Secondary sponsors fill slots and add support.",
      "Technical sponsors support equipment purchases.",
      "Sponsor offers can expire.",
      "Proration means a partial-season contract may not pay full-season values."
    ],
    "tips": [
      "Compare guaranteed money, objectives and branding impact."
    ]
  },
  {
    "id": "sponsor-objectives-deep",
    "category": "Finance",
    "title": "Sponsor Objectives",
    "subtitle": "Targets, checking and payouts.",
    "overview": "Objectives reward the club when sponsor targets are achieved.",
    "facts": [
      {
        "label": "Results",
        "value": "Race start, win, podium, top 5, top 10, GC top 5/top 10, stage top 5/win, classification visibility"
      }
    ],
    "details": [
      "Objectives can target exact races, countries or categories.",
      "Progress shows target and current value.",
      "Status can be scheduled, checked, achieved, missed or paid.",
      "Failed reason explains missed objectives.",
      "Payout transaction id appears after payment."
    ],
    "tips": [
      "Plan sponsor objectives when choosing races."
    ]
  },
  {
    "id": "team-policies-deep",
    "category": "Finance",
    "title": "Team Policies and Operations",
    "subtitle": "Recurring and trip-related club standards.",
    "overview": "Policies improve comfort/support but can increase weekly, monthly and trip costs.",
    "facts": [
      {
        "label": "Operations",
        "value": "Flights, accommodation, ground transport, logistics, staff travel accommodation"
      },
      {
        "label": "Policies",
        "value": "Housing, nutrition, recovery, staff equipment, rider bonus, staff bonus"
      }
    ],
    "details": [
      "Flights, hotel and ground transport affect trips.",
      "Housing, nutrition and recovery support recurring operations.",
      "Staff equipment can apply when hiring staff.",
      "Bonus plans can create seasonal or result-based cost.",
      "Forecasts show upcoming trip costs.",
      "Last month actual cost helps audit spending."
    ],
    "tips": [
      "Reduce policy level if finances are dangerous."
    ]
  },
  {
    "id": "liquidation-deep",
    "category": "Finance",
    "title": "Liquidation and Restart Notice",
    "subtitle": "What happens when the club runs out of rescue protection.",
    "overview": "Liquidation blocks gameplay for that club after rescue limits are exhausted and another mandatory obligation fails.",
    "facts": [
      {
        "label": "Rescue limit",
        "value": "3 lifetime emergency rescues"
      },
      {
        "label": "Account coins",
        "value": "Remain active"
      },
      {
        "label": "Restart",
        "value": "Future/not active notice in current UI"
      }
    ],
    "details": [
      "The liquidated club can no longer perform actions.",
      "The user can create a new club in an available free spot.",
      "Restart team currently only explains future reset behavior.",
      "Future restart would release old riders, remove staff and reset points/progress.",
      "Liquidation reason and timestamp can be shown."
    ],
    "tips": [
      "Explain that liquidation is club-level, not account deletion."
    ]
  },
  {
    "id": "faq-application-blocked",
    "category": "FAQ",
    "title": "FAQ: Why can’t I apply to a race?",
    "subtitle": "Common application blockers.",
    "overview": "A race application can be blocked by the race status, deadlines, capacity or eligibility.",
    "details": [
      "Applications may not be open yet.",
      "Applications may already be closed.",
      "The race may be active, finished or cancelled.",
      "The race may be full.",
      "Your team may not match entry requirements.",
      "You may already have an application/entry."
    ],
    "tips": [
      "Open Race Detail and check entry rules."
    ]
  },
  {
    "id": "faq-accepted-not-ready",
    "category": "FAQ",
    "title": "FAQ: Why am I accepted but not ready?",
    "subtitle": "Accepted entry is not a complete race plan.",
    "overview": "Accepted means your team has a place; ready means riders, staff, assets, equipment, supplies and stage plans are usable.",
    "details": [
      "Race Plan still needs to be submitted.",
      "Stage Plans may still be missing.",
      "Supplies may be missing.",
      "Readiness may show problems.",
      "Deadlines may lock changes if missed."
    ],
    "tips": [
      "Open Race Preparation after every accepted race."
    ]
  },
  {
    "id": "faq-rider-underperformed",
    "category": "FAQ",
    "title": "FAQ: Why did my rider underperform?",
    "subtitle": "Performance has many causes.",
    "overview": "A strong rider can perform badly if the role, stage, condition, tactics or support were wrong.",
    "details": [
      "Check if the rider skills matched the terrain.",
      "Check fatigue and availability.",
      "Check morale and race sharpness.",
      "Check stage role and tactics.",
      "Check equipment and supplies.",
      "Check weather and incidents.",
      "Check staff/assets support."
    ],
    "tips": [
      "Use replay and commentary to learn."
    ]
  },
  {
    "id": "faq-money",
    "category": "FAQ",
    "title": "FAQ: Where did my money go?",
    "subtitle": "How to investigate balance changes.",
    "overview": "Finance Transactions is the source for balance movements.",
    "details": [
      "Open Finance → Transactions.",
      "Review salaries, tax, sponsor payments, transfers, equipment, infrastructure, camps and policies.",
      "Open Tax for monthly audit.",
      "Open Team Policies for recurring cost.",
      "Remember that loans are debt, not income."
    ],
    "tips": [
      "Transactions is the first page for finance questions."
    ]
  },
  {
    "id": "faq-equipment",
    "category": "FAQ",
    "title": "FAQ: Why is my equipment bonus small?",
    "subtitle": "Bonus caps and trade-offs.",
    "overview": "Equipment is weighted and capped so it supports but does not replace rider quality.",
    "details": [
      "Bonuses are weighted by category.",
      "Stage bonus is capped.",
      "Team/non-rider support is capped.",
      "Fatigue reduction is capped.",
      "Specialist gear can have negative trade-offs."
    ],
    "tips": [
      "Use the right setup for the right stage."
    ]
  },
  {
    "id": "faq-staff-hiring",
    "category": "FAQ",
    "title": "FAQ: Why can’t I hire staff?",
    "subtitle": "Common hiring blockers.",
    "overview": "Staff hiring depends on role capacity, availability and money.",
    "details": [
      "Check open slots for the role.",
      "Upgrade infrastructure if capacity is full.",
      "Check candidate availability.",
      "Check weekly salary and balance.",
      "Check whether the role is unlocked by facilities."
    ],
    "tips": [
      "Capacity problems usually point to Infrastructure."
    ]
  }

]

const manualCategories = Array.from(new Set(manualSections.map(section => section.category)))

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().trim()
}

function sectionMatchesQuery(section: ManualSection, query: string): boolean {
  const q = normalize(query)
  if (!q) return true

  const searchable = [
    section.category,
    section.title,
    section.subtitle,
    section.overview,
    ...(section.details ?? []),
    ...(section.tips ?? []),
    ...(section.facts ?? []).flatMap(fact => [fact.label, fact.value]),
    ...(section.relatedLinks ?? []).flatMap(link => [link.label, link.to]),
  ].map(normalize).join(' ')

  return searchable.includes(q)
}


function joinFactValues(section: ManualSection): string {
  const facts = section.facts ?? []

  if (facts.length === 0) {
    return 'The summary and rules in this section should be read together with the live page, because some values can depend on the current database configuration.'
  }

  return facts
    .map(fact => `${fact.label}: ${fact.value}`)
    .join('; ')
}

function getCategoryActionText(section: ManualSection): string {
  switch (section.category) {
    case 'Getting Started':
      return `Use this part of the manual as an orientation page, not as a button-by-button checklist only. When a new manager opens ${section.title}, the important idea is to understand the order of actions: first read the current game time and alerts, then inspect the squad, then choose races, then prepare the race, and only after that spend larger amounts of cash. Many mistakes in the game happen because a user clicks too quickly before understanding which deadline, rider status or finance rule is connected to that page.`

    case 'Coins and Account':
      return `Coins belong to the user account, while cash belongs to the club. Buttons such as Buy Now, Purchase History, Copy Invite Link or Share Invite Link are account-level actions. They do not directly buy riders or equipment. When a user clicks a coin package, the shop creates a checkout session and the result later appears in the coin ledger. When a user shares an invite link, the reward is only completed after the referred player finishes the required steps shown on the Invite Friends page.`

    case 'Club Identity':
      return `Club identity pages control what other managers see: team name, colors, logo, jersey, public profile and sponsor display name. Upload buttons validate image type and size before anything is saved. Save buttons persist the new identity through backend functions, so users should wait for the success state before leaving. If naming rights are active, some fields can be locked because the sponsor contract has temporary control over the public display name.`

    case 'Dashboard':
      return `Dashboard pages are navigation and decision pages. They collect data from many systems and turn it into alerts, counters, links and unread states. A user should not treat these cards as decoration. If a card contains a link, count, warning badge or unread badge, it usually means there is a page where action is needed. Open the linked page, solve the issue there, then return to Overview or Notifications to confirm the warning is gone.`

    case 'Riders':
      return `Rider and staff pages are about long-term squad quality. The buttons and tabs usually change the view rather than immediately changing the database. General, financial, skills and form views answer different questions: who is available, who is expensive, who fits a race profile, and who is improving or declining. Open rider profiles when a simple table row is not enough, especially before renewing, releasing, selling, promoting or selecting a rider for an important race.`

    case 'Training':
      return `Training controls development but also fatigue and risk. Intensity buttons are not just style choices: recovery protects riders, light training is safer, normal training is the standard option, and hard training should be used with a reason. Camp booking buttons should be used only after checking participants, staff, weather, quote, warnings and the race calendar, because a camp can become expensive or badly timed if it overlaps with race preparation.`

    case 'Equipment':
      return `Equipment pages are split between planning, buying, repairing and supply management. Market buttons buy new items, inventory buttons manage owned items, repair buttons quote maintenance, and race-supply purchase controls increase stock. Users should always check status and condition before clicking an action. Assigned items are normally unavailable because they are already connected to an event or plan, while worn items may still exist but can reduce readiness or create risk.`

    case 'Infrastructure':
      return `Infrastructure is a slow strategic system. Upgrade, delivery, repair, sell and cancel buttons usually create or modify jobs, not instant visual changes only. Every facility or asset action should be read as a financial and time decision: it costs cash now, can take game days, may use limited construction slots, and can unlock staff capacity or support effects later. The correct way to use this page is to read the quote, duration and result before confirming.`

    case 'Calendar and Races':
      return `Race and calendar pages connect the whole game together. Apply buttons, Race Detail links, Race Preparation links and stage-plan buttons all depend on game-time windows. Applying to a race is only the first step; it does not mean the team is ready to race. After acceptance, users still need to submit riders, staff, assets, equipment, supplies and stage tactics before the relevant deadlines.`

    case 'Rankings and Statistics':
      return `Ranking and statistics pages are analysis pages. Filters, tabs and division selectors help users compare teams and riders across the season. These pages usually do not change the club directly, but they should influence decisions: which races to target, which riders to buy, which rivals to watch, and whether promotion, playoff or relegation pressure requires a more aggressive strategy.`

    case 'Transfers':
      return `Transfer pages are negotiation systems, not simple shop pages. Buttons such as Make Offer, Open Negotiation, Submit Offer, Withdraw or Review should be used after checking market value, salary, age, role, scouting information, contract demands and club tier fit. A low transfer price can still be bad if the rider demands high wages, has poor fit, or is hidden behind uncertain scouting data.`

    case 'Finance':
      return `Finance pages explain whether the club can survive its decisions. Tabs such as Overview, Sponsors, Transactions, Tax and Team Policies answer different money questions. A manager should use Finance before confirming expensive transfers, training camps, infrastructure jobs, policy upgrades or equipment purchases. The safest habit is to check current balance, recurring costs, tax position and upcoming trip forecasts before spending.`

    case 'Support and Account':
      return `Support and account pages are practical management pages. Profile and Preferences change user settings, notification behavior or account-level options. Contact, Forum, Discord and bug-report tools are for help, community and issue reporting. Dangerous actions such as shutdown or restart should be read carefully because they can remove or reset important club data.`

    case 'FAQ':
      return `FAQ sections are designed for quick troubleshooting. When a user gets stuck, they should read the cause, then use the related page to verify the exact blocker. Most problems are not random bugs: they usually come from closed windows, missing money, full capacity, unavailable riders or staff, unprepared stage plans, missing supplies, locked assets or incomplete scouting.`

    default:
      return `This section explains how ${section.title} works inside the game. Read the summary first, then the facts, then the detailed rules below. The important goal is not only to know that the feature exists, but to understand when to use it, what the visible buttons change, what values matter, and what mistake the player should avoid.`
  }
}

function getSectionDecisionText(section: ManualSection): string {
  const factText = joinFactValues(section)

  return `Decision logic for this topic: start by checking the live values on the page, then compare them with the rules in this manual. For ${section.title}, the most important reference points are: ${factText}. If the live page shows a value that is different from the manual because the backend configuration changed, trust the live page for the exact number, but use the manual to understand why that value matters and how it affects the next decision.`
}

function getSectionMistakeText(section: ManualSection): string {
  switch (section.category) {
    case 'Equipment':
      return 'The most common equipment mistake is waiting until race day and discovering that the required gear, setup preset or supply stock is missing, worn, assigned or in maintenance. The correct habit is to check equipment after applying for important races, then again after the team is accepted, then once more before stage plans lock.'
    case 'Finance':
      return 'The most common finance mistake is looking only at current balance and ignoring future obligations. A club can look rich today and still be in danger if wages, tax, loan interest, policies, race logistics or camp costs arrive before the next income. Always think in future game days, not only the current screen.'
    case 'Calendar and Races':
      return 'The most common race mistake is believing that application or acceptance equals readiness. In this game, accepted races still need Race Plan and Stage Plans. A team with strong riders can perform badly or miss readiness if riders, staff, assets, supplies or tactics are incomplete.'
    case 'Transfers':
      return 'The most common market mistake is buying a rider because one number looks good. Always check age, role, salary, potential, fatigue, availability, scouting certainty, contract length and whether the rider fits the races you actually plan to enter.'
    case 'Training':
      return 'The most common training mistake is using hard intensity too often. Training is useful only if the rider can still race well afterwards. If fatigue rises too high, the short-term performance loss can be bigger than the long-term development gain.'
    case 'Infrastructure':
      return 'The most common infrastructure mistake is starting expensive upgrades without checking cash and construction timing. Infrastructure is powerful, but it pays back slowly. Build what solves a real bottleneck first, not only what looks impressive.'
    default:
      return `The most common mistake in this area is clicking a button without reading the connected status, deadline, cost or requirement. Before confirming an action in ${section.title}, check whether the page is showing a warning, disabled button, missing requirement, locked state or future deadline.`
  }
}

function getSectionGuideParagraphs(section: ManualSection): string[] {
  return [
    getCategoryActionText(section),
    getSectionDecisionText(section),
    getSectionMistakeText(section),
  ]
}

function getExpandedDetailExplanation(section: ManualSection, detail: string): string {
  const d = normalize(detail)
  const title = section.title

  if (d.includes('sold') || d.includes('discarded')) {
    return 'When an item is sold or discarded, the player should no longer plan around it. Hiding those rows from active inventory keeps the page focused on gear that can still affect races. This is important because old sold items could otherwise confuse the manager into thinking there is more available equipment than the team can actually use.'
  }

  if (d.includes('ready') && d.includes('worn')) {
    return 'Ready equipment is normally available for race use or management actions. Worn equipment is still present, but it is a warning state: the item may need repair before important events. The user should not simply ignore worn items because a worn setup can become a race-preparation weakness at exactly the wrong moment.'
  }

  if (d.includes('assigned')) {
    return 'Assigned means the item, rider or staff member is already connected to another plan, event or job. In practice, this is a protection rule. It prevents the same resource from being used in two places at the same time. If a button is disabled because something is assigned, first find the active race, camp, repair job or plan that is holding it.'
  }

  if (d.includes('repair quote') || d.includes('quote')) {
    return 'A quote is the safe step before a permanent action. It explains the cost, permission and sometimes the reason why an action is blocked. Users should read the quote instead of guessing. If the quote says the action is not allowed, the reason text usually points to the real blocker, such as assignment lock, condition, missing money, or status.'
  }

  if (d.includes('condition')) {
    return 'Condition should be treated like readiness. A high-condition item is safer to rely on in key races. A low-condition item may still appear in the inventory, but it creates a planning risk. The best habit is to repair important equipment before stage races or sponsor-target races rather than reacting after the problem appears.'
  }

  if (d.includes('bidons') || d.includes('gels') || d.includes('nutrition')) {
    return 'These supplies are connected to stage-level rider support. They look small individually, but across seven or more riders and multiple stages they can disappear quickly. Users should calculate stock by race size: selected riders multiplied by stages, then adjusted by the selected per-rider quantity.'
  }

  if (d.includes('jersey') || d.includes('rain jackets') || d.includes('rain jacket')) {
    return 'Durable race supplies behave differently from one-use consumables. They are not consumed instantly, but they have limited stage uses. This means the manager should check usable units, worn-out units and remaining uses before a race, especially before long tours where the same equipment may be needed repeatedly.'
  }

  if (d.includes('sponsor') || d.includes('objectives')) {
    return 'Sponsor information should be read before signing or targeting races. Guaranteed money is only one part of the deal. Objectives, bonus pools, technical discounts, naming-rights locks and deadlines can change what the club should do during the season. A good sponsor deal fits the team calendar and squad strength.'
  }

  if (d.includes('tax')) {
    return 'Tax is not optional background text. It is part of the finance system and can change the real value of income. When income rises from sponsors, prizes or bonuses, the manager should expect tax withholding or monthly adjustment rows and should use the Tax tab to understand the final cash position.'
  }

  if (d.includes('deadline') || d.includes('window')) {
    return 'Windows and deadlines are strict because the race engine and season systems need stable data before simulation. If a deadline passes, the user may lose the chance to edit a plan, apply for a race, move a rider or submit a roster. Always compare the page date with the footer game time.'
  }

  if (d.includes('training') || d.includes('fatigue')) {
    return 'Training and fatigue must be balanced together. The manager is not trying to maximize every training session; the manager is trying to arrive at important races with riders who are both improving and fresh enough to perform. If fatigue rises too high, reduce intensity or plan recovery.'
  }

  if (d.includes('scout') || d.includes('scouting')) {
    return 'Scouting reduces uncertainty. A player should treat unscouted external riders as incomplete information, not as confirmed values. Scout reports make transfer decisions safer because they reveal or estimate overall, potential, strengths and other hidden information with a precision level.'
  }

  if (d.includes('cash') || d.includes('cost') || d.includes('salary') || d.includes('balance')) {
    return 'Any mention of cost should be connected to the Finance page. The user should ask: is this a one-time cost, a weekly cost, a monthly cost, a per-trip cost, or a seasonal cost? The difference matters because recurring costs can quietly create more danger than a single purchase.'
  }

  if (d.includes('role') || d.includes('skills') || d.includes('overall')) {
    return 'Roles and skills should be matched to the race profile. Overall is useful for a quick comparison, but sprint, climbing, time trial, flat, endurance, recovery, resistance, race IQ and teamwork decide how a rider performs in specific situations. Pick riders for the route, not only for the highest number.'
  }

  if (d.includes('replay') || d.includes('results') || d.includes('classification')) {
    return 'Replay and results should be read as an explanation of what happened, not only as a final ranking. Groups, gaps, points, bonus seconds, stage results and classifications can tell the user whether the team tactic worked, whether a rider was isolated, or whether the next race plan should change.'
  }

  return `In practical terms, this means the user should connect this rule to the visible controls on the ${title} page. Read the status first, then check whether the button is enabled, then understand what will change after clicking it. If the page shows a warning, disabled state, date, cost, count or requirement, that information is usually more important than the button label itself.`
}

export default function ManualPage(): JSX.Element {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(() => new Set())

  const filteredSections = useMemo(() => {
    return manualSections.filter(section => {
      const matchesCategory = category === 'all' || section.category === category
      const matchesQuery = sectionMatchesQuery(section, query)
      return matchesCategory && matchesQuery
    })
  }, [category, query])

  const visibleCountLabel = filteredSections.length === 1 ? '1 section' : `${filteredSections.length} sections`

  function toggleSection(sectionId: string): void {
    setOpenSectionIds(current => {
      const next = new Set(current)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  function openVisibleSections(): void {
    setOpenSectionIds(current => {
      const next = new Set(current)
      filteredSections.forEach(section => next.add(section.id))
      return next
    })
  }

  function closeAllSections(): void {
    setOpenSectionIds(new Set())
  }

  function handlePrint(): void {
    setOpenSectionIds(current => {
      const next = new Set(current)
      filteredSections.forEach(section => next.add(section.id))
      return next
    })

    window.setTimeout(() => {
      window.print()
    }, 150)
  }

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 p-6 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-yellow-300">Manual</p>

        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
          ProPeloton Manager Manual
        </h1>

        <p className="mt-3 max-w-5xl text-sm leading-relaxed text-slate-100 md:text-base">
          This expanded manual is a deep player reference for ProPeloton Manager. It covers
          account pages, coins, referrals, club identity, dashboard navigation, notifications,
          riders, staff, training, camps, equipment, infrastructure, calendar, race detail,
          race preparation, replay, rankings, statistics, transfers, scouting, finance,
          sponsors, taxes, policies, liquidation and FAQ topics. Sections are closed by
          default, so open only the topic you need.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {manualSections.length} sections
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {manualCategories.length} categories
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            All sections closed by default
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/help"
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Back to Help
          </Link>

          <button
            type="button"
            onClick={handlePrint}
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Print / Save as PDF
          </button>

          <a
            href="https://discord.gg/9W6rSSjm"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Ask on Discord
          </a>
        </div>
      </section>

      <section className="rounded-xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Start here</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          New managers should first read <strong>Quick Start</strong>, <strong>Game Time</strong>,{' '}
          <strong>Overview</strong>, <strong>Squad</strong>, <strong>Training</strong>,{' '}
          <strong>Race Preparation</strong> and <strong>Finance</strong>. Experienced managers can use
          search for specific topics like sponsor naming rights, race supplies, playoffs,
          tax audits, emergency rescues or developing-team movement windows.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Search manual</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search coins, sponsors, race preparation, tax, equipment..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              value={category}
              onChange={event => setCategory(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
            >
              <option value="all">All categories</option>
              {manualCategories.map(categoryName => (
                <option key={categoryName} value={categoryName}>
                  {categoryName}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openVisibleSections}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              Open visible
            </button>

            <button
              type="button"
              onClick={closeAllSections}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              Close all
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-slate-500">Showing {visibleCountLabel}.</div>
      </section>

      <section className="space-y-3">
        {filteredSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">No manual sections found</h2>
            <p className="mt-2 text-sm text-slate-500">
              Try a different search term or switch category back to all.
            </p>
          </div>
        ) : (
          filteredSections.map(section => {
            const isOpen = openSectionIds.has(section.id)

            return (
              <article
                key={section.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-yellow-400"
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0">
                    <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800">
                      {section.category}
                    </span>
                    <span className="mt-2 block text-base font-semibold text-slate-900">
                      {section.title}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                      {section.subtitle}
                    </span>
                  </span>

                  <span className="shrink-0 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {isOpen ? 'Close' : 'Open'}
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-slate-100 px-5 py-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">
                        {section.overview}
                      </p>
                    </div>

                    {section.facts && section.facts.length > 0 ? (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {section.facts.map(fact => (
                          <div
                            key={`${section.id}:${fact.label}:${fact.value}`}
                            className="rounded-xl border border-slate-200 bg-white p-4"
                          >
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              {fact.label}
                            </div>
                            <div className="mt-2 text-sm font-medium leading-relaxed text-slate-900">
                              {fact.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                      <h3 className="text-sm font-semibold text-slate-900">Detailed explanation</h3>
                      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                        {getSectionGuideParagraphs(section).map(paragraph => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 space-y-4 text-sm leading-7 text-slate-700">
                      {section.details.map((paragraph, index) => (
                        <div
                          key={paragraph}
                          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Rule {index + 1}
                          </div>
                          <p className="mt-2 font-semibold text-slate-900">{paragraph}</p>
                          <p className="mt-2 text-slate-700">
                            {getExpandedDetailExplanation(section, paragraph)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {section.tips && section.tips.length > 0 ? (
                      <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                        <h3 className="text-sm font-semibold text-slate-900">Practical tips</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
                          {section.tips.map(tip => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {section.relatedLinks && section.relatedLinks.length > 0 ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {section.relatedLinks.map(link => (
                          <Link
                            key={`${section.id}:${link.to}:${link.label}`}
                            to={link.to}
                            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
        <h2 className="text-lg font-semibold">Manual maintenance note</h2>
        <p className="mt-2 max-w-5xl text-sm leading-relaxed text-slate-200">
          This manual is a deep first version based on the current pages and systems.
          Exact values that are loaded from the database, such as live coin package prices,
          some policy option costs, camp quotes, sponsor offer values and infrastructure costs,
          should always be trusted from the live page if the backend config changes.
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/contact-us"
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Contact Us
          </Link>

          <a
            href="https://discord.gg/9W6rSSjm"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Ask on Discord
          </a>
        </div>
      </section>
    </div>
  )
}
