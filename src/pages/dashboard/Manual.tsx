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
import { useTranslation } from 'react-i18next'
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
  },

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
        "label": "First Squad max",
        "value": "18 riders"
      },
      {
        "label": "Views",
        "value": "General, Financial, Skills, Form & Development"
      }
    ],
    "details": [
      "General shows identity, role, age, overall and status.",
      "Financial shows salary, market value and contract data.",
      "Skills shows specialist attributes.",
      "Form & Development shows fatigue, morale, availability, potential and related development information.",
      "The dashboard summary can show wins, podiums, top 10s, last race and next race selection."
    ],
    "tips": [
      "Open rider profile before important decisions."
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
    "title": "Rider Skills and Specialist Meaning",
    "subtitle": "How attributes should be interpreted.",
    "overview": "Overall is a summary. Specialist skills decide what a rider can do in specific races and situations.",
    "facts": [
      {
        "label": "Attributes",
        "value": "Sprint, climbing, time trial, endurance, flat, recovery, resistance, race IQ, teamwork"
      },
      {
        "label": "Other important values",
        "value": "Potential, morale, fatigue, race sharpness"
      }
    ],
    "details": [
      "Sprint matters most in fast finishes and sprint roles.",
      "Climbing matters on mountain and uphill profiles.",
      "Time Trial matters in ITT/TTT situations.",
      "Endurance helps on long days and long races.",
      "Flat helps on flat roads, positioning and steady speed.",
      "Recovery is especially important during stage races.",
      "Resistance supports hard sustained effort.",
      "Race IQ represents tactical decision quality.",
      "Teamwork helps riders support team plans."
    ],
    "tips": [
      "Build a balanced squad instead of buying only high-overall riders."
    ]
  },
  {
    "id": "rider-profile-deep",
    "category": "Riders",
    "title": "Rider Profile Deep Guide",
    "subtitle": "Own rider, external rider, compare and history views.",
    "overview": "The rider profile changes depending on whether the rider belongs to your club or is external.",
    "facts": [
      {
        "label": "Own tabs",
        "value": "Overview, Contract, Training, Compare, History"
      },
      {
        "label": "External behavior",
        "value": "Can hide exact attributes until scouting exists"
      }
    ],
    "details": [
      "Overview shows identity, fitness, readiness, key skills and club information.",
      "Contract shows contract status and negotiation/release actions for owned riders.",
      "Training shows current training information for owned riders.",
      "Compare opens a side-by-side rider comparison route.",
      "History can show season/race history and career information.",
      "External profiles can show Scout report actions and market status."
    ],
    "tips": [
      "Do not rely on exact external attributes until scouting confirms them."
    ]
  },
  {
    "id": "fitness-health-deep",
    "category": "Riders",
    "title": "Fitness, Fatigue, Injury and Illness",
    "subtitle": "Why a strong rider can still be a poor selection.",
    "overview": "Availability and fatigue can reduce practical race value even when overall and skills are high.",
    "facts": [
      {
        "label": "Availability",
        "value": "Fit, not fully fit, injured, sick"
      },
      {
        "label": "Fatigue",
        "value": "Represents accumulated tiredness and stress"
      }
    ],
    "details": [
      "A fit rider can still have high fatigue.",
      "Injured or sick riders require medical recovery rather than normal race selection.",
      "Not fully fit means the rider may race but is not at ideal readiness.",
      "Hard training and heavy race calendars both increase overload risk.",
      "Medical staff and recovery systems can improve handling of health problems."
    ],
    "tips": [
      "Protect key riders before important stage races."
    ]
  },
  {
    "id": "race-sharpness-deep",
    "category": "Riders",
    "title": "Race Sharpness",
    "subtitle": "Racing rhythm versus overload.",
    "overview": "Race sharpness rewards useful racing rhythm but should be balanced with fatigue and freshness.",
    "facts": [
      {
        "label": "Too little racing",
        "value": "Can reduce competitive sharpness"
      },
      {
        "label": "Too much racing",
        "value": "Can create fatigue and overload"
      }
    ],
    "details": [
      "Race sharpness is not the same as training fitness.",
      "A rested rider may still lack race rhythm.",
      "A sharp rider may still be too fatigued to perform well.",
      "The best state depends on the next target race and rider role."
    ],
    "tips": [
      "Use smaller races to prepare key riders when appropriate."
    ]
  },
  {
    "id": "contracts-renewals-release",
    "category": "Riders",
    "title": "Rider Contracts, Renewal and Release",
    "subtitle": "How owned rider contracts are managed.",
    "overview": "Owned rider profiles include contract data and may allow renewal, release or transfer-related actions.",
    "facts": [
      {
        "label": "Contract fields",
        "value": "Salary, start season, end season, status"
      },
      {
        "label": "Decision factors",
        "value": "Salary, duration, club/tier interest and rider willingness"
      }
    ],
    "details": [
      "Renewals should be considered before the contract gets too close to expiry.",
      "Long contracts reduce immediate expiry risk but create salary commitments.",
      "Releasing a rider can have financial or squad consequences.",
      "Transfer-listed riders follow the transfer negotiation flow instead of simple release.",
      "Keep First Squad capacity in mind before signing new riders."
    ],
    "tips": [
      "Check Financial View and rider profile together before renewal."
    ]
  },
  {
    "id": "developing-team-deep",
    "category": "Riders",
    "title": "Developing Team Deep Guide",
    "subtitle": "Purchase, status, roster and movement-window rules.",
    "overview": "The development squad is managed separately but stays connected to the main club and account.",
    "facts": [
      {
        "label": "Roster max",
        "value": "8"
      },
      {
        "label": "Movement",
        "value": "Only during open movement windows"
      },
      {
        "label": "Older rider warning",
        "value": "Age 24+"
      }
    ],
    "details": [
      "Purchase status is loaded from the backend and depends on requirements and coin balance.",
      "The main club context is restored after buying the development team.",
      "Promoting a rider requires both an open movement window and free First Squad capacity.",
      "Age 24+ riders should be moved when the game allows it.",
      "If a window is closed, the UI can warn users to act in the next window."
    ],
    "tips": [
      "Plan movement before the age warning becomes urgent."
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
    "title": "Staff Roles Deep Guide",
    "subtitle": "What each staff position contributes.",
    "overview": "Staff roles support different parts of rider development, race preparation, medical care, scouting and equipment.",
    "facts": [
      {
        "label": "Performance roles",
        "value": "Head Coach, Trainer, Sport Director"
      },
      {
        "label": "Medical roles",
        "value": "Team Doctor, Physio, Nutritionist"
      },
      {
        "label": "Technical/knowledge roles",
        "value": "Mechanic, Scout / Analyst, U23 Head Coach"
      }
    ],
    "details": [
      "Head Coach leads training quality and development.",
      "Trainers expand coaching support and rider capacity.",
      "Sport Director supports tactics, stage plans and race preparation suggestions.",
      "Team Doctor and Physio support health and recovery.",
      "Nutritionist supports nutrition/recovery systems.",
      "Mechanic supports repairs and technical systems.",
      "Scout / Analyst supports external rider information.",
      "U23 Head Coach supports developing-team riders."
    ],
    "tips": [
      "Hire the staff role that solves the current club bottleneck."
    ]
  },
  {
    "id": "staff-capacity-deep",
    "category": "Riders",
    "title": "Staff Capacity and Infrastructure",
    "subtitle": "Why a staff role can be locked even when you have cash.",
    "overview": "Staff capacity is connected to facilities. Infrastructure upgrades can unlock more staff positions.",
    "facts": [
      {
        "label": "Training staff",
        "value": "Connected to Training Center / Club House rules"
      },
      {
        "label": "Medical staff",
        "value": "Connected to Medical Center"
      },
      {
        "label": "Mechanics",
        "value": "Connected to Mechanics Workshop"
      },
      {
        "label": "Scouting",
        "value": "Connected to Scouting Office"
      }
    ],
    "details": [
      "A staff market offer is not enough if the role capacity is already full.",
      "Infrastructure pages show used and max slots for staff groups.",
      "Upgrade plans should consider both immediate benefits and future hiring needs.",
      "Hiring without checking capacity can waste planning time."
    ],
    "tips": [
      "Check Infrastructure before hiring an extra staff member."
    ]
  },
  {
    "id": "staff-courses-deep",
    "category": "Riders",
    "title": "Staff Courses",
    "subtitle": "Temporary staff development jobs.",
    "overview": "Staff courses cost money, take game days and can improve selected staff attributes.",
    "facts": [
      {
        "label": "Course data",
        "value": "Title, category, duration, cost and attribute gains"
      },
      {
        "label": "Course states",
        "value": "Active and recently completed"
      }
    ],
    "details": [
      "Only eligible staff should start a course.",
      "The course detail preview should be checked before paying.",
      "Active courses show progress and remaining/completion information.",
      "Completed courses can be shown in recent history.",
      "Course costs should be planned with Finance."
    ],
    "tips": [
      "Train valuable long-term staff, not every temporary hire."
    ]
  },
  {
    "id": "regular-training-deep",
    "category": "Training",
    "title": "Regular Training Deep Guide",
    "subtitle": "Team default training, individual plans and intensity.",
    "overview": "Regular training is the normal ongoing development system for riders outside camps.",
    "facts": [
      {
        "label": "Focuses",
        "value": "General, recovery, sprint, climbing, flat, time trial, endurance, resistance, race IQ, teamwork"
      },
      {
        "label": "Intensity",
        "value": "Recovery, light, normal, hard"
      }
    ],
    "details": [
      "Team defaults give the squad a baseline training approach.",
      "Individual plans override the team default when a rider needs specialist work.",
      "Hard intensity increases training stress and fatigue risk.",
      "Recovery intensity is useful around hard race blocks.",
      "Training should follow rider role and calendar targets."
    ],
    "tips": [
      "Do not use Hard as the permanent default for the whole squad."
    ]
  },
  {
    "id": "training-camps-deep",
    "category": "Training",
    "title": "Training Camps Deep Guide",
    "subtitle": "Camp locations, quotes, weather and booking logic.",
    "overview": "Training camps are stronger planned development blocks with travel, accommodation, camp fees and special training effects.",
    "facts": [
      {
        "label": "Camp types",
        "value": "General, sprint, climbing, flat, time trial"
      },
      {
        "label": "Quote components",
        "value": "Travel, accommodation, camp fee, logistics, total cost"
      },
      {
        "label": "Weather",
        "value": "Can change modifier, missed-day chance and warnings"
      }
    ],
    "details": [
      "Camp locations have quality, altitude, terrain and calendar preferences.",
      "Preferred weeks can improve the camp experience while risky weeks can reduce it.",
      "Closed weeks prevent booking.",
      "Quotes should be reviewed before committing because travel and accommodation can be large costs.",
      "Weather can reduce training value or create missed sessions.",
      "Staff and rider selection influence the camp outcome."
    ],
    "tips": [
      "Book camps around major targets, not randomly."
    ]
  },
  {
    "id": "current-camp-deep",
    "category": "Training",
    "title": "Current Training Camp",
    "subtitle": "How to read an active camp page.",
    "overview": "An active camp page shows participants, staff, weather, training plan, daily reports and progress.",
    "facts": [
      {
        "label": "Participants",
        "value": "Selected riders and assigned staff"
      },
      {
        "label": "Plan",
        "value": "Day off, light, normal or hard for camp days"
      },
      {
        "label": "Reports",
        "value": "Completed-day gains and fatigue effects"
      }
    ],
    "details": [
      "The current camp page should be used to monitor what is actually happening, not only the original booking quote.",
      "Weather and staff effects can change effective training quality.",
      "Daily reports show completed sessions and rider impact.",
      "Upcoming training plan should be adjusted only when the game allows it.",
      "Camp fatigue should be considered before the next race."
    ],
    "tips": [
      "After camp, give riders enough recovery before key races."
    ]
  },

  {
    "id": "equipment-category-deep",
    "category": "Equipment",
    "title": "Equipment Categories and Terrain Bonuses",
    "subtitle": "What each durable equipment category contributes to race performance.",
    "overview": "Equipment is split into durable categories. Each item can carry quality, terrain bonuses, fatigue-reduction value, condition and status. The best item is not always the one with the highest price; it is the one that fits the race profile and the setup you actually plan to use.",
    "facts": [
      { "label": "Durable categories", "value": "Frame, wheelset, tires, groupset, helmet, shoes" },
      { "label": "Terrain bonuses", "value": "Flat, hilly, mountain, cobble, time trial, sprint" },
      { "label": "Extra effect", "value": "Fatigue reduction" },
      { "label": "Quality labels", "value": "Basic, Good, Super" }
    ],
    "details": [
      "Frames are the foundation of a setup and can support different terrain strengths depending on the item.",
      "Wheelsets can strongly affect flat, climbing or time-trial performance, so they should be matched to the course rather than used blindly in every event.",
      "Tires matter especially when surface and terrain change. Cobbles and bad weather can make tire choice more important than on a normal flat stage.",
      "Groupsets support drivetrain efficiency and can contribute to terrain-specific bonuses depending on the market item.",
      "Helmets and shoes are smaller parts of the setup but still contribute bonuses and can matter when the whole setup is optimized.",
      "Fatigue-reduction bonuses are useful when the rider needs to preserve energy across long stages or multi-day races.",
      "A specialized setup can be stronger than a generic setup even if one individual item has a lower headline rating."
    ],
    "tips": [
      "Create at least one sprint/flat setup, one mountain setup and one time-trial setup when your inventory allows it.",
      "Check the stage profile before choosing equipment."
    ],
    "relatedLinks": [
      { "label": "Equipment", "to": "/dashboard/equipment" }
    ]
  },
  {
    "id": "equipment-caps-deep",
    "category": "Equipment",
    "title": "Equipment Bonus Caps and Setup Logic",
    "subtitle": "Why stacking every bonus does not create unlimited performance gains.",
    "overview": "Equipment bonuses are useful but should stay inside the game’s designed limits. A setup is a package of equipment for a race type, and the manager should think about the combined effect instead of chasing one number without context.",
    "facts": [
      { "label": "Setup use", "value": "Default Race Setup plus saved specialized setup presets" },
      { "label": "Common presets", "value": "Sprint, mountain, time trial, cobbled / specialist race setups" },
      { "label": "Important limitation", "value": "Equipment bonuses are capped / bounded by the game system" }
    ],
    "details": [
      "The Default Race Setup is used when no race-specific setup is selected.",
      "Saved setup presets help managers avoid rebuilding the same combination before every race.",
      "Terrain bonuses should be read as support for rider performance, not as a replacement for rider skill.",
      "If several items provide the same type of bonus, the game can limit the total useful effect. Managers should therefore build balanced setups rather than assuming every extra point stacks forever.",
      "A rider still needs the correct specialist attributes. Mountain equipment does not turn a weak climber into an elite climber.",
      "Setup quality should also consider condition. A strong but worn item may be a worse practical choice than a slightly weaker item in good condition."
    ],
    "tips": [
      "Think in complete setups, not isolated items.",
      "Keep backup equipment for important race blocks."
    ]
  },
  {
    "id": "equipment-inventory-deep",
    "category": "Equipment",
    "title": "Equipment Inventory, Condition and Actions",
    "subtitle": "Ready, assigned, maintenance and worn states plus repair/sell/discard rules.",
    "overview": "Inventory shows equipment that the club still owns and can potentially use. Status and condition decide which actions are available.",
    "facts": [
      { "label": "Common statuses", "value": "Ready, Assigned, In Maintenance, Worn" },
      { "label": "Active inventory", "value": "Sold and discarded items are hidden from normal active inventory" },
      { "label": "Typical repair threshold", "value": "Condition 90% or lower when the item is otherwise eligible" }
    ],
    "details": [
      "Ready items can normally be assigned to setups and can also become eligible for repair, sale or discard depending on condition and other rules.",
      "Assigned items are currently in use or reserved by another game system. They should be freed before actions that would make them unavailable.",
      "In Maintenance means the item is already being repaired and cannot be used normally until maintenance finishes.",
      "Worn means condition has dropped enough that the item needs attention. Worn items can reduce reliability and should not be ignored before important races.",
      "Repair quotes should show the cost before confirmation. The manager should compare repair cost with item value and replacement cost.",
      "Selling converts an owned item into cash when sale is allowed. The item then leaves active inventory.",
      "Discarding removes an item without a normal sale. This should be used only for gear the club no longer needs or cannot justify keeping."
    ],
    "tips": [
      "Repair important items before critical races.",
      "Do not sell assigned gear without first changing the setup that uses it."
    ]
  },
  {
    "id": "race-supplies-deep",
    "category": "Equipment",
    "title": "Race Supplies Deep Guide",
    "subtitle": "How consumables and durable stage supplies are counted and used.",
    "overview": "Race Supplies connect Equipment with Race Preparation. The manager buys stock in advance, then Stage Plans consume or allocate the required amount per rider and per stage.",
    "facts": [
      { "label": "Bidons / Water Bottles", "value": "1–4 per rider; one-use consumable" },
      { "label": "Energy Gels", "value": "0–4 per rider; one-use consumable" },
      { "label": "Nutrition Packs", "value": "0–2 per rider; one-use consumable" },
      { "label": "Race Jersey Complete", "value": "Mandatory durable item; 10 stage uses per unit" },
      { "label": "Rain Jackets", "value": "Optional weather item; 25 stage uses per unit" }
    ],
    "details": [
      "Bidons support hydration and fatigue control. A stage plan below the required hydration minimum can increase fatigue pressure.",
      "Energy Gels support stamina and final-effort efficiency. More than the useful cap does not create extra benefit.",
      "Nutrition Packs support stamina stability and recovery, especially on long stages and stage races.",
      "Race Jersey Complete is mandatory. A team without enough usable jersey stage-uses can be blocked from having a complete stage setup.",
      "Rain Jackets are not mandatory on every stage but become valuable in cold/wet weather. The game should treat worn-out durable supply units as unusable.",
      "Stage races multiply consumption because supplies are calculated per rider per stage. A stock that looks large for a one-day race may be too small for a seven-stage race."
    ],
    "tips": [
      "Calculate stock before rider-submission and stage-plan deadlines.",
      "Do not assume yesterday’s stock is still enough after several stages."
    ],
    "relatedLinks": [
      { "label": "Race Supplies", "to": "/dashboard/equipment?tab=race-supplies" },
      { "label": "Race Preparation", "to": "/dashboard/race-preparation" }
    ]
  },
  {
    "id": "technical-sponsor-deep",
    "category": "Equipment",
    "title": "Technical Sponsor Equipment Support",
    "subtitle": "Cash support, equipment budget and market discounts from a technical sponsor.",
    "overview": "Technical sponsors are different from normal main/secondary sponsors because they can directly support the equipment system.",
    "facts": [
      { "label": "Possible support", "value": "Cash support, equipment support budget, category discounts" },
      { "label": "Applies to", "value": "Selected equipment categories / eligible market purchases" },
      { "label": "Practical effect", "value": "Lower purchase cost and easier equipment development" }
    ],
    "details": [
      "A technical sponsor can provide direct cash support and a separate equipment-support budget.",
      "Category discounts can reduce the effective purchase cost of eligible market items.",
      "The manager should check sponsor support before buying expensive equipment because the same item may cost less while the technical deal is active.",
      "Technical sponsor value should be compared with the club’s actual equipment needs. A large discount is less useful if the discounted category is already strong.",
      "Sponsor support can improve long-term equipment planning but does not remove condition, maintenance or inventory limits."
    ],
    "tips": [
      "Buy important eligible equipment while useful sponsor discounts are active.",
      "Do not evaluate technical sponsors only by guaranteed cash."
    ]
  },
  {
    "id": "facilities-overview-deep",
    "category": "Infrastructure",
    "title": "Facilities Deep Guide",
    "subtitle": "Club House, Training Center, Medical Center, Youth Academy, Workshop and Scouting Office.",
    "overview": "Facilities are permanent long-term investments that unlock capacity and improve the club’s ability to train, heal, scout, repair and develop riders.",
    "facts": [
      { "label": "Club House max", "value": "Level 5" },
      { "label": "Training Center max", "value": "Level 5" },
      { "label": "Medical Center max", "value": "Level 5" },
      { "label": "Youth Academy max", "value": "Level 2" },
      { "label": "Mechanics Workshop max", "value": "Level 4" },
      { "label": "Scouting Office max", "value": "Level 4" }
    ],
    "details": [
      "Club House supports administration and broader club organization. It can also act as a prerequisite for other systems.",
      "Training Center improves training quality, coaching effectiveness and development support.",
      "Medical Center increases medical staff capacity and improves injury/recovery support.",
      "Youth Academy supports U23/development systems and future youth-related functionality.",
      "Mechanics Workshop improves repairs and technical staff capacity.",
      "Scouting Office improves scouting capacity and report-quality limits.",
      "Facility upgrades cost cash, take game days and use construction capacity."
    ],
    "tips": [
      "Upgrade the facility that solves the current bottleneck.",
      "Do not upgrade everything at once if Finance cannot support it."
    ],
    "relatedLinks": [
      { "label": "Infrastructure", "to": "/dashboard/infrastructure" }
    ]
  },
  {
    "id": "facility-jobs-deep",
    "category": "Infrastructure",
    "title": "Infrastructure Jobs, Quotes and Construction Slots",
    "subtitle": "How upgrades, repairs and cancellations work over game time.",
    "overview": "Infrastructure actions are not instant. Jobs have cost, duration, start/completion game dates and can use limited construction slots.",
    "facts": [
      { "label": "Job data", "value": "Cost, duration, start date, completion date, status" },
      { "label": "Capacity", "value": "Construction slots can limit simultaneous projects" },
      { "label": "Cancellation", "value": "Uses a quote/refund rule when cancellation is allowed" }
    ],
    "details": [
      "Before starting a facility upgrade, the page should show whether prerequisites and cash requirements are satisfied.",
      "An active job occupies a construction slot until completion or successful cancellation.",
      "The completion date is an in-game date. The manager should compare it with the footer game time and future calendar plans.",
      "Cancellation can return only part of the paid value. The quote should be reviewed before confirming.",
      "A long upgrade can delay access to staff capacity or bonuses, so timing matters as much as price."
    ],
    "tips": [
      "Start long jobs when the club can live without the missing upgrade for several game days.",
      "Keep cash for salaries and tax while construction is active."
    ]
  },
  {
    "id": "assets-deep",
    "category": "Infrastructure",
    "title": "Race Assets and Support Vehicles",
    "subtitle": "Team cars, bus, equipment van, mobile workshop and medical van.",
    "overview": "Assets are club-owned support resources. They can be assigned to race plans and have condition, status, purchase value, repair cost and sale value.",
    "facts": [
      { "label": "Asset types", "value": "Team Cars, Team Bus, Equipment Van, Mobile Workshop, Medical Van" },
      { "label": "Important values", "value": "Condition, status, purchase cost, repair quote, sale quote" },
      { "label": "Race use", "value": "Selected in Race Plan logistics/support" }
    ],
    "details": [
      "Team Cars support race operations and can be required in different quantities depending on the plan.",
      "Team Bus supports transport and team logistics.",
      "Equipment Van supports equipment movement and race setup logistics.",
      "Mobile Workshop provides technical support during racing/travel.",
      "Medical Van provides extra medical support.",
      "Assigned or locked assets should not be repaired or sold until they are released from the race/job that uses them.",
      "Condition should be checked before important races because a technically available asset can still be in poor shape."
    ],
    "tips": [
      "Repair support assets before important race blocks.",
      "Do not sell an asset that is required by an upcoming Race Plan."
    ]
  },
  {
    "id": "season-calendar-deep",
    "category": "Calendar and Races",
    "title": "Season Calendar Deep Guide",
    "subtitle": "Day-by-day view of races, camps, events and holidays.",
    "overview": "Season Calendar is the broad time-planning view. It helps the manager understand what is happening around the club across game days rather than looking only at individual races.",
    "facts": [
      { "label": "Filters", "value": "Races, Training Camps, Events, Holidays" },
      { "label": "Main purpose", "value": "Long-term scheduling and deadline awareness" },
      { "label": "Time source", "value": "In-game calendar date" }
    ],
    "details": [
      "Race dates should be read together with application and rider-submission deadlines.",
      "Training camps occupy time and can conflict with important race preparation if scheduled badly.",
      "Events and holidays can affect how the game world is presented or how certain systems are scheduled.",
      "The calendar is the best place to check whether several important actions are happening close together.",
      "Use the footer game time as the current-day reference and Calendar as the future-plan reference."
    ],
    "tips": [
      "Plan at least several game days ahead.",
      "Avoid putting camps immediately before key races unless recovery is planned."
    ],
    "relatedLinks": [
      { "label": "Calendar", "to": "/dashboard/calendar" }
    ]
  },
  {
    "id": "race-calendar-deep",
    "category": "Calendar and Races",
    "title": "Race Calendar, Applications and Entry Status",
    "subtitle": "How teams find races and move from application to accepted entry.",
    "overview": "Race Calendar shows available races and the current application state. Acceptance is only the first step; the team must later complete rider selection and race preparation.",
    "facts": [
      { "label": "Common statuses", "value": "Not open, open, closed, race active, race finished, cancelled" },
      { "label": "Race data", "value": "Category, country, city, date, race type, team limits, accepted teams" },
      { "label": "Important next step", "value": "Accepted team must still complete Race Plan / Stage Plans" }
    ],
    "details": [
      "Applications are available only inside the race application window.",
      "The race can restrict eligible teams by tier, division or other entry rules.",
      "The manager should check how many teams can be accepted and how many have already applied/been accepted.",
      "A closed application window cannot be reopened by the player.",
      "When accepted, the race becomes relevant on Race Preparation and later rider-submission deadlines.",
      "Do not confuse Accepted with Ready. Accepted only means the club has a place in the event."
    ],
    "tips": [
      "Apply early when the race is important.",
      "After acceptance, immediately check Race Preparation deadlines."
    ],
    "relatedLinks": [
      { "label": "Calendar", "to": "/dashboard/calendar" },
      { "label": "Race Preparation", "to": "/dashboard/race-preparation" }
    ]
  },
  {
    "id": "race-detail-deep",
    "category": "Calendar and Races",
    "title": "Race Detail Deep Guide",
    "subtitle": "Entry rules, stages, participants, results, classifications and live state.",
    "overview": "Race Detail is the main reference page for a specific event. Before the race it explains the route and rules. During/after the race it becomes the result and replay hub.",
    "facts": [
      { "label": "Before race", "value": "Rules, application, participant and stage information" },
      { "label": "During race", "value": "Live state / replay / commentary when available" },
      { "label": "After race", "value": "Stage results and classifications" }
    ],
    "details": [
      "Entry information can include max teams, riders per team, application deadline, team list announcement, rider submission deadline and prize fund.",
      "Participant lists show which teams were accepted and later which riders are on the start list.",
      "Stage lists show route, terrain, distance, finish type, profile and weather information.",
      "A stage race can maintain General, Points, Mountain, Young and Team classifications.",
      "Race Detail should be used to verify official result data instead of relying only on a notification or Overview card.",
      "Finished races remain important because they contribute to rider/team statistics and ranking points."
    ],
    "tips": [
      "Open Race Detail before Race Preparation to understand what kind of riders and equipment the event needs."
    ]
  },
  {
    "id": "stage-terrain-points",
    "category": "Calendar and Races",
    "title": "Stage Terrain, Finish Types, Sprints and KOM",
    "subtitle": "How to read the profile information that drives race preparation.",
    "overview": "Stage profiles communicate what the route demands. Terrain mix, finish type, elevation, intermediate sprints and mountain points should influence rider selection and Stage Plans.",
    "facts": [
      { "label": "Typical terrain", "value": "Flat, hilly, mountain, cobble, time trial / mixed profiles" },
      { "label": "Finish information", "value": "Finish type and possible summit finish" },
      { "label": "Points locations", "value": "Intermediate sprint and KOM definitions" }
    ],
    "details": [
      "Flat-heavy stages usually favor sprinters, rouleurs and strong lead-out support.",
      "Mountain stages favor climbing, endurance, resistance and recovery, especially in stage races.",
      "Hilly/puncheur stages reward acceleration and climbing strength without being full mountain stages.",
      "Time-trial stages depend strongly on TT skill and suitable equipment.",
      "Cobbled sectors increase the importance of surface-specific equipment and suitable rider characteristics.",
      "Intermediate sprints affect points and can be tactical objectives even when the rider cannot win the stage.",
      "KOM points matter for mountain classifications and can justify breakaway tactics."
    ],
    "tips": [
      "Read the route before assigning roles.",
      "Do not use the same Stage Plan on every profile."
    ]
  },
  {
    "id": "replay-results-deep",
    "category": "Calendar and Races",
    "title": "Replay, Commentary, Results and Classifications",
    "subtitle": "How to understand what happened after the engine calculates the stage.",
    "overview": "The replay is a presentation of the same official simulation result. Results and replay should stay synchronized so the player sees one consistent outcome.",
    "facts": [
      { "label": "Result source", "value": "One official race-engine calculation" },
      { "label": "Replay purpose", "value": "Visual timeline / checkpoints of the same calculation" },
      { "label": "Post-stage data", "value": "Stage result, GC/classifications, gaps, points and commentary" }
    ],
    "details": [
      "The game should not calculate a different replay result from the official result. Replay is read-only presentation of the stored outcome.",
      "Groups and time gaps show how the race split and where riders lost or gained time.",
      "Commentary describes important attacks, breakaways, chases, climbs, sprints and finish events.",
      "Stage result is only one part of a stage race. GC, points, mountain, young and team classifications can change after every stage.",
      "A rider can have a poor stage position but still achieve a tactical objective such as points, KOM points or protecting a leader.",
      "Use replay/results as feedback for future tactics rather than changing the already finalized stage."
    ],
    "tips": [
      "Review where the team lost time before changing the next Stage Plan.",
      "Check classifications after every important stage."
    ]
  },
  {
    "id": "race-plan-deep",
    "category": "Race Preparation",
    "title": "Race Plan Deep Guide",
    "subtitle": "Rider selection, staff, logistics, equipment, supplies and total support quote.",
    "overview": "Race Plan is the event-level plan created after a team is accepted. It defines who goes to the race and what support resources travel with them.",
    "facts": [
      { "label": "Rider selection", "value": "Must satisfy race rider limits" },
      { "label": "Race staff", "value": "Sport Director, Team Doctor, Physio, Mechanic" },
      { "label": "Assets", "value": "Bus, vans, mobile workshop, medical van, team cars" },
      { "label": "Other", "value": "Equipment setup and race supplies" }
    ],
    "details": [
      "The Race Plan should be created soon after acceptance because overlapping events can block riders or assets later.",
      "Riders already committed to overlapping races/camps can be blocked from selection.",
      "Staff assignments provide support bonuses and can also be blocked by conflicts.",
      "Assets create travel/logistics support and may affect costs or readiness.",
      "Equipment setup determines which durable gear the team plans to use.",
      "Race supplies must be sufficient for the whole event, especially multi-stage races.",
      "The quote preview can combine travel costs, staff effects, asset support, equipment and policy effects.",
      "Submitting a Race Plan does not finish preparation; Stage Plans must still be completed."
    ],
    "tips": [
      "Do the Race Plan before the deadline becomes urgent.",
      "Resolve rider/asset conflicts before trying to submit."
    ],
    "relatedLinks": [
      { "label": "Race Preparation", "to": "/dashboard/race-preparation" }
    ]
  },
  {
    "id": "stage-plan-deep",
    "category": "Race Preparation",
    "title": "Stage Plans Deep Guide",
    "subtitle": "Per-stage roles, team tactics, individual tactics, equipment and supplies.",
    "overview": "Stage Plans are the tactical layer of Race Preparation. The manager can prepare a different plan for each stage based on terrain, riders, weather and objectives.",
    "facts": [
      { "label": "Per-stage data", "value": "Roles, team tactics, individual tactics, equipment, supplies" },
      { "label": "Readiness", "value": "Saved, usable, incomplete, missing supplies / tactical gaps" },
      { "label": "Advice", "value": "Sport Director suggestions can guide but do not guarantee the best result" }
    ],
    "details": [
      "Each stage should have a plan that matches its profile. A sprint stage and a mountain stage should not use identical role assignments.",
      "Team tactics define the overall intention: control, protect, chase, support a sprint, target a breakaway, defend GC or another race objective.",
      "Individual tactics tell riders how to behave inside that team plan.",
      "Equipment should match terrain and weather.",
      "Supplies are entered per rider/stage and must remain within stock.",
      "Saved does not always mean usable. A saved plan can still be incomplete if important data or supplies are missing.",
      "The readiness panel should be treated as the final checklist before the plan locks."
    ],
    "tips": [
      "Prepare all stages early, then refine the next stage after the previous result if editing is still open.",
      "Use readiness warnings instead of assuming a saved plan is complete."
    ]
  },
  {
    "id": "stage-roles-deep",
    "category": "Race Preparation",
    "title": "Stage Roles and Rider Responsibilities",
    "subtitle": "Leader, sprinter, climber, breakaway and support concepts inside a Stage Plan.",
    "overview": "Stage roles tell the engine what responsibility each selected rider has. Roles should reflect rider skill and the stage objective.",
    "facts": [
      { "label": "Leader concept", "value": "Protected rider for GC/stage objective" },
      { "label": "Sprinter concept", "value": "Main fast finisher on suitable stages" },
      { "label": "Support concept", "value": "Domestiques / helpers protect, chase, pace or assist" },
      { "label": "Breakaway concept", "value": "Rider given freedom to join/target early moves" }
    ],
    "details": [
      "A GC leader should usually receive protection on mountain/hilly days and should not be given unnecessary work early in the stage.",
      "A sprinter needs lead-out/support and enough freshness for the final kilometers.",
      "Climbing specialists can support a GC leader or target mountain stages/classifications.",
      "Breakaway riders should be selected for the terrain and the team objective. A poor climber should not be the default KOM hunter on a hard mountain day.",
      "Domestiques are valuable even when their personal finish position is poor because their job is to support another rider.",
      "Roles should also consider fatigue, morale, health and race sharpness, not only raw skill."
    ],
    "tips": [
      "Give every rider a job that makes sense.",
      "Do not assign several conflicting leaders without a clear team plan."
    ]
  },
  {
    "id": "stage-readiness-deep",
    "category": "Race Preparation",
    "title": "Stage Plan Readiness and Lock State",
    "subtitle": "How to read green/yellow/orange/red/gray preparation states.",
    "overview": "Readiness is a summary of whether Stage Plans exist and are usable. It is designed to warn managers before the deadline instead of letting an incomplete plan fail silently.",
    "facts": [
      { "label": "Checks", "value": "Saved plans, usable plans, missing plans, empty plans, supplies, tactical completeness" },
      { "label": "Locking", "value": "Editing becomes unavailable after relevant deadline / race state" },
      { "label": "Recommended action", "value": "Readiness panel can tell the manager what must be fixed" }
    ],
    "details": [
      "Green generally represents a ready/complete state.",
      "Yellow/orange indicate warnings or partial preparation that deserves attention.",
      "Red means preparation is not usable or a critical requirement is missing.",
      "Gray can represent a stage that is not yet relevant, unavailable or already locked depending on page state.",
      "A plan can contain rider roles but still fail readiness if supplies or another required block is missing.",
      "When editing is locked, the manager must accept the finalized stored plan."
    ],
    "tips": [
      "Aim for all stages to show a usable readiness state before the final deadline."
    ]
  },
  {
    "id": "sport-director-deep",
    "category": "Race Preparation",
    "title": "Sport Director Suggestions",
    "subtitle": "How advisor recommendations help without replacing the manager.",
    "overview": "The Sport Director can provide suggestions for stage preparation. Advice is useful for learning and speed, but the player remains responsible for the final decision.",
    "facts": [
      { "label": "Possible advice", "value": "Equipment, team tactics, individual tactics, supplies / preparation" },
      { "label": "Purpose", "value": "Guidance and convenience" },
      { "label": "Guarantee", "value": "Does not guarantee a perfect result" }
    ],
    "details": [
      "Advisor suggestions should use the current stage profile, weather, selected riders and available resources.",
      "The manager should compare suggestions with team objectives. A Sport Director may suggest a safe generic plan when the user wants an aggressive breakaway target.",
      "Suggestions are most valuable for new players who do not yet understand all stage-plan controls.",
      "Premium convenience features should not secretly improve race calculations. The advantage is analysis/convenience, not hidden performance power.",
      "Always save the final plan after reviewing advice."
    ],
    "tips": [
      "Use advice to learn, then adjust it to your own race objective."
    ]
  },

  {
    "id": "ranking-tiers-deep",
    "category": "Rankings and Statistics",
    "title": "Competition Pyramid, Tiers and Divisions",
    "subtitle": "How the world structure is organized from WorldTeam to Amateur.",
    "overview": "The competition pyramid gives every club a long-term place in the world. Teams earn international points through race results and use standings to fight for promotion, avoid relegation or qualify for playoffs.",
    "facts": [
      { "label": "Tier 1", "value": "WorldTeam" },
      { "label": "Tier 2", "value": "ProTeam West and ProTeam East" },
      { "label": "Tier 3", "value": "Continental Europe, America, Asia, Africa, Oceania" },
      { "label": "Tier 4", "value": "Regional Amateur divisions" }
    ],
    "details": [
      "WorldTeam is the top division. Clubs there face the strongest competition and the most demanding long-term ranking pressure.",
      "ProTeam is split into West and East. Clubs fight for direct promotion, playoff places and survival.",
      "Continental is divided by continent. Europe and America feed the Pro West pathway while Asia, Africa and Oceania feed the Pro East pathway.",
      "Amateur is divided into more detailed regional competitions so developing clubs can play against geographically appropriate rivals.",
      "International points earned from race results build the official standings. A team should therefore care about consistent scoring across the whole season, not only occasional wins.",
      "Inactive managers can remain visible for historical integrity and season-end processing even when they are no longer actively controlling the club."
    ],
    "tips": [
      "Set a season objective based on the exact promotion/relegation zone of your division.",
      "Use Team Ranking regularly instead of waiting for the final week."
    ],
    "relatedLinks": [
      { "label": "Team Ranking", "to": "/dashboard/team-ranking" }
    ]
  },
  {
    "id": "promotion-relegation-deep",
    "category": "Rankings and Statistics",
    "title": "Promotion, Relegation and Playoff Rules",
    "subtitle": "What different finishing positions mean at season end.",
    "overview": "Promotion and relegation rules depend on tier and division. Some places promote directly, some enter playoffs and some relegate automatically. The manager should read the standing colors/notes as part of the season objective.",
    "facts": [
      { "label": "WorldTeam", "value": "Bottom 5 relegated" },
      { "label": "Pro West / East", "value": "Winner direct up; 2nd–4th World playoff; bottom 5 down" },
      { "label": "Continental Europe / Asia", "value": "Bottom 6 relegated" },
      { "label": "Continental America / Africa", "value": "Bottom 5 relegated" },
      { "label": "Continental Oceania", "value": "Bottom 3 relegated" },
      { "label": "European Amateur", "value": "Winner direct up; 2nd–3rd playoff" },
      { "label": "Other Amateur", "value": "Winner direct up; 2nd–4th playoff" },
      { "label": "Amateur Oceania", "value": "Top 3 promoted directly" }
    ],
    "details": [
      "WorldTeam clubs in the bottom five are shown in the relegation zone.",
      "Each ProTeam division sends the winner directly to WorldTeam and sends 2nd–4th to the World playoff.",
      "Continental Europe and America connect to the Pro West promotion route; Continental Asia, Africa and Oceania connect to Pro East.",
      "Relegation depth is different by Continental division because division sizes and lower-tier structures are different.",
      "Amateur European divisions use winner-direct plus 2nd–3rd playoff rules.",
      "Most non-European Amateur divisions use winner-direct plus 2nd–4th playoff rules, while Amateur Oceania promotes its top three directly.",
      "The standing page is the source of truth for the current season because future competition-rule changes should be shown there."
    ],
    "tips": [
      "Know whether your target is direct promotion or simply reaching the playoff zone.",
      "Near season end, protect points against direct rivals."
    ]
  },
  {
    "id": "statistics-deep",
    "category": "Rankings and Statistics",
    "title": "Statistics Deep Guide",
    "subtitle": "Teams, riders, current rankings, history and specialist breakdowns.",
    "overview": "Statistics is the analysis page for the wider game world. It helps users understand who is strong now, who was strong before and which riders dominate specific point classifications.",
    "facts": [
      { "label": "Team tabs", "value": "Current and History" },
      { "label": "Rider tabs", "value": "Rankings and Breakdown" },
      { "label": "Rider point types", "value": "Overall season points, sprint points, climbing points" },
      { "label": "Useful context", "value": "Country, role, age, club, market value, salary, fatigue, availability" }
    ],
    "details": [
      "Team Current lets the user compare active clubs by tier/division and points.",
      "Team History becomes more useful after several completed seasons because it can show previous champions and snapshots.",
      "Rider Rankings identify the highest-scoring riders in the current season.",
      "Rider Breakdown helps identify specialists. A rider can rank highly in sprint or climbing points without leading the overall points table.",
      "Statistics should be used together with rider profiles and team profiles. A ranking number tells the user who scored points; the profile explains why.",
      "Historical information should remain unchanged by future engine upgrades because official past results are part of game history."
    ],
    "tips": [
      "Use statistics before transfer windows to identify realistic targets.",
      "Compare specialist points with the races you want to target."
    ],
    "relatedLinks": [
      { "label": "Statistics", "to": "/dashboard/statistics" },
      { "label": "Team Ranking", "to": "/dashboard/team-ranking" }
    ]
  },
  {
    "id": "transfer-list-deep",
    "category": "Transfers and Scouting",
    "title": "Transfer List Deep Guide",
    "subtitle": "Buying a rider who is currently under contract with another club.",
    "overview": "A transfer-listed rider has a current club. The buying manager first negotiates a transfer fee with that club. Only after the selling club accepts can the contract negotiation with the rider be completed.",
    "facts": [
      { "label": "Step 1", "value": "Find transfer-listed rider" },
      { "label": "Step 2", "value": "Make offer to selling club" },
      { "label": "Step 3", "value": "If accepted, negotiate rider contract" },
      { "label": "Important costs", "value": "Transfer fee plus new salary / contract terms" }
    ],
    "details": [
      "Transfer-list browsing should be filtered by the type of rider the squad actually needs.",
      "The selling club evaluates the transfer fee and may accept, reject, counter or let the negotiation expire depending on the market logic.",
      "An accepted club offer does not mean the rider automatically joins. The player must still agree contract terms with the rider.",
      "Transfer spending should include both immediate fee and future salary commitment in the finance plan.",
      "The manager should check roster capacity before finalizing a new signing.",
      "A rider can be attractive on overall but still be a poor tactical fit for the club."
    ],
    "tips": [
      "Scout expensive targets before bidding.",
      "Leave enough money for salary and normal operating costs after the transfer fee."
    ],
    "relatedLinks": [
      { "label": "Transfers", "to": "/dashboard/transfers" }
    ]
  },
  {
    "id": "free-agents-deep",
    "category": "Transfers and Scouting",
    "title": "Free Agents Deep Guide",
    "subtitle": "Signing riders without paying a selling club transfer fee.",
    "overview": "Free agents are riders without a current selling club. The manager negotiates directly with the rider, but the rider still evaluates salary, contract length, bonuses and sporting situation.",
    "facts": [
      { "label": "Selling club", "value": "None" },
      { "label": "Transfer fee", "value": "No normal club-to-club transfer fee" },
      { "label": "Still required", "value": "Acceptable rider contract and free roster capacity" }
    ],
    "details": [
      "Free agent does not mean free total cost. Salary, signing/contract conditions and future wages still matter.",
      "The rider can reject a club that offers poor salary, bad duration or an unattractive sporting situation.",
      "Free agents can be useful when the squad needs depth without a large transfer fee.",
      "Older or lower-potential free agents can solve short-term problems but should not block important development slots without a reason.",
      "Young free agents can be valuable but still need scouting/analysis when information is uncertain."
    ],
    "tips": [
      "Use free agents for depth when transfer-fee cash is limited.",
      "Do not ignore long-term salary just because there is no transfer fee."
    ]
  },
  {
    "id": "transfer-negotiation-deep",
    "category": "Transfers and Scouting",
    "title": "Transfer and Contract Negotiation",
    "subtitle": "Acceptance bands, attempts, counters and hard-block reasons.",
    "overview": "Negotiations are probability/interest-based decisions with visible analysis. The manager should improve the complete offer rather than repeatedly changing only one number without understanding why the other side is unhappy.",
    "facts": [
      { "label": "Statuses", "value": "Draft, open, pending, accepted, rejected, expired, declined, completed, countered" },
      { "label": "Contract duration UI", "value": "1–5 years" },
      { "label": "Preview values", "value": "Acceptance %, band, predicted outcome and component scores" },
      { "label": "Possible component scores", "value": "Salary, duration, bonus, fee, tier / sporting situation" }
    ],
    "details": [
      "Acceptance percentage is a guide to how attractive the current offer is; it is not a guaranteed final result.",
      "Acceptance bands/predicted outcome help the manager understand whether an offer is strong, borderline or unrealistic.",
      "Salary score measures how the wage compares with rider expectations.",
      "Duration score measures whether the contract length matches rider expectations and career situation.",
      "Bonus and fee scores can improve attractiveness when those components apply.",
      "Tier/sporting score represents how attractive the buying club is from a sporting perspective.",
      "Hard-block reasons mean the deal cannot proceed under the current situation even if one number is high.",
      "Repeated weak offers can consume attempts and lead to rejection, expiry or a counteroffer."
    ],
    "tips": [
      "Use the preview before submitting.",
      "Fix the weakest relevant component instead of blindly increasing every cost."
    ]
  },
  {
    "id": "scouting-deep",
    "category": "Transfers and Scouting",
    "title": "Scouting Reports and Information Uncertainty",
    "subtitle": "Why external rider data may be hidden and how reports improve precision.",
    "overview": "Scouting prevents the transfer market from becoming a perfect-information spreadsheet. Managers should invest in knowledge before making expensive or long-term transfer decisions.",
    "facts": [
      { "label": "Report filters", "value": "All, New, Reviewed" },
      { "label": "Report content", "value": "Rider, scout, completion date, overall, potential, strengths, notes" },
      { "label": "External profile", "value": "Exact values can remain hidden until scouting exists" }
    ],
    "details": [
      "An unscouted rider can show approximate or limited information depending on page rules.",
      "A completed report improves precision and can reveal overall, potential, specialist strengths and scout notes.",
      "A report is linked to the scout who completed it, so staff quality/capacity matters to the wider scouting system.",
      "New/Reviewed status helps users manage many reports without forgetting unread information.",
      "Scouting should be focused on realistic transfer targets instead of spending resources on every rider in the database.",
      "Reports should inform decisions but do not guarantee that the rider will accept the club or that the selling club will accept a bid."
    ],
    "tips": [
      "Scout high-cost or high-potential targets first.",
      "Review old reports before repeating unnecessary scouting."
    ],
    "relatedLinks": [
      { "label": "Scouting", "to": "/dashboard/scouting" }
    ]
  },
  {
    "id": "staff-market-deep",
    "category": "Transfers and Scouting",
    "title": "Staff Market and Hiring",
    "subtitle": "Finding specialists while respecting role capacity and salary cost.",
    "overview": "Staff hiring is part of the Transfers page but must be planned together with Infrastructure and Finance. A good staff candidate is useless if the role has no free slot or the salary breaks the budget.",
    "facts": [
      { "label": "Staff attributes", "value": "Expertise, experience, potential, leadership, efficiency, loyalty" },
      { "label": "Before hiring", "value": "Check role, salary, capacity and infrastructure requirement" },
      { "label": "Long-term development", "value": "Courses can improve suitable staff after hiring" }
    ],
    "details": [
      "The staff market should be filtered by the role the club needs.",
      "Role capacity can be blocked by missing/low infrastructure even if the user can afford the salary.",
      "Expertise represents current specialist quality while potential shows longer-term ceiling.",
      "Experience and leadership can make staff more useful in complex responsibilities.",
      "Efficiency and loyalty can matter for long-term value depending on the staff system.",
      "Staff salary becomes a recurring finance cost, so hiring several strong staff at once can create a hidden budget problem."
    ],
    "tips": [
      "Check Infrastructure used/max staff slots before negotiating.",
      "Hire for a role, not only for the highest overall-looking numbers."
    ],
    "relatedLinks": [
      { "label": "Staff Market", "to": "/dashboard/transfers?tab=staff" },
      { "label": "Infrastructure", "to": "/dashboard/infrastructure" }
    ]
  },
  {
    "id": "finance-health-deep",
    "category": "Finance",
    "title": "Finance Health and Operating Cashflow",
    "subtitle": "How to separate real club economics from emergency debt movement.",
    "overview": "Finance Health is about whether the normal club operation can support itself. Emergency borrowing can save the club temporarily, but loan money should not be mistaken for healthy operating income.",
    "facts": [
      { "label": "Operating income", "value": "Sponsor income, prize money and other genuine club income" },
      { "label": "Operating expenses", "value": "Salaries, staff, policies, tax, equipment, camps, infrastructure and other real costs" },
      { "label": "Not operating income", "value": "Emergency loan disbursement" },
      { "label": "Not operating expense", "value": "Emergency loan principal repayment" },
      { "label": "Operating expense", "value": "Emergency loan interest" }
    ],
    "details": [
      "A positive balance does not automatically mean the club is healthy. The balance may include borrowed emergency money.",
      "Operating income should come from real club activity such as sponsors and racing.",
      "Operating expense includes recurring commitments that continue even when the club is not buying transfers.",
      "Emergency loan principal is debt movement, not profit/loss. Interest is a real cost of using the rescue system.",
      "Overview Finance Health should be used for quick risk detection, while the full Finance page explains the detailed numbers.",
      "The manager should compare weekly/monthly recurring cost with expected sponsor and race income before making optional purchases."
    ],
    "tips": [
      "Never spend emergency loan cash as if it were a bonus.",
      "Use operating cashflow to decide whether the club can afford higher salaries or policies."
    ],
    "relatedLinks": [
      { "label": "Finance", "to": "/dashboard/finance" }
    ]
  },
  {
    "id": "transactions-deep",
    "category": "Finance",
    "title": "Transactions and In-Game Statement History",
    "subtitle": "How to explain every balance change without using real technical timestamps as game dates.",
    "overview": "Transactions is the accounting trail. If the club balance changes unexpectedly, the manager should use this tab to identify the exact row instead of guessing which system caused it.",
    "facts": [
      { "label": "Recent window", "value": "Last 30 game days" },
      { "label": "Archive", "value": "Older rows grouped by in-game month, previous 6 game months" },
      { "label": "Date rule", "value": "Player-facing statement date should use stored game-date metadata" }
    ],
    "details": [
      "Every important club cash movement should appear as a transaction row with type, description, amount and in-game date.",
      "Salary, staff, tax, sponsor payments, prize money, policies, equipment, infrastructure, camps and bonuses should be traceable here.",
      "Recent transactions keep everyday statement reading simple while older rows can be grouped into archive months.",
      "created_at is a real technical timestamp used for database ordering/pagination. It should not replace the in-game transaction date in the UI.",
      "Positive and negative rows should be interpreted in the context of their transaction type rather than color alone.",
      "When investigating a finance bug, always compare the transaction row with the backend reason/source instead of editing the visible balance directly."
    ],
    "tips": [
      "Use Transactions whenever a user asks ‘where did my money go?’",
      "Check game date and transaction type before assuming the row is wrong."
    ]
  },
  {
    "id": "tax-deep",
    "category": "Finance",
    "title": "Tax, Withholding and Monthly Audits",
    "subtitle": "How taxable income is charged, adjusted and sometimes refunded.",
    "overview": "Tax is a real club expense connected to taxable income. The system can withhold tax during the month and then audit the final monthly amount, creating an adjustment or refund if necessary.",
    "facts": [
      { "label": "Tax view", "value": "Current taxable income, expected tax, withheld amount and adjustment" },
      { "label": "Audit statuses", "value": "OK, adjusted, refunded" },
      { "label": "Tax transaction types", "value": "Withholding, monthly adjustment, monthly refund" }
    ],
    "details": [
      "Taxable income should be calculated from the game’s defined taxable transaction types, not from every positive balance movement.",
      "Withholding removes part of taxable income during the month so the club is not surprised by the full tax bill at month end.",
      "The monthly audit compares expected final tax with what was already withheld.",
      "If too little was withheld, the audit creates an additional adjustment cost.",
      "If too much was withheld, the audit can create a refund.",
      "A refund is not new sponsor/race income. It is a correction of previously withheld tax.",
      "Large sponsor or prize payments can create visible tax rows soon after the income transaction."
    ],
    "tips": [
      "Keep cash available for tax even after a large prize/sponsor payment.",
      "Use the Tax tab to distinguish withholding from final monthly adjustment."
    ],
    "relatedLinks": [
      { "label": "Tax", "to": "/dashboard/finance?tab=tax" }
    ]
  },
  {
    "id": "sponsors-deep",
    "category": "Finance",
    "title": "Main, Secondary and Technical Sponsors",
    "subtitle": "Income, visibility, support and contract differences.",
    "overview": "Sponsors are one of the club’s main income systems. Different sponsor kinds provide different value: main sponsors focus on visibility and objectives, secondary sponsors add support slots, and technical sponsors connect strongly to equipment.",
    "facts": [
      { "label": "Main", "value": "High visibility, guaranteed money, bonus pool, objectives" },
      { "label": "Secondary", "value": "Additional sponsor support through available slots" },
      { "label": "Technical", "value": "Cash/equipment budget and equipment-category discounts" }
    ],
    "details": [
      "Main sponsors are the most visible commercial partners and can have season objectives that create bonus payments.",
      "Secondary sponsors provide extra money/support and are shown in simpler slots in the current UI.",
      "Technical sponsors can directly improve the economics of equipment purchasing.",
      "Sponsor offers should be compared by guaranteed money, bonuses, objectives, restrictions and identity effects, not only by the headline number.",
      "A weak team can fail unrealistic sponsor objectives even if the contract looks attractive.",
      "Sponsor payments and bonuses can be taxable, so the gross sponsor value is not always the final cash retained by the club."
    ],
    "tips": [
      "Accept objectives your current squad/calendar can realistically achieve.",
      "Check tax impact after large sponsor payments."
    ],
    "relatedLinks": [
      { "label": "Sponsors", "to": "/dashboard/finance?tab=sponsors" }
    ]
  },
  {
    "id": "sponsor-objectives-deep",
    "category": "Finance",
    "title": "Sponsor Objectives and Naming Rights",
    "subtitle": "Race targets, bonus payouts and temporary club identity changes.",
    "overview": "Sponsor contracts can include objectives tied to racing performance. Naming-rights contracts add an identity tradeoff by temporarily changing the public team name in exchange for higher commercial value.",
    "facts": [
      { "label": "Objective examples", "value": "Race start, win, podium, top 5, top 10, GC target, stage target, classification visibility" },
      { "label": "Objective states", "value": "Scheduled, checked, achieved, missed, paid" },
      { "label": "Naming rights", "value": "Usually higher pay but temporary public team-name change" }
    ],
    "details": [
      "Sponsor objectives can point to a specific race or a broader season performance condition.",
      "Scheduled objectives should be reviewed early so the race is included in the team calendar and correct riders are available.",
      "After the target race/event, the system checks whether the objective was achieved or missed.",
      "Achieved objectives can create a bonus payment according to the contract.",
      "Standard sponsor deals leave the normal team name unchanged.",
      "Naming-rights deals can lock team-name editing and replace the visible season display name with the sponsor-related name.",
      "The original club identity should return according to the season-end naming-rights rule."
    ],
    "tips": [
      "Read every objective before accepting the deal.",
      "Do not sacrifice club identity for a naming-rights deal unless the extra value is worth it to you."
    ]
  },
  {
    "id": "team-policies-deep",
    "category": "Finance",
    "title": "Team Policies and Operations Deep Guide",
    "subtitle": "Travel, accommodation, logistics, housing, nutrition, recovery and bonuses.",
    "overview": "Policies let the manager choose the club’s operating standard. Better options can improve comfort/support but create larger recurring and trip-specific costs.",
    "facts": [
      { "label": "Trip operations", "value": "Flights, accommodation, ground transport, logistics, staff travel accommodation" },
      { "label": "Team policies", "value": "Housing, nutrition, recovery, staff equipment, rider bonus, staff bonus" },
      { "label": "Finance output", "value": "Weekly estimate, monthly estimate, last-month actual and upcoming trip forecast" }
    ],
    "details": [
      "Flight policy affects how the team travels to races/camps and can change trip cost.",
      "Accommodation policy changes hotel/room standards and therefore travel expense.",
      "Ground transport and logistics policies affect race support operations.",
      "Housing, nutrition and recovery policies can improve the working environment for riders but create recurring cost.",
      "Staff equipment and bonus policies affect staff operating cost and reward structure.",
      "Rider bonus policies can increase expense after successful racing depending on configured rules.",
      "The estimates panel should be used before increasing multiple policies at once."
    ],
    "tips": [
      "Upgrade policies gradually when operating cashflow is stable.",
      "Check upcoming trip forecast before expensive races or camps."
    ],
    "relatedLinks": [
      { "label": "Team Policies", "to": "/dashboard/finance?tab=teamPoliciesOperations" }
    ]
  },
  {
    "id": "liquidation-deep",
    "category": "Finance",
    "title": "Emergency Rescue and Club Liquidation Deep Guide",
    "subtitle": "What happens after repeated mandatory-payment failures.",
    "overview": "Emergency rescue exists to stop one bad payment from immediately ending a club, but it is limited. A manager who repeatedly cannot cover mandatory obligations can eventually lose the club to liquidation.",
    "facts": [
      { "label": "Lifetime rescue limit", "value": "3" },
      { "label": "Critical state", "value": "All three rescues used and another mandatory obligation cannot be covered" },
      { "label": "Liquidated club", "value": "Game actions blocked" },
      { "label": "User account / coins", "value": "Remain active" }
    ],
    "details": [
      "A mandatory payment failure can trigger an emergency rescue when rescue capacity remains.",
      "The rescue adds debt that must later be repaid; it should not be considered normal income.",
      "Overview Emergency Debt Health shows rescue count, outstanding principal, repayment information and risk.",
      "After all rescues are used, another uncovered mandatory obligation can trigger liquidation.",
      "A liquidated club can no longer perform normal game actions. The dashboard shows the liquidation state instead.",
      "The user account survives, including account-level coins.",
      "Create new club starts the path toward a new club. Restart Team behavior is still a placeholder/future reset flow and should not be described as a completed production feature."
    ],
    "tips": [
      "After the first rescue, immediately reduce optional spending and inspect recurring costs.",
      "After the second/third rescue, treat every mandatory payment as critical."
    ]
  },

  {
    "id": "faq-application-blocked",
    "category": "FAQ",
    "title": "FAQ: Why can’t I apply for a race?",
    "subtitle": "Common race-application blocks and what to check first.",
    "overview": "Race application problems are usually caused by the application window, eligibility rules, race state or an existing team application. The Calendar/Race Detail pages should show the relevant state.",
    "facts": [
      { "label": "Check first", "value": "Application open/close dates" },
      { "label": "Then check", "value": "Team eligibility, race status and whether the club already applied" }
    ],
    "details": [
      "If the application window has not opened yet, the apply action should remain unavailable.",
      "If the application deadline has passed, the team can no longer apply even if the race itself has not started.",
      "The race can restrict eligible teams by tier, division or other rules.",
      "A cancelled/finished/active race does not accept normal new applications.",
      "If the club already has an application/accepted entry, the page should show that state instead of a second apply action.",
      "Use Race Detail for the exact deadline and entry-rule explanation."
    ],
    "tips": [
      "Check the footer game time and race application deadline together.",
      "Apply early for important races."
    ],
    "relatedLinks": [
      { "label": "Calendar", "to": "/dashboard/calendar" }
    ]
  },
  {
    "id": "faq-accepted-not-ready",
    "category": "FAQ",
    "title": "FAQ: My team was accepted. Why is the race still not ready?",
    "subtitle": "Accepted entry is not the same as completed preparation.",
    "overview": "Acceptance only reserves a team place in the event. The manager still needs to submit the correct rider selection and complete Race Plan / Stage Plans before the relevant deadlines.",
    "facts": [
      { "label": "Accepted", "value": "Team has an event slot" },
      { "label": "Still needed", "value": "Riders, staff/assets, equipment/supplies and Stage Plans" },
      { "label": "Final check", "value": "Stage readiness must be usable/complete before lock" }
    ],
    "details": [
      "Open Race Preparation after acceptance.",
      "Complete the Race Plan with the required number of riders and eligible support resources.",
      "Resolve any rider/staff/asset conflict caused by overlapping events.",
      "Make sure enough race supplies exist for the event.",
      "Open Stage Plans and complete the tactical plan for every required stage.",
      "A saved Stage Plan can still be incomplete. Read the readiness warning before assuming the team is ready."
    ],
    "tips": [
      "Do not wait until the rider-submission/stage-plan deadline.",
      "Aim for all stages to be green/usable before the lock."
    ],
    "relatedLinks": [
      { "label": "Race Preparation", "to": "/dashboard/race-preparation" }
    ]
  },
  {
    "id": "faq-rider-underperformed",
    "category": "FAQ",
    "title": "FAQ: Why did my high-overall rider underperform?",
    "subtitle": "Overall is only one part of race performance.",
    "overview": "A rider can have a high overall rating but still perform badly when the race profile, specialist skills, fatigue, morale, health, sharpness, equipment or tactics are wrong.",
    "facts": [
      { "label": "Check rider", "value": "Specialist skills, fatigue, morale, availability, sharpness" },
      { "label": "Check stage", "value": "Terrain, distance, finish, weather" },
      { "label": "Check plan", "value": "Role, team tactic, individual tactic, equipment and supplies" }
    ],
    "details": [
      "Overall is an average/summary and does not guarantee elite performance on every terrain.",
      "A sprinter can be high overall but still lose heavily on a mountain finish.",
      "A climber can be strong overall but lack the flat/sprint qualities for a bunch finish.",
      "High fatigue or poor health can reduce effective performance.",
      "Low morale or poor race sharpness can make a normally strong rider less effective.",
      "A wrong role can make the rider spend energy supporting someone else instead of racing for personal result.",
      "Equipment, supplies and team support can also change the final outcome."
    ],
    "tips": [
      "Judge the result against the rider’s job, not only finish position.",
      "Use Replay/results to identify where time/position was lost."
    ]
  },
  {
    "id": "faq-money",
    "category": "FAQ",
    "title": "FAQ: Where did my club money go?",
    "subtitle": "How to investigate an unexpected balance decrease.",
    "overview": "The correct answer should come from Finance Transactions. The game has many recurring and one-time costs, so guessing from the final balance is unreliable.",
    "facts": [
      { "label": "First page", "value": "Finance → Transactions" },
      { "label": "Common costs", "value": "Rider salary, staff salary, tax, policies, trips, equipment, infrastructure, camps, transfers" },
      { "label": "Debt note", "value": "Loan principal movement and loan interest must be separated" }
    ],
    "details": [
      "Open Transactions and find the negative rows around the game date when the balance changed.",
      "Check whether the cost is weekly, monthly, trip-based, one-time or tax-related.",
      "Rider/staff salaries are recurring and can become large after several signings.",
      "Team Policies and race travel can create costs even when the club has not bought a transfer.",
      "Tax withholding can appear immediately after taxable income, so a large sponsor/prize payment may be followed by a tax row.",
      "Emergency loan principal repayment is debt movement. Interest is a real expense."
    ],
    "tips": [
      "Use transaction descriptions/types instead of guessing.",
      "Compare Overview Finance Health with the detailed statement."
    ],
    "relatedLinks": [
      { "label": "Transactions", "to": "/dashboard/finance?tab=transactions" }
    ]
  },
  {
    "id": "faq-equipment",
    "category": "FAQ",
    "title": "FAQ: Why can’t I use or repair an equipment item?",
    "subtitle": "Status, condition and assignment restrictions.",
    "overview": "Equipment actions depend on item status, condition and whether another system currently uses the item. An item can exist in inventory but still be temporarily unavailable for a specific action.",
    "facts": [
      { "label": "Possible blockers", "value": "Assigned, in maintenance, wrong condition, worn/locked state" },
      { "label": "Repair", "value": "Usually available at condition 90% or lower when otherwise eligible" },
      { "label": "Race use", "value": "Item must be available and selected through the relevant setup" }
    ],
    "details": [
      "Assigned equipment is already used/reserved by a setup or event and cannot always be modified immediately.",
      "In-maintenance equipment must finish repair before normal use.",
      "Repair is not needed when condition is too high and can be blocked when the item is otherwise unavailable.",
      "Worn items require attention and can become a risk for important events.",
      "If an item cannot be sold/discarded, check whether it is assigned or locked by another action.",
      "Change the setup/assignment first when the item is needed for another purpose."
    ],
    "tips": [
      "Keep backup equipment so one repair does not block the whole race setup.",
      "Check condition before Race Plan submission."
    ],
    "relatedLinks": [
      { "label": "Equipment", "to": "/dashboard/equipment" }
    ]
  },
  {
    "id": "faq-staff-hiring",
    "category": "FAQ",
    "title": "FAQ: Why can’t I hire this staff member?",
    "subtitle": "Role capacity, facility requirements and finance checks.",
    "overview": "The most common reason is not the candidate—it is the club. Staff hiring can be blocked because the role has no free slot, the facility level is too low, the club lacks cash or another hiring rule is not satisfied.",
    "facts": [
      { "label": "Check capacity", "value": "Used slots versus max slots for that staff role/group" },
      { "label": "Check facility", "value": "Training, Medical, Workshop, Scouting or Youth infrastructure" },
      { "label": "Check finance", "value": "Immediate cost and recurring salary" }
    ],
    "details": [
      "Open Infrastructure and inspect the used/max capacity for the relevant staff group.",
      "If capacity is full, a facility upgrade may be required before another hire.",
      "Check whether the candidate role belongs to the facility group you think it does.",
      "Even with free capacity, the club still needs enough cash and an acceptable contract/offer.",
      "Staff salary becomes a recurring cost after hiring, so Finance should be checked before confirming.",
      "If the page shows a hard requirement message, fix that requirement before changing salary repeatedly."
    ],
    "tips": [
      "Infrastructure and Transfers/Staff Market should be used together.",
      "Do not over-hire staff just because the slots exist."
    ],
    "relatedLinks": [
      { "label": "Staff Market", "to": "/dashboard/transfers?tab=staff" },
      { "label": "Infrastructure", "to": "/dashboard/infrastructure" }
    ]
  }
]

const manualCategories = Array.from(new Set(manualSections.map(section => section.category)))


function manualCategoryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function localizeManualSection(section: ManualSection, t: any): ManualSection {
  const base = `sections.${section.id}`
  return {
    ...section,
    category: t(`${base}.category`, { defaultValue: section.category }),
    title: t(`${base}.title`, { defaultValue: section.title }),
    subtitle: t(`${base}.subtitle`, { defaultValue: section.subtitle }),
    overview: t(`${base}.overview`, { defaultValue: section.overview }),
    facts: section.facts?.map((fact, index) => ({
      label: t(`${base}.facts.${index}.label`, { defaultValue: fact.label }),
      value: t(`${base}.facts.${index}.value`, { defaultValue: fact.value }),
    })),
    details: section.details.map((detail, index) =>
      t(`${base}.details.${index}`, { defaultValue: detail }),
    ),
    tips: section.tips?.map((tip, index) =>
      t(`${base}.tips.${index}`, { defaultValue: tip }),
    ),
    relatedLinks: section.relatedLinks?.map((link, index) => ({
      ...link,
      label: t(`${base}.relatedLinks.${index}`, { defaultValue: link.label }),
    })),
  }
}

const manualSectionById = new Map(manualSections.map(section => [section.id, section]))

function getLocalizedSectionGuideParagraphs(
  section: ManualSection,
  sourceCategory: string,
  t: any,
): string[] {
  const facts = section.facts ?? []
  const factText = facts.map(fact => `${fact.label}: ${fact.value}`).join('; ')
  const key = manualCategoryKey(sourceCategory)
  const intro = t(`guide.categoryIntro.${key}`, { title: section.title })
  const factParagraph = factText
    ? t('guide.factParagraph', { factText })
    : t('guide.noFactParagraph')
  const mistakeKey = [
    'equipment',
    'finance',
    'calendar-and-races',
    'race-preparation',
    'transfers',
    'transfers-and-scouting',
    'training',
    'infrastructure',
  ].includes(key) ? key : 'default'
  return [intro, factParagraph, t(`guide.commonMistake.${mistakeKey}`)]
}

function getLocalizedExpandedDetailExplanation(
  section: ManualSection,
  sourceDetail: string,
  t: any,
): string {
  const d = sourceDetail.toLowerCase()
  let key = 'default'

  if (d.includes('sold') || d.includes('discarded')) key = 'soldDiscarded'
  else if (d.includes('ready') && d.includes('worn')) key = 'readyWorn'
  else if (d.includes('assigned')) key = 'assigned'
  else if (d.includes('repair quote') || d.includes('quote')) key = 'quote'
  else if (d.includes('condition')) key = 'condition'
  else if (d.includes('bidons') || d.includes('gels') || d.includes('nutrition')) key = 'nutrition'
  else if (d.includes('jersey') || d.includes('rain jackets') || d.includes('rain jacket')) key = 'durableSupplies'
  else if (d.includes('sponsor') || d.includes('objectives')) key = 'sponsor'
  else if (d.includes('tax')) key = 'tax'
  else if (d.includes('deadline') || d.includes('window')) key = 'deadline'
  else if (d.includes('training') || d.includes('fatigue')) key = 'training'
  else if (d.includes('scout') || d.includes('scouting')) key = 'scouting'
  else if (d.includes('cash') || d.includes('cost') || d.includes('salary') || d.includes('balance')) key = 'finance'
  else if (d.includes('role') || d.includes('skills') || d.includes('overall')) key = 'roleSkills'
  else if (d.includes('replay') || d.includes('results') || d.includes('classification')) key = 'results'

  return t(`guide.detail.${key}`, { title: section.title })
}


function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function sectionMatchesQuery(section: ManualSection, query: string): boolean {
  const q = normalizeText(query)
  if (!q) return true

  const searchable = [
    section.category,
    section.title,
    section.subtitle,
    section.overview,
    ...(section.facts ?? []).flatMap(fact => [fact.label, fact.value]),
    ...section.details,
    ...(section.tips ?? []),
    ...(section.relatedLinks ?? []).map(link => link.label),
  ]
    .join(' ')
    .toLowerCase()

  return searchable.includes(q)
}

function getSectionGuideParagraphs(section: ManualSection): string[] {
  const title = section.title
  const facts = section.facts ?? []
  const factText = facts.map(fact => `${fact.label}: ${fact.value}`).join('; ')

  const categoryIntro: Record<string, string> = {
    'Getting Started': `${title} should be understood as part of the first-management routine. New users should not try to optimize everything immediately. First identify what the page controls, what information is authoritative, what deadlines exist, and which actions can create permanent or expensive consequences.`,
    'Coins and Account': `${title} belongs to the account layer, not the normal club-cash economy. Users should separate account-level coins and identity/profile settings from team finance. If a feature uses coins, check the account balance and exact live package/service price before confirming anything.`,
    'Club Identity': `${title} affects the public identity of the club. Branding decisions can be visible in rankings, race lists and team profiles, while naming-rights sponsor rules can temporarily lock or replace parts of that identity.`,
    Dashboard: `${title} is part of the daily information flow. Dashboard pages are designed to tell the manager what needs attention now. When a card or alert links to another page, use that deeper page for the final decision instead of relying only on the summary.`,
    Riders: `${title} is connected to squad quality and long-term roster planning. Rider/staff decisions should combine current performance, potential, fatigue/health, contract cost, capacity and future race needs rather than focusing on one headline number.`,
    Training: `${title} is a development decision with a freshness cost. Training quality matters, but the best training plan is the one that improves riders while still allowing them to arrive at important races fit enough to perform.`,
    Equipment: `${title} connects owned items, setup bonuses, condition and race preparation. Equipment should be selected for the actual race profile and kept in usable condition; buying expensive gear without setups and maintenance planning wastes value.`,
    Infrastructure: `${title} is a long-term capacity investment. Facility and asset decisions should solve a real bottleneck, fit the finance plan and be timed around construction/repair durations rather than upgraded automatically.`,
    'Calendar and Races': `${title} belongs to the competition timeline. Always compare race/application/rider-submission information with authoritative game time, then use Race Detail and Race Preparation for the deeper rules and actions.`,
    'Race Preparation': `${title} is part of the final pre-race workflow. Accepted entry is not enough: riders, support resources, equipment, supplies, roles and tactics must be complete before the relevant lock/deadline.`,
    'Rankings and Statistics': `${title} explains the competitive context of the club. Points, standings and specialist tables should guide season targets and scouting, but managers should still open team/rider profiles before making decisions from ranking numbers alone.`,
    Transfers: `${title} is a squad-building decision with both sporting and financial consequences. Before committing, check role fit, scouting certainty, salary, duration, transfer fee if applicable, roster capacity and the effect on future club cashflow.`,
    'Transfers and Scouting': `${title} combines market action with information quality. The manager should use scouting to reduce uncertainty, then negotiate only for realistic targets that fit both the squad and the budget.`,
    Finance: `${title} affects club survival. Always distinguish operating income/expense from debt movement, use transaction rows to explain balance changes, and keep enough cash for mandatory recurring costs before paying for optional improvements.`,
    'Support and Account': `${title} is an account/support function. Protect account information, use the correct support channel, and remember that user-profile data is separate from public club branding and club-finance systems.`,
    FAQ: `${title} is a troubleshooting entry. The fastest answer normally comes from identifying which game state is blocking the action, then checking the page that owns that state instead of repeatedly clicking the disabled action.`,
  }

  const intro =
    categoryIntro[section.category] ??
    `${title} is a connected part of ProPeloton Manager. Read the page overview first, then check its status, requirements, cost, deadline and related links before taking action.`

  const factParagraph = factText
    ? `Important reference values for this topic are: ${factText}. Treat live values from the game page as authoritative whenever a value is database-driven, because prices, quotes, statuses or future balancing can change without the manual needing a code rewrite.`
    : `This topic does not depend on one fixed numeric value. Use the live page state, warnings and available actions as the authoritative source when making the final decision.`

  const commonMistakeByCategory: Record<string, string> = {
    Equipment: `A common mistake is to buy the strongest-looking item without checking condition, assignment status, race profile or setup compatibility. The safer approach is to build complete specialist setups and maintain the items that those setups depend on.`,
    Finance: `A common mistake is to look only at the current balance. A healthy balance can hide future salary, tax, policy, trip or debt obligations. Use recurring-cost information and Transactions together before committing cash.`,
    'Calendar and Races': `A common mistake is to treat the race date as the only important date. Application, team-list, rider-submission and Stage Plan deadlines can all happen earlier and can block the team before the actual race starts.`,
    'Race Preparation': `A common mistake is to see a saved plan and assume the race is ready. Saved, complete and usable are not always the same state. Read the readiness summary and fix missing supplies, roles or tactical blocks before lock.`,
    Transfers: `A common mistake is to judge a deal only by transfer fee or overall rating. Salary, contract length, scouting uncertainty, role fit, roster capacity and future cashflow can make a cheap-looking transfer expensive.`,
    'Transfers and Scouting': `A common mistake is to negotiate before reducing uncertainty. Scout important targets first, then use negotiation feedback to improve the weakest part of the offer rather than randomly increasing every cost.`,
    Training: `A common mistake is to maximize training intensity every day. Development only helps if the rider still has enough freshness, morale and health to perform when the important race arrives.`,
    Infrastructure: `A common mistake is to upgrade a facility because a higher level looks better. Infrastructure should solve staff-capacity, training, medical, scouting, mechanic or logistics needs that the club actually has.`,
  }

  const mistake =
    commonMistakeByCategory[section.category] ??
    `A common mistake is to ignore disabled-state messages, deadlines or prerequisites. When an action is unavailable, first read the visible requirement and then open the related page shown in the manual links.`

  return [intro, factParagraph, mistake]
}

function getExpandedDetailExplanation(section: ManualSection, detail: string): string {
  const d = detail.toLowerCase()
  const title = section.title

  if (d.includes('sold') || d.includes('discarded')) {
    return 'Once equipment is sold or discarded it leaves the active inventory. Before confirming, check whether the item is still used in a default or specialist setup and whether a replacement exists. Selling is a finance action as well as an equipment action because the decision changes both stock depth and club cash.'
  }

  if (d.includes('ready') && d.includes('worn')) {
    return 'Status should be read before condition. Ready means the item can normally participate in normal actions; Assigned means another setup/event currently owns the item; In Maintenance means it is temporarily unavailable; Worn means condition needs attention. The safest pre-race routine is to verify both status and condition for every item in the selected setup.'
  }

  if (d.includes('assigned')) {
    return 'Assigned is a protection state. It prevents the user from accidentally selling, repairing or reusing an item or asset that another plan currently depends on. Open the setup, race plan or assignment that owns it, replace/remove it there, then return to the inventory action.'
  }

  if (d.includes('repair quote') || d.includes('quote')) {
    return 'A quote is the game’s preview of the real consequence before confirmation. Always review total cost/refund, duration, eligibility and warnings. The quoted value is more reliable than an old manual example because backend balance/configuration can change over time.'
  }

  if (d.includes('condition')) {
    return 'Condition is a durability signal. Lower condition increases the need for maintenance and can reduce how safe it is to rely on the item/asset for important plans. Do not wait until every key item is worn at the same time; rotate repairs so the club keeps enough usable depth.'
  }

  if (d.includes('bidons') || d.includes('gels') || d.includes('nutrition')) {
    return 'Consumables are multiplied by riders and stages. The manager should calculate required stock using the actual number of selected riders and the whole stage count, then leave a small reserve when possible. A one-day stock estimate is not enough for a multi-stage race.'
  }

  if (d.includes('jersey') || d.includes('rain jackets') || d.includes('rain jacket')) {
    return 'Durable race supplies are tracked differently from one-use consumables. Their remaining stage-use capacity matters. Mandatory jersey shortages can block readiness; rain-jacket shortages mainly reduce weather flexibility. Replace worn-out units before an important race block.'
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
  const { t, i18n } = useTranslation('manual')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(() => new Set())

  const filteredSections = useMemo(() => {
    return manualSections
      .filter(section => category === 'all' || section.category === category)
      .map(section => localizeManualSection(section, t))
      .filter(section => sectionMatchesQuery(section, query))
  }, [category, query, t, i18n.language])

  const visibleCountLabel = t('ui.visibleCount', { count: filteredSections.length })

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
        <p className="text-xs uppercase tracking-[0.2em] text-yellow-300">{t('ui.eyebrow')}</p>

        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
          {t('ui.title')}
        </h1>

        <p className="mt-3 max-w-5xl text-sm leading-relaxed text-slate-100 md:text-base">
          {t('ui.description')}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {t('ui.sectionCount', { count: manualSections.length })}
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {t('ui.categoryCount', { count: manualCategories.length })}
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {t('ui.closedByDefault')}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/help"
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
          >
            {t('ui.backToHelp')}
          </Link>

          <button
            type="button"
            onClick={handlePrint}
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            {t('ui.printPdf')}
          </button>

          <a
            href="https://discord.gg/9W6rSSjm"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            {t('ui.askDiscord')}
          </a>
        </div>
      </section>

      <section className="rounded-xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('ui.startHereTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {t('ui.startHereDescription')}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t('ui.searchLabel')}</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('ui.searchPlaceholder')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t('ui.categoryLabel')}</span>
            <select
              value={category}
              onChange={event => setCategory(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
            >
              <option value="all">{t('ui.allCategories')}</option>
              {manualCategories.map(categoryName => (
                <option key={categoryName} value={categoryName}>
                  {t(`categories.${manualCategoryKey(categoryName)}`, { defaultValue: categoryName })}
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
              {t('ui.openVisible')}
            </button>

            <button
              type="button"
              onClick={closeAllSections}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              {t('ui.closeAll')}
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-slate-500">{visibleCountLabel}</div>
      </section>

      <section className="space-y-3">
        {filteredSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('ui.noSectionsTitle')}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {t('ui.noSectionsDescription')}
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
                    {isOpen ? t('ui.close') : t('ui.open')}
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-slate-100 px-5 py-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="text-sm font-semibold text-slate-900">{t('ui.summary')}</h3>
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
                      <h3 className="text-sm font-semibold text-slate-900">{t('ui.detailedExplanation')}</h3>
                      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                        {getLocalizedSectionGuideParagraphs(
                          section,
                          manualSectionById.get(section.id)?.category ?? section.category,
                          t,
                        ).map(paragraph => (
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
                            {t('ui.rule', { count: index + 1 })}
                          </div>
                          <p className="mt-2 font-semibold text-slate-900">{paragraph}</p>
                          <p className="mt-2 text-slate-700">
                            {getLocalizedExpandedDetailExplanation(
                              section,
                              manualSectionById.get(section.id)?.details[index] ?? paragraph,
                              t,
                            )}
                          </p>
                        </div>
                      ))}
                    </div>

                    {section.tips && section.tips.length > 0 ? (
                      <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                        <h3 className="text-sm font-semibold text-slate-900">{t('ui.practicalTips')}</h3>
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
        <h2 className="text-lg font-semibold">{t('ui.maintenanceTitle')}</h2>
        <p className="mt-2 max-w-5xl text-sm leading-relaxed text-slate-200">
          {t('ui.maintenanceDescription')}
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/contact-us"
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
          >
            {t('ui.contactUs')}
          </Link>

          <a
            href="https://discord.gg/9W6rSSjm"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            {t('ui.askDiscord')}
          </a>
        </div>
      </section>
    </div>
  )
}
