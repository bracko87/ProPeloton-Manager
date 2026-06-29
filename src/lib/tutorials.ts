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

export type TutorialStep = {
  key: string
  title: string
  body: string
  primaryAction?: string
  secondaryAction?: string
  target?: string
}

export const overviewWelcomeTutorial = {
  title: 'Need help getting started?',
  body:
    'We can show you a short introduction to the Overview page and explain the most important areas of your team dashboard.',
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
    key: 'overview-dashboard',
    title: 'Your Manager Dashboard',
    body:
      'This is your Overview page — the main dashboard for your team.\n\n' +
      'Here you can quickly see the most important information about your club, including team status, current alerts, finances, races, rider condition, and season progress.',
    primaryAction: 'Next',
  },
  {
    key: 'overview-attention',
    title: 'What Needs Your Attention',
    body:
      'The top part of the page helps you understand what needs action.\n\n' +
      'Attention alerts, news, today’s races, upcoming events, and quick summaries will help you know what is happening and what you should check next.',
    primaryAction: 'Next',
  },
  {
    key: 'overview-progress',
    title: 'Team Health and Season Progress',
    body:
      'The rest of the Overview helps you follow your team’s condition and progress.\n\n' +
      'You can monitor Squad Pulse, finances, sponsors, race activity, and your Season Snapshot. This page is your first stop whenever you want to understand how your team is doing.\n\n' +
      'When you are ready, we recommend continuing to the Squad page, where you can learn more about your riders.',
    primaryAction: 'Continue to Squad',
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
  },
  {
    key: 'squad-rider-details',
    title: 'Rider Views and Profiles',
    body:
      'The Squad page gives you different ways to look at your riders.\n\n' +
      'You can check financial information, skills, form, development, health, and availability. Skills can improve over time, so this page helps you follow how each rider is developing.\n\n' +
      'By clicking the View button, you can open the full rider profile with more detailed information.',
    primaryAction: 'Next',
  },
  {
    key: 'squad-developing-team',
    title: 'Developing Team and Movement Window',
    body:
      'Your Developing Team is your second team. It can be used for young riders who are not yet ready for the first squad but can still race in assigned competitions.\n\n' +
      'The Developing Team must be unlocked first. You can find more about this in Preferences.\n\n' +
      'Riders can only be moved between the First Squad and Developing Team during movement windows. These windows open four times per year, and the Squad page shows when the next movement window is available.',
    primaryAction: 'Next',
  },
  {
    key: 'squad-staff',
    title: 'Staff and Next Page',
    body:
      'The Staff button shows the staff members working for your club and the current limits of your staff setup.\n\n' +
      'Staff members have their own skills and can be sent on courses. Staff limits can also be improved by upgrading your infrastructure.\n\n' +
      'After Squad, the next recommended page is Training, where you can set regular training and plan training camps for your riders.',
    primaryAction: 'Continue to Training',
    secondaryAction: 'Finish for now',
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
    primaryAction: 'Next',
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
    primaryAction: 'Next',
  },
  {
    key: 'equipment-inventory',
    title: 'Inventory',
    body:
      'The Inventory tab shows all equipment your team currently owns.\n\n' +
      'Here you can see items such as bikes, wheels, tires, and other equipment you purchased. You can check quality, condition, value, bonuses, and availability.\n\n' +
      'If you no longer need some equipment, you can sell it from your inventory.',
    primaryAction: 'Next',
  },
  {
    key: 'equipment-market',
    title: 'Equipment Market',
    body:
      'The Market tab is where you buy new equipment.\n\n' +
      'Each item has a price and can bring different bonuses. Better equipment can improve race performance, but it also costs more.\n\n' +
      'When you purchase equipment, it is sent to your Inventory and can later be used in race setups.',
    primaryAction: 'Next',
  },
  {
    key: 'equipment-race-supplies',
    title: 'Race Supplies',
    body:
      'The Race Supplies tab shows consumable supplies your team can use for races.\n\n' +
      'Some supplies can be used only once, while others may be used multiple times. Supplies can help protect riders from difficult race conditions.\n\n' +
      'Without the right race supplies, riders may receive negative effects in very hot, cold, or demanding weather conditions.\n\n' +
      'After Equipment, the next recommended page is Infrastructure.',
    primaryAction: 'Continue to Infrastructure',
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
      'Later, you can build and upgrade important facilities such as the Training Center, Medical Center, Youth Academy, Mechanics Workshop, and Scouting Office.\n\n' +
      'Facilities are important because they improve your club and can also define how many staff members you are allowed to have.',
    primaryAction: 'Next',
  },
  {
    key: 'facilities-projects',
    title: 'Builds, Upgrades and Refunds',
    body:
      'When you open the details for a facility, you can see what the next level costs, how long construction takes, and what bonuses or unlocks it will bring.\n\n' +
      'You can start a build or upgrade project when your club has enough money and available project capacity.\n\n' +
      'You can also cancel an infrastructure project. If you cancel immediately, you receive a full refund. If you cancel later, the refund can be smaller.',
    primaryAction: 'Next',
  },
  {
    key: 'facilities-assets',
    title: 'Team Assets',
    body:
      'The Assets tab shows vehicles and support assets your team can use.\n\n' +
      'This includes team cars, team buses, equipment vans, mobile workshops, and medical vans. These assets can support your team during races and training camps.\n\n' +
      'Each asset can have different levels, costs, condition, bonuses, and limits. Open the details for each asset to understand what it brings and how it can help your team perform better.',
    primaryAction: 'Continue to Calendar',
    secondaryAction: 'Finish for now',
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
    primaryAction: 'Next',
  },
  {
    key: 'calendar-races',
    title: 'Race Calendar',
    body:
      'This is the Race Calendar.\n\n' +
      'Here you can see all races in the season. Races can be one-day races or multi-day stage races. Each race shows useful information such as date, race status, race category, race type, team limits, and application status.\n\n' +
      'Races are divided by month, so each month has its own list of available races.',
    primaryAction: 'Next',
  },
  {
    key: 'calendar-open-race',
    title: 'Open a Race Profile',
    body:
      'Some races may show a sponsor goal marker. This means the race is connected to a sponsor bonus objective, such as participating or achieving a specific result.\n\n' +
      'Use the Open Race button when you want to see more details about a race or apply for it.\n\n' +
      'Next, we will open one race profile so you can see what information is available there.',
    primaryAction: 'Open Race Profile',
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
  },
  {
    key: 'race-detail-stages-results',
    title: 'Stages, Results and Replay',
    body:
      'The race profile also shows detailed stage information.\n\n' +
      'You can review stage profiles, route maps, terrain split, stage weather, sprint points, mountain points, and other stage details. Weather is only published close to the race, so it may appear later.\n\n' +
      'Further down, Race Information shows participating teams and riders before the race, and results after the race. If your team participates and the race is active or finished, you can use Watch Race or Watch Replay to follow the action on the map.',
    primaryAction: 'Continue to Race Preparation',
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
  },
  {
    key: 'race-preparation-stage-plans',
    title: 'Stage Plans',
    body:
      'The Stage Plans tab opens after the Race Plan has been submitted.\n\n' +
      'Here you prepare the tactics for each stage. You can define rider roles, equipment, supplies, team tactics, and individual tactics for every stage.\n\n' +
      'Stage Plans are important because different stages need different plans. A flat sprint stage, mountain stage, time trial, or hilly stage may all require different riders, tactics, and support.\n\n' +
      'After Race Preparation, the next recommended page is Team Ranking.',
    primaryAction: 'Continue to Team Ranking',
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
  },
  {
    key: 'statistics-teams-history',
    title: 'Team History',
    body:
      'The History section shows previous seasons.\n\n' +
      'Here you can review past winners, old season snapshots, historical positions, and how teams performed in earlier seasons.\n\n' +
      'This becomes more useful as your world progresses through multiple seasons.',
    primaryAction: 'Next',
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
  },
  {
    key: 'transfers-rider-free-agents',
    title: 'Free Agent Riders',
    body:
      'Free Agents are riders without a team.\n\n' +
      'The big difference is that there is no selling team between you and the rider. If you want a free agent, you go directly into contract negotiation.\n\n' +
      'You can negotiate salary, contract duration, and agent fee. The offer outlook helps you understand whether your offer looks strong, risky, or unlikely to succeed.',
    primaryAction: 'Next',
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
    primaryAction: 'Next',
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
    primaryAction: 'Next',
  },
  {
    key: 'finance-transactions',
    title: 'Transactions',
    body:
      'The Transactions tab shows your club’s financial history.\n\n' +
      'Here you can see income and expenses during the season, including prize money, sponsor payments, salaries, transfers, infrastructure costs, equipment purchases, training camps, tax withdrawals, and other financial movements.',
    primaryAction: 'Next',
  },
  {
    key: 'finance-tax',
    title: 'Tax',
    body:
      'The Tax tab shows your club’s tax situation.\n\n' +
      'Transactions can create tax obligations, and a tax audit happens once per month. This page helps you see how much tax has been calculated, what has already been paid, and what still needs to be paid.',
    primaryAction: 'Next',
  },
  {
    key: 'finance-policies',
    title: 'Team Policies and Operations',
    body:
      'Team Policies and Operations control how your club is run.\n\n' +
      'Changing policies can make your club more attractive to riders and staff, but it can also increase the cost of travel, race support, training camps, and daily operations.\n\n' +
      'This section helps you balance comfort, performance, attractiveness, and cost.\n\n' +
      'After Finance, the next tutorial will explain the main Menu.',
    primaryAction: 'Continue to Menu',
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
      'Inside the menu, you can find Inbox for internal messages, profile settings, themes and customization settings, forum or Discord links, game preferences, help with the in-game manual and frequently asked questions, Contact Us, Coin Packages, and Invite Friends referral progress.\n\n' +
      'Use this menu whenever you need account settings, help, support, preferences, or extra game options.',
    primaryAction: 'Next',
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
  },
  {
    key: 'menu-coins',
    title: 'Coins',
    target: 'header-coins',
    body:
      'This shows your current coin balance.\n\n' +
      'Please make sure you always have enough coins available. If your coin balance is too low, your account can be suspended until coins are available again.\n\n' +
      'Coins can be checked here and purchased from Menu → Coin Packages.',
    primaryAction: 'Next',
  },
  {
    key: 'menu-finished',
    title: 'Tutorial Completed',
    body:
      'You have successfully finished the basic ProPeloton Manager tutorial.\n\n' +
      'If you have questions later, you can always check the in-game manual, read the frequently asked questions, contact us, or join our Discord community.\n\n' +
      'Good luck with your team!',
    primaryAction: 'Finish tutorial',
  },
]