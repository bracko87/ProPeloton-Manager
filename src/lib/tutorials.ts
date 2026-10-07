export type TutorialKey =
  | 'overview'
  | 'squad'
  | 'training'
  | 'equipment'
  | 'facilities'
  | 'calendar'
  | 'race-detail'
  | 'race-preparation'
  | 'team-ranking'
  | 'statistics'
  | 'transfers'
  | 'finance'
  | 'menu'
  | 'sponsors'
  | 'staff'
  | 'settings'
  | 'national-championships'
  | 'national-association'
  | 'national-coach'
  | 'youth-academy'
  | 'youth-graduation'
  | 'developing-team'
  | 'new-season'

export type TutorialStep = {
  key: string
  title: string
  body: string
  accessNote?: string
  tip?: string
  primaryAction?: string
  secondaryAction?: string
  target?: string
  compact?: boolean
  requireTargetClick?: boolean
}

export const overviewWelcomeTutorial = {
  title: 'Welcome to ProPeloton Manager',
  body:
    'Welcome to the game. This tutorial can help you understand the main pages and the most important systems step by step.\n\n' +
    'You can start the tutorial now, or skip it and use the game manual later.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const overviewSkippedTutorialMessage = {
  title: 'No problem!',
  body:
    'You can always find help later through the Help section, the game manual, or our Discord community.\n\n' +
    'Good luck and enjoy your first season!',
  primaryAction: 'Continue',
}

export const overviewTutorialSteps: TutorialStep[] = [
  {
    key: 'welcome-game',
    title: 'Welcome to ProPeloton Manager',
    body:
      'Welcome to ProPeloton Manager.\n\n' +
      'You are now the manager of your own cycling team. Your job is to build the club, take care of your riders, prepare races, manage money, improve the team, and guide your club through the season.',
    primaryAction: 'Next',
    tip: 'Do not try to master every system at once. Follow the tutorial flow and learn the pages in the same order you will normally use them.',
  },
  {
    key: 'welcome-game-type',
    title: 'What Kind of Game Is This?',
    body:
      'This is a cycling management game.\n\n' +
      'You are not controlling the bike directly during the race. Instead, you make the important manager decisions before and during the season: which riders to keep, how to train them, which races to enter, what equipment to use, which staff to hire, and how to spend your money.',
    primaryAction: 'Next',
    tip: 'Your biggest performance gains come from good management decisions before the race, not from clicking faster during the race.',
  },
  {
    key: 'welcome-simple-or-deep',
    title: 'Play Simple or Go Deep',
    body:
      'You do not need to understand everything immediately.\n\n' +
      'At the beginning, you can play in a simple way: follow alerts, check your squad, enter races, prepare your team, and watch results.\n\n' +
      'Later, if you want more depth, you can use advanced systems like rider fatigue, morale, race sharpness, sponsor objectives, equipment bonuses, training camps, scouting, transfer negotiations, taxes, infrastructure, and promotion or relegation.',
    primaryAction: 'Next',
    tip: 'Start simple. Add advanced systems only when the basic routine of squad, training, races and finances feels comfortable.',
  },
  {
    key: 'welcome-access-model',
    title: 'Free, Premium and Coins',
    body:
      'ProPeloton Manager uses three different access types, and the tutorial will point them out whenever they matter.\n\n' +
      'Core gameplay is available without Premium. Premium unlocks selected advanced analysis, automation, convenience tools and specific Premium modules. Coins are a separate resource used for selected one-time or seasonal unlocks.\n\n' +
      'A feature can therefore be Free, Premium-only, Coin-unlocked, or available through either Premium or a permanent Coin unlock. The locked panel or button will always show which rule applies.',
    accessNote:
      'Premium and Coins are separate. Having Premium does not automatically replace every Coin-based service cost, and spending Coins does not automatically make the account Premium.',
    primaryAction: 'Next',
    tip:
      'Whenever you see a locked feature during this tutorial, read the Access box. It will tell you whether the feature is part of the free game, Premium, a Coin unlock, or a combination.',
  },
  {
    key: 'welcome-tutorial-purpose',
    title: 'What This Tutorial Will Do',
    body:
      'This tutorial will guide you through the main pages of the game one by one.\n\n' +
      'You will learn what each page is for, which buttons are important, and what you should check as a new manager.\n\n' +
      'The tutorial will not explain every small detail at once. For deeper explanations, you can always use the full game manual later.',
    primaryAction: 'Next',
    tip: 'Use Previous whenever you want to re-read a step. You can also return to tutorials later from Help.',
  },
  {
    key: 'welcome-start-overview',
    title: 'Let’s Start With the Overview Page',
    body:
      'We will start with the Overview page.\n\n' +
      'This is your main manager dashboard. It gives you the fastest picture of your team: current alerts, news, finances, races, sponsor messages, rider condition, and season progress.\n\n' +
      'After this introduction, I will explain the Overview page step by step.',
    primaryAction: 'Start Overview tutorial',
    tip: 'A good daily habit is to open Overview first and only then move to the page that needs action.',
  },
  {
    key: 'overview-dashboard',
    title: 'Your Manager Dashboard',
    body:
      'This is your Overview page — the main dashboard for your team.\n\n' +
      'Think of this page as your daily control room. When you log in, this is usually the first place you should check.\n\n' +
      'Here you can quickly see the most important information about your club, including team status, current alerts, finances, races, rider condition, and season progress.',
    accessNote: 'Core Overview is available to every manager. Some advanced dashboard analysis and convenience panels are Premium, while selected optional unlocks elsewhere in the game may use Coins.',
    primaryAction: 'Next',
    tip: 'Use Overview as your daily checklist. If nothing here needs attention, your club is usually safe to continue to the next game day.',
  },
  {
    key: 'overview-staff-briefing',
    title: 'Staff Briefing Centre',
    body:
      'This panel shows your support staff and assistant roles.\n\n' +
      'Here you can see important team helpers such as the Head Coach, Sports Director, Team Doctor, Chief Mechanic, and other assistant roles when available.\n\n' +
      'These assistants help you manage important parts of your club more efficiently, such as race planning, rider health, preparation, and equipment support.\n\n' +
      'Some assistant functions, staff tools, or automation-related features may require a Premium account or coin purchase to use fully.',
    primaryAction: 'Next',
    tip: 'Advisors are most useful when you give them a clear role. Do not renew every advisor automatically if you are not using the advice.',
    target: 'overview-attention',
  },
  {
    key: 'overview-manager-focus',
    title: 'Club Status & Priorities',
    body:
      'This block gives you a fast operational picture of the club.\n\n' +
      'It combines upcoming races, races happening today, weekly finances, active operations, and the most important current action items. It is a factual dashboard summary, not a Staff Advisor report.\n\n' +
      'Use the Open buttons on priority rows to jump directly to the page that needs attention.',
    primaryAction: 'Next',
    tip: 'Open priority items directly from this panel instead of searching through the menu.',
    target: 'overview-manager-focus',
  },
  {
    key: 'overview-next-race',
    title: 'Next Team Race',
    body:
      'The Next Team Race panel helps you see what is coming soon for your team.\n\n' +
      'This is important because accepted races often still need preparation. You may need to select riders, staff, assets, equipment, supplies, and stage tactics before the deadlines.\n\n' +
      'If this panel shows an upcoming race, you should check Race Preparation early.',
    primaryAction: 'Next',
    tip: 'Check the next accepted race early; race-plan and rider deadlines can arrive faster than expected.',
    target: 'overview-next-team-race',
  },
  {
    key: 'overview-last-race',
    title: 'Last Team Race',
    body:
      'The Last Team Race panel shows your most recent finished race when available.\n\n' +
      'Use this to quickly review how your team performed. Results can help you decide if riders need rest, if tactics worked well, or if your squad needs changes before the next event.',
    primaryAction: 'Next',
    tip: 'After a difficult race, check rider condition before immediately assigning hard training or another race.',
    target: 'overview-last-team-race',
  },
  {
    key: 'overview-sponsor',
    title: 'Main Sponsor',
    body:
      'The Main Sponsor panel shows your primary sponsor information when you have an active main sponsor.\n\n' +
      'Sponsors are important because they can provide money, bonuses, objectives, and sometimes branding effects. Some sponsor contracts are simple, while naming-rights sponsors can temporarily change your team name during the season.',
    primaryAction: 'Next',
    tip: 'Sponsor objectives can change which races are worth targeting, so compare them with your calendar plans.',
    target: 'overview-main-sponsor',
  },
  {
    key: 'overview-progress',
    title: 'Team Health and Season Progress',
    body:
      'The rest of the Overview page helps you follow your team’s condition and progress.\n\n' +
      'Here you can monitor rider condition, finance health, sponsor activity, race activity, active operations, season snapshot data, and general season progress.\n\n' +
      'Some advanced dashboard sections, summaries, or additional data views may require a Premium account or coin purchase to unlock. If a panel is locked, you can still play normally, but Premium or coins can make the game easier and give you a deeper view of your club.\n\n' +
      'As your club grows, this page becomes more useful because it helps you connect short-term actions, like preparing the next race, with long-term goals such as building a stronger squad and improving your ranking.',
    primaryAction: 'Continue to Squad',
    tip: 'Use the dashboard for direction, then open the specialist page when you need to make a detailed decision.',
    secondaryAction: 'Finish for now',
  },
]

export const squadWelcomeTutorial = {
  title: 'Need help with your Squad?',
  body:
    'We can show you a short introduction to the Squad page, where you manage your riders, developing team, movement windows, and staff.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const squadTutorialSteps: TutorialStep[] = [
  {
    key: 'squad-riders',
    title: 'Your Riders',
    body:
      'This is the Squad page — the main place where your team riders are displayed.\n\n' +
      'In the general view, you can see important rider information such as age, country, role, overall level, condition, market value, wages, contract details, and international points.\n\n' +
      'Use this page whenever you want to understand the current strength and structure of your team.',
    primaryAction: 'Next',
    tip: 'Look at squad balance, not only overall ratings. A team needs different rider types for different race profiles.',
    target: 'squad-riders-table',
  },
  {
    key: 'squad-rider-details',
    title: 'Rider Views and Profiles',
    body:
      'The Squad page gives you different ways to look at your riders.\n\n' +
      'You can check financial information, skills, form, development, health, and availability. Skills can improve over time, so this page helps you follow how each rider is developing.\n\n' +
      'By clicking the View button, you can open the full rider profile with more detailed information.\n\n' +
      'Some advanced rider tools, additional dashboards, or convenience features may require a Premium account or coin purchase.',
    primaryAction: 'Next',
    tip: 'Open rider profiles before important decisions; condition, fatigue, contract and development context can matter as much as the headline rating.',
    target: 'squad-rider-view-button',
    compact: true,
  },
  {
    key: 'squad-developing-team',
    title: 'Developing Team and Movement Window',
    body:
      'Your Developing Team is the normal bridge for young riders who are not yet ready for the First Squad and can race in assigned development competitions.\n\n' +
      'The Developing Team is available to Free and Premium managers. It costs 100 coins to activate and 100 coins per season to renew. Premium membership is not required for the Developing Team service or normal U23 Head Coach use.\n\n' +
      'Youth Academy graduates can move into the Developing Team before progressing to the First Squad. Riders can move between the First Squad and Developing Team only during the normal movement windows. Premium-only automation or advanced analysis remains separate from the core Developing Team service.',
    accessNote: 'The Developing Team is not Premium-only. It is a separate service that can be activated with Coins and renewed seasonally; Premium only adds selected advanced analysis/automation around it.',
    primaryAction: 'Next',
    tip: 'Use the Developing Team as a pathway, not just extra storage. Keep places available for riders who still need development.',
    target: 'squad-developing-team',
  },
  {
    key: 'squad-staff',
    title: 'Staff and Next Page',
    body:
      'The Staff button shows the staff members working for your club and the current limits of your staff setup.\n\n' +
      'Staff members have their own skills and can be sent on courses. Staff limits can also be improved by upgrading your infrastructure.\n\n' +
      'After Squad, the next recommended page is Training, where you can set regular training and plan training camps for your riders.',
    primaryAction: 'Continue to Training',
    tip: 'Staff limits and specialisations matter. Hire for a real need instead of filling every available slot immediately.',
    secondaryAction: 'Finish for now',
    target: 'squad-staff',
  },
]

export const trainingWelcomeTutorial = {
  title: 'Need help with Training?',
  body:
    'We can show you how regular training and training camps work, and how they affect rider development, fatigue, and race preparation.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const trainingTutorialSteps: TutorialStep[] = [
  {
    key: 'training-regular',
    title: 'Regular Training',
    body:
      'This is the Training page.\n\n' +
      'In Regular Training, you can control what your riders train when they are not assigned to another activity such as a race or training camp.\n\n' +
      'You can set team default training for the First Team and Developing Team, and you can also adjust training for individual riders. Each rider can train a specific focus such as sprint, climbing, flat, time trial, endurance, resistance, race IQ, teamwork, or recovery.\n\n' +
      'Training intensity matters. Harder training can improve riders faster, but it can also make them more tired before upcoming races. You can also choose Day Off when a rider needs rest and fatigue recovery.',
    accessNote: 'Manual regular training and team/rider training controls remain available without Premium. Premium adds Head Coach automation, smart template/prefill tools and advanced rider-development analysis.',
    primaryAction: 'Next',
    tip: 'Avoid pushing every rider with the same workload. Match training to role, fatigue and the next important races.',
  },
  {
    key: 'training-camps',
    title: 'Training Camps',
    body:
      'Training Camps are special blocks of training where you send selected riders away for several days.\n\n' +
      'A training camp can give stronger skill development than regular daily training, but it costs much more. You choose the camp type, location, dates, duration, riders, and available staff.\n\n' +
      'Staff can improve the effect of the camp or help protect riders better, depending on their skills and availability. Before booking, you can review the cost, weather risk, selected riders, selected staff, and validation warnings.\n\n' +
      'After Training, the next recommended page is Equipment.',
    primaryAction: 'Continue to Equipment',
    tip: 'Book camps around the race calendar. A strong camp is wasted if it leaves riders tired for your main target.',
    secondaryAction: 'Finish for now',
  },
]

export const equipmentWelcomeTutorial = {
  title: 'Need help with Equipment?',
  body:
    'We can show you how Equipment works, including race setups, inventory, market purchases, and race supplies.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const equipmentTutorialSteps: TutorialStep[] = [
  {
    key: 'equipment-overview',
    title: 'Equipment Overview',
    body:
      'This is the Equipment page.\n\n' +
      'The Overview tab gives you a summary of your team equipment and your race setup configurations.\n\n' +
      'The Default Race Setup is the setup used when you do not choose a specific setup for a race. Below that, you can create different race setup configurations that can later be selected in Race Preparation.\n\n' +
      'Each setup can bring different bonuses to your riders, depending on the equipment inside it and how many usable items are available.',
    accessNote: 'Core equipment management is available without Premium. Premium adds Equipment Intelligence and selected automation. Saved setup slots 3 and 4 are available with Premium or can be permanently unlocked with Coins.',
    primaryAction: 'Next',
    tip: 'Build equipment around the races you actually plan to enter. A balanced inventory is usually safer for a new club.',
  },
  {
    key: 'equipment-inventory',
    title: 'Inventory',
    body:
      'The Inventory tab shows all equipment your team currently owns.\n\n' +
      'Here you can see items such as bikes, wheels, tires, and other equipment you purchased. You can check quality, condition, value, bonuses, and availability.\n\n' +
      'If you no longer need some equipment, you can sell it from your inventory.',
    primaryAction: 'Next',
    tip: 'Check what you already own before buying more. Duplicate equipment can lock unnecessary money in inventory.',
  },
  {
    key: 'equipment-market',
    title: 'Equipment Market',
    body:
      'The Market tab is where you buy new equipment.\n\n' +
      'Each item has a price and can bring different bonuses. Better equipment can improve race performance, but it also costs more.\n\n' +
      'When you purchase equipment, it is sent to your Inventory and can later be used in race setups.',
    accessNote: 'Buying normal equipment uses club cash. The market itself is not Premium-only, but Premium adds comparison/intelligence tools that help evaluate multiple items more quickly.',
    primaryAction: 'Next',
    tip: 'Compare bonuses and negative effects, not only price. The most expensive item is not automatically the best fit for every rider or race.',
  },
  {
    key: 'equipment-race-supplies',
    title: 'Race Supplies',
    body:
      'The Race Supplies tab shows consumable supplies your team can use for races.\n\n' +
      'Some supplies can be used only once, while others may be used multiple times. Supplies can help protect riders from difficult race conditions.\n\n' +
      'Without the right race supplies, riders may receive negative effects in very hot, cold, or demanding weather conditions.\n\n' +
      'Race Jersey Kits are strongly recommended, but a shortage does not remove your team or block a Stage Plan. Riders without a usable kit race in normal team clothing and the team receives a proportional performance penalty. A complete shortage means -30% positive preparation bonuses, +8% in-stage energy use and +15% post-stage fatigue.\n\n' +
      'After Equipment, the next recommended page is Infrastructure.',
    primaryAction: 'Continue to Infrastructure',
    tip: 'Keep a small reserve of important consumables so a late race preparation does not force an emergency purchase.',
    secondaryAction: 'Finish for now',
  },
]

export const facilitiesWelcomeTutorial = {
  title: 'Need help with Infrastructure?',
  body:
    'We can show you how facilities and team assets work, including upgrades, staff limits, vehicles, bonuses, and construction projects.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const facilitiesTutorialSteps: TutorialStep[] = [
  {
    key: 'facilities-buildings',
    title: 'Facilities',
    body:
      'This is the Infrastructure page.\n\n' +
      'The Facilities tab shows the buildings your club can own and upgrade. Every team starts with a basic Level 1 Clubhouse.\n\n' +
      'Later, you can build and upgrade important facilities such as the Training Center, Medical Center, Academy-support facilities, Mechanics Workshop, and Scouting Office. The separate Youth Academy / U16 programme is a Premium feature with its own activation and seasonal access rules.\n\n' +
      'Facilities are important because they improve your club and can also define how many staff members you are allowed to have.',
    primaryAction: 'Next',
    tip: 'Upgrade the facility that removes your current bottleneck first, such as staff capacity, training, medical support or scouting.',
    target: 'facilities-buildings',
  },
  {
    key: 'facilities-projects',
    title: 'Builds, Upgrades and Refunds',
    body:
      'When you open the details for a facility, you can see what the next level costs, how long construction takes, and what bonuses or unlocks it will bring.\n\n' +
      'You can start a build or upgrade project when your club has enough money and available project capacity.\n\n' +
      'You can also cancel an infrastructure project. If you cancel immediately, you receive a full refund. If you cancel later, the refund can be smaller.',
    primaryAction: 'Next',
    tip: 'Before starting a long build, check both the cost and the construction time so it does not compete with more urgent spending.',
    target: 'facilities-buildings',
  },
  {
    key: 'facilities-assets',
    title: 'Team Assets',
    body:
      'The Assets tab shows vehicles and support assets your team can use.\n\n' +
      'This includes team cars, team buses, equipment vans, mobile workshops, and medical vans. These assets can support your team during races, travel, preparation, and training camps.\n\n' +
      'Each asset can have different levels, costs, condition, bonuses, and limits. Open the details for each asset to understand what it brings and how it can help your team perform better.\n\n' +
      'To use this page fully, some advanced functions, management options, or extended tools may require a Premium account or coin purchase.',
    accessNote: 'Normal facilities and asset purchases use club cash. Garage capacity starts with free slots; additional capacity can include Premium slots, and eligible locked slots can also be permanently unlocked with the Coin price shown on the page.',
    primaryAction: 'Continue to Calendar',
    tip: 'Buy support assets for your real race programme. More vehicles are useful only when you have enough races to use them.',
    secondaryAction: 'Finish for now',
    target: 'facilities-assets',
  },
]

export const calendarWelcomeTutorial = {
  title: 'Need help with the Calendar?',
  body:
    'We can show you how the Calendar works, including daily team activities, race months, sponsor race goals, and race profile pages.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const calendarTutorialSteps: TutorialStep[] = [
  {
    key: 'calendar-season',
    title: 'Season Calendar',
    body:
      'This is the Season Calendar.\n\n' +
      'It gives you an overview of your team’s daily activities. For each day, you can see what is happening with your club, including races, training camps, events, holidays, and other important activities.\n\n' +
      'Use this view when you want to understand your team schedule day by day.',
    accessNote: 'The normal Season Calendar is available without Premium. The advanced Season Planner and its deeper schedule analysis are Premium features.',
    primaryAction: 'Next',
    tip: 'Use Season Calendar to spot clashes between racing, training camps and recovery before they become a problem.',
  },
  {
    key: 'calendar-races',
    title: 'Race Calendar',
    body:
      'This is the Race Calendar.\n\n' +
      'Here you can see all races in the season. Races can be one-day races or multi-day stage races. Each race shows useful information such as date, race status, race category, race type, team limits, and application status.\n\n' +
      'Races are divided by month, so each month has its own list of available races.',
    accessNote: 'The Race Calendar and standard filters are available without Premium. Premium adds extra planning intelligence such as sponsor-goal filtering and deeper season-planning context.',
    primaryAction: 'Next',
    tip: 'Choose races that fit both your squad strength and your budget. Early points and prize money are often more valuable than prestige alone.',
  },
  {
    key: 'calendar-open-race',
    title: 'Open a Race Profile',
    body:
      'Some races may show a sponsor goal marker. This means the race is connected to a sponsor bonus objective, such as participating or achieving a specific result.\n\n' +
      'Use the Open Race button when you want to see more details about a race or apply for it.\n\n' +
      'Next, we will open one race profile so you can see what information is available there.',
    primaryAction: 'Open Race Profile',
    tip: 'Open the race profile before applying. The route, category, dates and rider requirements should match your plan.',
    secondaryAction: 'Finish for now',
  },
]

export const raceDetailTutorialSteps: TutorialStep[] = [
  {
    key: 'race-detail-overview',
    title: 'Race Profile',
    body:
      'This is the Race Profile page.\n\n' +
      'Here you can see the most important race information: how many teams can participate, the prize fund, when applications close, when participating teams are announced, and how many riders each team can bring.\n\n' +
      'For stage races, you can also see how many stages are included.',
    primaryAction: 'Next',
    tip: 'Before applying, check the complete date window and rider limits, not only the race day itself.',
  },
  {
    key: 'race-detail-stages-results',
    title: 'Stages, Results and Replay',
    body:
      'The race profile also shows detailed stage information.\n\n' +
      'You can review stage profiles, route maps, terrain split, stage weather, sprint points, mountain points, and other stage details. Weather is only published close to the race, so it may appear later.\n\n' +
      'Further down, Race Information shows participating teams and riders before the race, and results after the race. If your team participates and the race is active or finished, you can use Watch Race or Watch Replay to follow the action on the map.',
    primaryAction: 'Continue to Race Preparation',
    tip: 'For stage races, inspect more than one stage. A race that looks suitable overall can still contain one decisive stage that does not fit your team.',
    secondaryAction: 'Finish for now',
  },
]

export const racePreparationWelcomeTutorial = {
  title: 'Need help with Race Preparation?',
  body:
    'We can show you how Accepted Races, Race Plans, and Stage Plans work. This is one of the most important pages during the season.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const racePreparationTutorialSteps: TutorialStep[] = [
  {
    key: 'race-preparation-accepted-races',
    title: 'Accepted Races',
    body:
      'This is the Race Preparation page.\n\n' +
      'The Accepted Races tab shows races where your team has been accepted to participate.\n\n' +
      'Here you can see the most important race information, but also your team’s preparation status. For example, you may see Race Plan Open, Stage Plans Open, Rider Deadline Reached, Race Active, Race Finished, or All Set.\n\n' +
      'When your team is accepted to a race, you should come here to prepare your riders, staff, assets, equipment, supplies, and tactics. This is one of the pages you will visit most often during the season.',
    primaryAction: 'Next',
    tip: 'Visit Race Preparation as soon as a team is accepted. Waiting until the deadline removes your ability to react to conflicts.',
  },
  {
    key: 'race-preparation-race-plan',
    title: 'Race Plan',
    body:
      'The Race Plan tab is where you prepare your team for an accepted race.\n\n' +
      'Important: game time moves faster than real life. One in-game day is 12 hours in real-life time. This means two in-game days equal one real-life day. Keep this in mind when checking race plan windows, rider deadlines, and stage plan deadlines.\n\n' +
      'When the Race Plan window is open, you can choose whether your First Team or Developing Team will race, if you have a Developing Team available.\n\n' +
      'You must also check the rider submission deadline. Until that date, you can choose the riders who will participate. The page shows the minimum and maximum number of riders allowed for the race.\n\n' +
      'The rider list shows who can be selected and who is blocked because they are already assigned to another overlapping race. You can also assign race staff and race assets if they are available.\n\n' +
      'The cost preview updates while you build the plan, so you can see how much the race will cost. On the right side, the bonus preview shows possible support bonuses from staff, assets, equipment, and team policies.',
    primaryAction: 'Next',
    tip: 'Build the rider list first, then staff, assets and support. That makes the cost and availability picture easier to understand.',
  },
  {
    key: 'race-preparation-stage-plans',
    title: 'Stage Plans',
    body:
      'The Stage Plans tab opens after the Race Plan has been submitted.\n\n' +
      'Here you prepare the tactics for each stage. You can define rider roles, equipment, supplies, team tactics, and individual tactics for every stage. A Race Jersey Kit shortage is a performance warning, not a participation blocker: the plan can still be saved and the team still races.\n\n' +
      'Stage Plans are important because different stages need different plans. A flat sprint stage, mountain stage, time trial, or hilly stage may all require different riders, tactics, and support.\n\n' +
      'After Race Preparation, the next recommended page is Team Ranking.',
    accessNote: 'Race Plan and Stage Plans are core gameplay. Premium adds the Race Strategy Lab, smart prefills and advanced strategy analysis; Premium is not required to submit a normal race or stage plan.',
    primaryAction: 'Continue to Team Ranking',
    tip: 'Do not copy the same plan to every stage. Rider roles and tactics should change with the terrain and race objective.',
    secondaryAction: 'Finish for now',
  },
]

export const teamRankingWelcomeTutorial = {
  title: 'Need help with Team Ranking?',
  body:
    'We can show you how team rankings, competition tiers, international points, promotion, and relegation work.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const teamRankingTutorialSteps: TutorialStep[] = [
  {
    key: 'team-ranking-competitions',
    title: 'Competitions and Tiers',
    body:
      'This is the Team Ranking page.\n\n' +
      'Here you can see rankings for all competitions and tiers, including WorldTeam, ProTeam, Continental, and Amateur divisions.\n\n' +
      'Each team has a place in its competition based on international points earned during the season. You can switch between tiers and divisions to see how teams are ranked across the whole cycling world.',
    primaryAction: 'Next',
    tip: 'Compare your team mainly with the clubs around your promotion or relegation zone, not only with the overall leader.',
  },
  {
    key: 'team-ranking-points',
    title: 'International Points and Season Movement',
    body:
      'Teams earn international points from races. Better results in bigger races usually bring more points.\n\n' +
      'These points decide the ranking position of each team inside its competition. At the end of the season, teams can be promoted to a higher tier or relegated to a lower tier depending on their final position.\n\n' +
      'This page is important because it shows where your team stands compared with other teams, and what you need to achieve to move up.\n\n' +
      'After Team Ranking, the next recommended page is Statistics.',
    primaryAction: 'Continue to Statistics',
    tip: 'When planning the calendar, consider where realistic points are available. Consistent scoring can matter more than one ambitious race.',
    secondaryAction: 'Finish for now',
  },
]

export const statisticsWelcomeTutorial = {
  title: 'Need help with Statistics?',
  body:
    'We can show you how team and rider statistics work, including current season rankings, historical results, rider points, podiums, and jerseys.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const statisticsTutorialSteps: TutorialStep[] = [
  {
    key: 'statistics-teams-current',
    title: 'Team Statistics',
    body:
      'This is the Statistics page.\n\n' +
      'The Teams section shows team statistics across all competitions in one place. In Current, you can see the current season and compare which teams are the most successful by points.\n\n' +
      'You can use filters to look at different tiers, divisions, countries, user teams, AI teams, active teams, and inactive teams. You can also open a team profile to see more details about that team.',
    primaryAction: 'Next',
    tip: 'Use filters to compare like with like. Your closest competitive tier is usually more useful than the global table.',
  },
  {
    key: 'statistics-teams-history',
    title: 'Team History',
    body:
      'The History section shows previous seasons.\n\n' +
      'Here you can review past winners, old season snapshots, historical positions, and how teams performed in earlier seasons.\n\n' +
      'This becomes more useful as your world progresses through multiple seasons.',
    primaryAction: 'Next',
    tip: 'History helps you judge whether improvement is real. Compare several seasons instead of one short run of results.',
  },
  {
    key: 'statistics-riders',
    title: 'Rider Statistics',
    body:
      'The Riders section shows the best riders in the cycling world.\n\n' +
      'You can compare riders by international points, stage finish points, general classification and one-day race points. You can also see riders with the most podiums and most jerseys.\n\n' +
      'This page helps you understand which riders are dominating the season and which riders may be interesting to follow, scout, or sign.\n\n' +
      'After Statistics, the next recommended page is Transfers.',
    primaryAction: 'Continue to Transfers',
    tip: 'Statistics are a good scouting starting point, but always open the rider profile before making a transfer decision.',
    secondaryAction: 'Finish for now',
  },
]

export const transfersWelcomeTutorial = {
  title: 'Need help with Transfers?',
  body:
    'We can show you how rider transfers, free agents, scouting, contract negotiations, and staff hiring work.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const transfersTutorialSteps: TutorialStep[] = [
  {
    key: 'transfers-rider-transfer-list',
    title: 'Rider Transfer List',
    body:
      'This is the Transfers page.\n\n' +
      'In the Riders section, the Transfer List shows riders currently listed by other teams, including AI teams.\n\n' +
      'Before you scout a rider, some information may be hidden or less precise. Scouting gives you better information about the rider’s skills and potential.\n\n' +
      'Each transfer listing shows how long the offer is valid and the starting price for negotiations. If you click Make Offer, you can offer money to the selling team. If the team accepts, you then negotiate the rider contract.',
    primaryAction: 'Next',
    tip: 'Scout before spending heavily. Hidden or uncertain information makes expensive transfer offers much riskier.',
  },
  {
    key: 'transfers-rider-free-agents',
    title: 'Free Agent Riders',
    body:
      'Free Agents are riders without a team.\n\n' +
      'The big difference is that there is no selling team between you and the rider. If you want a free agent, you go directly into contract negotiation.\n\n' +
      'You can negotiate salary, contract duration, and agent fee. The offer outlook helps you understand whether your offer looks strong, risky, or unlikely to succeed.',
    primaryAction: 'Next',
    tip: 'Free agents avoid a transfer fee, but salary and agent costs can still make the total deal expensive.',
  },
  {
    key: 'transfers-staff',
    title: 'Staff Market',
    body:
      'The Staff tab shows available free-agent staff members.\n\n' +
      'Here you can review staff skills, role, salary, specialization, and availability. Only free-agent staff can be hired.\n\n' +
      'Staff limits are important. If your club has already reached the maximum number for a staff role, you cannot hire another staff member for that role until you increase the limit, usually through infrastructure upgrades.\n\n' +
      'After Transfers, the next recommended page is Finance.',
    primaryAction: 'Continue to Finance',
    tip: 'Check role limits before negotiating. Infrastructure can be the real blocker even when the staff member is available.',
    secondaryAction: 'Finish for now',
  },
]

export const financeWelcomeTutorial = {
  title: 'Need help with Finance?',
  body:
    'We can show you how club finances work, including balance, sponsors, transactions, taxes, and team policies.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const financeTutorialSteps: TutorialStep[] = [
  {
    key: 'finance-overview',
    title: 'Finance Overview',
    body:
      'This is the Finance page.\n\n' +
      'The Overview tab shows the main financial situation of your club, including current balance, income, expenses, cashflow, and financial summaries.\n\n' +
      'If your team has emergency debt or financial problems, this is where you can quickly understand the current situation.',
    accessNote: 'Core finance, balance, income, expenses and transactions are available without Premium. The Financial Simulator and deeper forecasting tools are Premium features.',
    primaryAction: 'Next',
    tip: 'Keep enough cash for upcoming salaries, races and planned projects instead of spending the complete balance immediately.',
  },
  {
    key: 'finance-sponsors',
    title: 'Sponsors',
    body:
      'The Sponsors tab shows the sponsors your team has already signed.\n\n' +
      'Sponsors can bring money to the club, but they may also have targets or bonus objectives. These targets explain what your team needs to achieve and how much money you can receive.\n\n' +
      'Sponsor contracts can be standard contracts or naming-rights contracts. A standard sponsor contract gives your club sponsor money without changing your team name.\n\n' +
      'A naming-rights contract is usually worth more money, but the sponsor name becomes part of your team name during the season. At the beginning of the next season, your original team name returns.\n\n' +
      'If your team does not have a sponsor yet, you can use the sponsor offers area to look for new deals.',
    accessNote: 'Normal sponsor contracts and sponsor objectives remain part of the core game. Premium adds Sponsor Intelligence and deeper objective/risk analysis.',
    primaryAction: 'Next',
    tip: 'Compare guaranteed money with achievable objectives. A smaller realistic bonus can be better than a larger target your team cannot reach.',
  },
  {
    key: 'finance-transactions',
    title: 'Transactions',
    body:
      'The Transactions tab shows your club’s financial history.\n\n' +
      'Here you can see income and expenses during the season, including prize money, sponsor payments, salaries, transfers, infrastructure costs, equipment purchases, training camps, tax withdrawals, and other financial movements.',
    primaryAction: 'Next',
    tip: 'Use Transactions when the balance changes unexpectedly. It is the fastest way to find exactly where money moved.',
  },
  {
    key: 'finance-tax',
    title: 'Tax',
    body:
      'The Tax tab shows your club’s tax situation.\n\n' +
      'Transactions can create tax obligations, and a tax audit happens once per month. This page helps you see how much tax has been calculated, what has already been paid, and what still needs to be paid.',
    primaryAction: 'Next',
    tip: 'Treat tax as committed money. Do not plan future spending as if the complete visible balance is freely available.',
  },
  {
    key: 'finance-policies',
    title: 'Team Policies and Operations',
    body:
      'Team Policies and Operations control how your club is run.\n\n' +
      'Changing policies can make your club more attractive to riders and staff, but it can also increase the cost of travel, race support, training camps, and daily operations.\n\n' +
      'This section helps you balance comfort, performance, attractiveness, and cost.\n\n' +
      'After Finance, the tutorial will briefly introduce National Ranking, the National Association, and the Youth Academy before finishing with the main Menu.',
    primaryAction: 'Continue to National Ranking',
    tip: 'Policies should fit your budget. Improve comfort and support gradually rather than maxing every recurring cost at once.',
    secondaryAction: 'Finish for now',
  },
]

export const menuWelcomeTutorial = {
  title: 'Need help with the Menu?',
  body:
    'We can show you where to find the main menu, notifications, and coins in the top-right corner.',
  primaryAction: 'Start tutorial',
  secondaryAction: 'No thanks',
}

export const menuTutorialSteps: TutorialStep[] = [
  {
    key: 'menu-main',
    title: 'Main Menu',
    target: 'header-menu',
    body:
      'This is the main Menu button in the top-right corner.\n\n' +
      'Inside the menu, you can find Inbox for internal messages, profile settings, themes and customization settings, forum or Discord links, game preferences, help with the in-game manual and frequently asked questions, Contact Us, Pro Packages, and Invite Friends referral progress.\n\n' +
      'Use this menu whenever you need account settings, help, support, preferences, or extra game options.',
    primaryAction: 'Next',
    tip: 'Use Help and the manual whenever a system is unclear; you do not need to remember the entire tutorial.',
  },
  {
    key: 'menu-notifications',
    title: 'Notifications',
    target: 'header-notifications',
    body:
      'This bell icon opens your in-game notifications.\n\n' +
      'Notifications tell you about important events such as race deadlines, preparation reminders, sponsor updates, finances, transfers, and other game actions that need your attention.\n\n' +
      'You can manage which notifications you want to receive from the Preferences option inside the Menu.',
    primaryAction: 'Next',
    tip: 'Do not ignore red notification counts. Many important deadlines are surfaced here before they become problems.',
  },
  {
    key: 'menu-coins',
    title: 'Coins and Coin Unlocks',
    target: 'header-coins',
    body:
      'This shows your current Coin balance. Coins are separate from Premium and are used only where the game clearly labels a Coin action.\n\n' +
      'Important examples include activating and renewing the Developing Team, Youth Academy activation and seasonal renewal when Premium is active, shared National Association activation/renewal funding, permanent extra Equipment setup slots, eligible extra Infrastructure garage slots, and selected optional actions such as extra Youth scouting searches.\n\n' +
      'You can purchase more Coins through Menu → Pro Packages. Running out of Coins does not suspend your account or stop normal core gameplay.',
    accessNote:
      'A Coin button is never the same thing as Premium. Some services need Coins even for Premium users, while some locked features can be opened either by Premium access or by a permanent Coin unlock.',
    primaryAction: 'Next',
    tip:
      'Before spending Coins, read the button and the Access box carefully. The game should always tell you whether the cost is one-time, seasonal, shared, or optional.',
  },
  {
    key: 'menu-premium',
    title: 'Premium Account and Premium Center',
    target: 'header-premium',
    body:
      'The Premium button opens the Premium area and Premium Command Center. Premium focuses on deeper analysis, automation and convenience rather than replacing the normal management game.\n\n' +
      'Examples of Premium tools include Head Coach training automation and smart templates, advanced rider-development analysis, the Season Planner, Equipment Intelligence and comparison tools, the Race Strategy Lab, Financial Simulator, Sponsor Intelligence, and other Premium Command Center views. Youth Academy also requires Premium access before it can be activated.\n\n' +
      'The normal Squad, manual Training, Calendar, Race Preparation, Equipment buying, Finance, Transfers, rankings and race participation remain available through core gameplay.',
    accessNote:
      'Premium is an account-level upgrade. Coins remain separate: Premium does not automatically pay Coin activation or seasonal renewal costs for services such as Youth Academy or the Developing Team.',
    primaryAction: 'Next',
    tip:
      'When a Premium panel is locked, you can usually continue using the core page normally. Premium should add depth and convenience, not block the basic management loop.',
  },
  {
    key: 'menu-finished',
    title: 'Tutorial Completed',
    body:
      'You have successfully finished the basic ProPeloton Manager tutorial.\n\n' +
      'If you have questions later, you can always check the in-game manual, read the frequently asked questions, contact us, or join our Discord community.\n\n' +
      'Good luck with your team!',
    primaryAction: 'Finish tutorial',
    tip: 'After the tutorial, a simple routine is enough: Overview → next race → rider condition → finances → any notifications.',
  },
]