import type { TutorialKey, TutorialStep } from './tutorials'

export type AdvancedTutorialModule = {
  key: TutorialKey
  title: string
  description: string
  route: string
  routePrefixes: string[]
  target?: string
  contextualEligibility?: 'always' | 'premium-youth' | 'national-coach'
  steps: TutorialStep[]
}

export const advancedTutorialModules: AdvancedTutorialModule[] = [
  {
    key: 'national-championships',
    title: 'National Championships & National Ranking',
    description:
      'Understand National Ranking, qualification, National Duty, preparation, finals and championship history.',
    route: '/dashboard/national-ranking',
    routePrefixes: [
      '/dashboard/national-ranking',
      '/dashboard/national-championships/',
    ],
    target: 'dashboard-page-body',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'national-championships-page-map',
        title: 'National Ranking: What This Page Is For',
        body:
          'This page is the control centre for your riders’ national championship pathway. It is separate from Team Ranking: Team Ranking compares clubs, while National Ranking follows riders inside their nationality.\n\nUse the three main areas for different jobs: Ranking shows the current national order and qualification status, My National Duty shows riders from your club who need attention, and History lets you review completed championship outcomes.',
        tip:
          'Start here whenever a National Championship notification arrives. The Ranking tab tells you why a rider is in the current position; My National Duty tells you what you actually need to do.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-ranking',
        title: 'Ranking, Snapshot and Qualification Status',
        body:
          'The Ranking tab shows riders from the selected country together with their national position and the information used by the championship system. You can see the live or frozen state of the ranking, the current snapshot, rider totals and the qualification status assigned to each rider.\n\nWhen the ranking is still live, positions can continue to change. Once the championship draw is fixed, the status becomes much more important than the raw position because it tells you whether a rider is a direct finalist, assigned to a qualification heat, already qualified, eliminated or withdrawn.',
        tip:
          'Do not look only at the number beside the rider. Always read the qualification-status column as well, especially after the draw has been confirmed.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-qualification',
        title: 'Qualification Groups and the National Final',
        body:
          'Countries do not all use the same route to the title. The championship system looks at the national rider population and creates qualification groups when the field is too large for the Final. Smaller rider populations can have more direct access to the Final.\n\nThe draw area shows the qualification heats, their dates and the Final. Riders who qualify from the heats join the direct qualifiers in the National Championship Final. Open the linked race page when you want to inspect the route and event details.',
        tip:
          'Check the draw before planning club races around the same dates. A rider who appears safe today can still create a calendar conflict once National Duty is confirmed.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-duty',
        title: 'My National Duty: Approve, Refuse and Plan Around It',
        body:
          'My National Duty is the action area for riders from your club. It shows which riders are involved, their championship route, duty dates and any decision that still needs your approval.\n\nIf you approve National Duty, the rider becomes unavailable for normal club racing during the confirmed duty window. A refusal can have sporting or morale consequences depending on the decision shown on the page, so read the confirmation text before acting.',
        tip:
          'Treat National Duty like a real race commitment. Before approving, compare the duty window with accepted club races and rider recovery plans.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-preparation',
        title: 'Preparation, Rider Plans and Race Pages',
        body:
          'When a rider is involved in qualification or the Final, use the available race links and preparation controls to review the event. Where a rider plan is available, check the selected strategy and equipment setup instead of leaving the rider on an unsuitable default.\n\nNational Championship preparation is individual: one club can have several riders in different countries or different championship stages at the same time. Each rider therefore needs to be checked separately.',
        tip:
          'Open every rider entry once before the deadline. A short review of strategy, equipment and the race profile is safer than assuming one setup fits all riders.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-final-confirmation',
        title: 'Final Confirmation and Withdrawals',
        body:
          'Reaching the Final can create a separate confirmation step. When the page asks for a second confirmation, the manager must approve or refuse the Final independently from the earlier qualification decision.\n\nThe page shows the confirmation deadline and current decision. If withdrawal is still allowed, use it carefully because the rider is removed from the Final start list and the page will show any consequence attached to that decision.',
        tip:
          'A qualification approval does not always finish the job. Recheck My National Duty after qualification results because a new Final decision may appear.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-results',
        title: 'Results, Champion Status and History',
        body:
          'After the races are completed, the National Championship result becomes part of the rider’s competitive history. The Final decides the national champion, while qualification results explain how riders reached or missed the title race.\n\nUse the History tab when you want to review previous championship outcomes instead of only the current live edition.',
        tip:
          'History is useful when comparing riders: it shows championship achievement that is easy to miss when you look only at current international points.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-routine',
        title: 'A Simple National Championship Routine',
        body:
          'You do not need to manage this page every day. A practical routine is: check the Ranking when the championship draw is approaching, react to National Duty notifications, confirm riders before deadlines, review qualification results, then return if a Final confirmation appears.\n\nThat is enough to keep National Championships under control without interfering with normal club management.',
        tip:
          'The most important rule is simple: never ignore a National Duty notification. It can affect both championship participation and your club race availability.',
        primaryAction: 'Finish tutorial',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'national-association',
    title: 'National Association & National Team',
    description:
      'Learn membership, funding, elections, squad selection, equipment, World Nations, chat and history.',
    route: '/dashboard/national-association',
    routePrefixes: ['/dashboard/national-association'],
    target: 'dashboard-page-body',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'national-association-distinction',
        title: 'National Association: What It Controls',
        body:
          'The National Association is different from the National Championship. National Championships are rider competitions based on nationality. The National Association is the shared country organisation used by eligible human managers to organise the National Team.\n\nFrom this area you can follow membership, activation or renewal, the elected National Coach, call-ups, squad preparation, equipment, World Nations competition, Association communication and historical records.',
        tip:
          'Think of National Ranking as “my riders for their countries” and National Association as “our managers running one country team together.”',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-membership',
        title: 'Membership, Activation and Shared Funding',
        body:
          'Each country has one National Association. A forming Association needs the required number of eligible managers and the shared activation funding before it becomes active. Contributions are pooled toward the requirement; they do not buy ownership, sporting power or extra voting rights.\n\nOnce you are a member, the Overview shows the current Association status, member count and the actions that are available to you.',
        tip:
          'Contribute only what is still needed. The page shows the remaining activation or renewal amount so members can coordinate instead of overfunding.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-renewal',
        title: 'Seasonal Renewal',
        body:
          'An active Association must also remain valid for future seasons. The renewal area shows when the renewal window opens, the target season, how many Coins have already been contributed and how many are still required.\n\nRenewal is a shared Association responsibility. It keeps the organisation active; it does not change rider strength or race performance.',
        tip:
          'Check renewal status early in the window. Leaving the full amount to one manager at the deadline is an unnecessary risk.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-overview',
        title: 'Overview, Members and Current Activity',
        body:
          'The Association Overview is your daily status page. It shows current-season information, active call-ups, selected riders, upcoming World Nations events and recent competition information.\n\nThe member directory lets you see who belongs to the Association, which club each member manages, contribution information and who currently holds the National Coach role.',
        tip:
          'Before opening a deeper tab, scan the Overview first. It will usually tell you whether the Association currently needs funding, a call-up response or race preparation.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-elections',
        title: 'Elections and the National Coach',
        body:
          'The Elections area controls the National Coach election cycle. Managers can follow candidature registration, candidate statements, voting and runoff rounds when required. Every active member has one vote in a round; Coin contributions do not create additional votes.\n\nThe winner becomes responsible for sporting selection and National Team preparation, but winning the election does not guarantee any manager’s riders a place in the squad.',
        tip:
          'Judge candidates by how they plan to select and prepare the team, not by how much they contributed to Association funding.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-callups',
        title: 'Call-ups and the 10-Rider National Squad',
        body:
          'The National Coach works from the eligible national rider pool and sends call-ups to build the National Team squad. Clubs receive those requests and can review the duty window before responding.\n\nAccepted riders can be used to form the final 10-rider National Team squad. Once National Duty is confirmed, those riders are unavailable to their normal clubs during the relevant duty period.',
        tip:
          'If one of your riders is called up, check your club calendar before accepting. If you are the coach, check availability before locking the final 10.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-equipment',
        title: 'National Team Equipment',
        body:
          'The Equipment area is where the Association prepares National Team equipment configurations for international competition. Keep several profile-appropriate setups ready so the coach can choose a suitable configuration for different race days instead of rebuilding everything at the last moment.\n\nAssociation funding and Coins are administrative resources; they are not a shortcut that directly purchases race-engine strength.',
        tip:
          'Prepare equipment before the competition window opens. A saved flat, climbing and time-trial-oriented setup makes race-day preparation much faster.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-world-nations',
        title: 'World Nations Competition',
        body:
          'Active National Associations enter the World Nations structure. The Competition area shows the international schedule and progression from qualification toward the final rounds.\n\nFor race days, the coach selects the required lineup from the confirmed National Team squad and prepares the team for the actual stage profile. Different race days can need different rider combinations and equipment choices.',
        tip:
          'Do not treat the complete event as one race. Review every race day separately and keep the strongest profile-specific riders available for the days that suit them.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-chat',
        title: 'Association Chat and Coordination',
        body:
          'The Association is shared by several human managers, so communication matters. Use the Chat area to coordinate funding, elections, call-up expectations and competition preparation instead of making every decision in isolation.\n\nThe coach still owns sporting decisions, but clear communication helps club managers understand why riders are being requested and when they will be unavailable.',
        tip:
          'Short messages are enough: funding still needed, election deadline, call-up deadline and race-day plan are the four things members most often need to know.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-history',
        title: 'History and Competition Records',
        body:
          'History keeps the Association’s long-term record: previous leadership, competition participation and completed National Team outcomes. It becomes more useful as several seasons pass because it shows how the country developed beyond one current event.\n\nUse History when you want context; use Overview and Competition when you need to act now.',
        tip:
          'History is especially useful before an election or a new competition cycle because it shows what the Association achieved under previous management.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-routine',
        title: 'A Simple Association Routine',
        body:
          'For a normal member, the routine is straightforward: keep membership and renewal healthy, vote when elections are open, answer rider call-ups and follow World Nations results.\n\nFor the National Coach, add squad selection, equipment preparation and race-day lineups. You do not need to manage every Association section every day.',
        tip:
          'If the Overview shows no pending funding, election, call-up or competition action, you can safely return to normal club management.',
        primaryAction: 'Finish tutorial',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'national-coach',
    title: 'National Coach',
    description:
      'A role tutorial for the elected coach: eligible riders, call-ups, final squad and race-day lineups.',
    route: '/dashboard/national-association/squad',
    routePrefixes: ['/dashboard/national-association/squad'],
    target: 'dashboard-page-body',
    contextualEligibility: 'national-coach',
    steps: [
      {
        key: 'national-coach-role',
        title: 'Your National Coach Role',
        body:
          'As the elected National Coach, you manage sporting selection for the country. The workspace shows the eligible rider pool, availability, National Ranking context and the current competition cycle.\n\nThe role does not reveal hidden rider information that a normal manager would not otherwise be allowed to see.',
        primaryAction: 'Next',
        tip: 'Before selecting riders, check the competition cycle and availability. The best ten on paper are not useful if several are unavailable for the same duty window.',
      },
      {
        key: 'national-coach-callups',
        title: 'Choose 10 and Send Call-ups',
        body:
          'Build a provisional selection of exactly 10 riders. Nothing is sent while the selection remains a draft. When you lock the 10, invitations are sent to the riders’ clubs.\n\nExplicit declines reopen those places for replacement; accepted and still-pending riders remain locked according to the current response rules.',
        primaryAction: 'Next',
        tip: 'Build a balanced ten, not ten riders with the same strength. Keep the race profiles in mind before you send invitations.',
      },
      {
        key: 'national-coach-final-squad',
        title: 'Confirm the Final 10',
        body:
          'Once the selection has the required accepted or automatically accepted riders, confirm the final 10-rider National Team squad. That squad is then locked for the current selection cycle.\n\nUse rider availability and the competition schedule before committing the final group.',
        primaryAction: 'Next',
        tip: 'Do one final availability check before confirming. After the squad is locked, replacement options are intentionally limited.',
      },
      {
        key: 'national-coach-lineups',
        title: 'Seven Riders per Race Day',
        body:
          'World Nations race days use exactly seven riders selected from the confirmed 10. Reserves stay available inside the squad, and the competition rules limit how many rider changes can be made between consecutive days.\n\nPrepare each race-day lineup and equipment setup for the actual profile rather than treating all three days the same.',
        primaryAction: 'Next',
        tip: 'Use the reserves actively. The best seven for one race day may not be the best seven for the next profile.',
      },
      {
        key: 'national-coach-duty',
        title: 'National Duty Has Club Consequences',
        body:
          'A call-up is not only a National Team action. Once National Duty is confirmed, that rider becomes unavailable to the rider’s normal club for the relevant window.\n\nUse call-ups responsibly and watch the competition calendar so clubs have clear information before their riders are committed.',
        primaryAction: 'Finish tutorial',
        tip: 'Clear call-ups help both the National Team and the clubs. Avoid creating unnecessary conflicts when another suitable rider is available.',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'youth-academy',
    title: 'Youth Academy / U16',
    description:
      'Learn the U16 pathway, staff, budget, scouting, development settings, equipment, racing, rankings and graduation.',
    route: '/dashboard/youth-academy',
    routePrefixes: ['/dashboard/youth-academy'],
    target: 'dashboard-page-body',
    contextualEligibility: 'premium-youth',
    steps: [
      {
        key: 'youth-academy-access',
        title: 'Youth Academy: Long-Term U16 Development',
        body:
          'Youth Academy is a Premium long-term development programme for young riders. These riders are not ready-made professionals and they remain separate from your First Squad while they develop.\n\nThe Academy has a fixed capacity, so every place matters. The goal is to recruit promising young riders, develop them over time and then make a graduation decision when they reach the end of the U16 pathway.',
        tip:
          'Do not fill every place only because it is available. Keep room for stronger scouting discoveries and for the age balance you want inside the Academy.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-overview',
        title: 'Overview and Your Academy Roster',
        body:
          'The Overview gives you the quickest picture of the Academy: current riders, capacity, development status and the most important actions that need attention.\n\nUse it as the Academy home screen. From here you can decide whether the next priority is staffing, funding, scouting, equipment, racing or a graduation decision.',
        tip:
          'When you open Youth Academy, first check capacity and pending actions. That prevents a scouting or graduation deadline from being missed.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-staff',
        title: 'Academy Staff',
        body:
          'Youth Academy has its own specialist staff structure. Roles such as Head of Academy, Head Coach, Assistant and Scout influence different parts of recruitment and development.\n\nStaff quality matters, but salaries also come from the Academy economy. Build a staff group that matches the size and ambition of your programme instead of automatically hiring the most expensive option in every role.',
        tip:
          'Prioritise the role that supports your current weakness. If recruitment is weak, improve scouting; if you already have strong prospects, coaching and development become more important.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-budget',
        title: 'Budget and Academy Finances',
        body:
          'The Budget area separates Academy operating money from your normal senior-team decisions. It tracks the seasonal budget and the main costs created by staff, scouting, equipment, racing and development.\n\nYou can move money between the senior club and the Academy where the page allows it, but every transfer should fit your complete club finances. A strong Academy is useful only if it does not leave the First Squad unable to operate.',
        tip:
          'Set a seasonal Academy budget before spending heavily. It is easier to control scouting and equipment decisions when you already know the maximum amount you are willing to invest.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-scouting',
        title: 'Scouting and Recruitment',
        body:
          'Scouting is how you discover new youth prospects. The Scouting area lets you control search range, scouting investment and the reports generated by your youth scouting programme. Wider searches can expose you to more prospects but also require more resources.\n\nReports are assessments, not perfect truth. Youth Potential is intentionally uncertain, so scouting quality improves your decision but does not reveal a guaranteed future superstar.',
        tip:
          'Compare several reports before committing a valuable Academy place. A slightly lower-rated rider with the right profile and age can be a better fit than the first exciting prospect you see.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-settings',
        title: 'Development Philosophy and Delegation',
        body:
          'Settings define how the Academy should operate. You can choose development priorities and, where supported, decide whether recurring responsibilities stay with you or are delegated to Academy staff.\n\nDelegation is useful for managers who want the Academy to progress without manually controlling every scouting, recruitment, equipment or race-entry decision. You still control the overall direction.',
        tip:
          'Delegate routine work, not strategy. Decide the Academy philosophy yourself, then let staff handle repetitive actions that fit that philosophy.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-equipment',
        title: 'Equipment, Assets and Race Supplies',
        body:
          'Youth riders use their own Academy equipment system. The Equipment area covers inventory, market purchases, support assets, race supplies and race setups used by the Academy.\n\nYou do not need top-level equipment everywhere. Match spending to the races you actually plan to enter and to the age of the riders who will use it.',
        tip:
          'Buy for your calendar, not for the catalogue. Expensive equipment that never matches your selected races only reduces the development budget.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-racing',
        title: 'Calendar, Race Entry and Rider Workload',
        body:
          'The Academy calendar contains youth competitions with different levels and competition classes. Race entry and squad selection can be managed directly or delegated where your settings allow it.\n\nYouth racing should support development, not replace it. Age, readiness and fatigue matter, so avoid treating U16 riders like senior professionals who must race constantly.',
        tip:
          'Use racing to test development. If a rider is tired or still very young, another training and recovery block can be more valuable than one extra race.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-rankings',
        title: 'Youth Rankings and Competition Levels',
        body:
          'Rankings let you compare Academy performance across the available regional, continental and world structures. They show how your Academy and riders are progressing against similar youth programmes.\n\nUse rankings as context, not as the only development goal. A prospect can be developing well even if the Academy is not winning every youth competition.',
        tip:
          'Look at both results and development. Chasing a youth ranking at the expense of fatigue or long-term growth can hurt the riders you are trying to improve.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-history',
        title: 'History and Race Reports',
        body:
          'The History area keeps completed race information and development context so you can understand how riders and the Academy progressed over time. Race reports are useful for spotting repeated strengths, weaknesses and whether your racing philosophy is working.\n\nAs seasons pass, History becomes the best place to compare what different Academy generations achieved before graduation.',
        tip:
          'Review history periodically, not after every race. Patterns across several events are more useful than reacting to one unusually good or bad result.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-graduation',
        title: 'Graduation and the Next Development Stage',
        body:
          'When a youth rider reaches graduation, the Academy asks you to choose the next step. The normal development bridge is the Developing Team when it is available and has room, while other implemented options can include a direct senior route or release outcome.\n\nGraduation is not automatic promotion. Check the rider, available squad places and the pathway that best protects long-term development before confirming the decision.',
        tip:
          'Plan graduation space in advance. A strong prospect is much easier to manage when you already know whether the Developing Team or First Squad has a place available.',
        primaryAction: 'Finish tutorial',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'youth-graduation',
    title: 'Youth Academy Graduation',
    description:
      'A short contextual guide for moving an U16 graduate into the next development stage.',
    route: '/dashboard/youth-academy',
    routePrefixes: ['/dashboard/youth-academy'],
    target: 'dashboard-page-body',
    contextualEligibility: 'premium-youth',
    steps: [
      {
        key: 'youth-graduation-review',
        title: 'A Youth Rider Is Ready to Graduate',
        body:
          'A rider has reached the point where an Academy graduation decision is required. Review the rider, available squad places and the deadline shown on the Academy page before choosing the next step.\n\nGraduation is a development decision, not an automatic promotion into the First Squad.',
        primaryAction: 'Next',
        tip: 'Check the deadline first, then compare the rider with available Developing Team and First Squad places.',
      },
      {
        key: 'youth-graduation-pathway',
        title: 'Choose the Right Pathway',
        body:
          'The normal pathway is Youth Academy → Developing Team → First Squad. If your Developing Team is active and has room, it is usually the natural next stage for a rider who still needs development.\n\nThe page can also offer other implemented outcomes such as a temporary pathway, direct Developing Team movement or release to the professional free-agent pool. Read the consequences before confirming.',
        primaryAction: 'Next',
        tip: 'Choose the pathway that gives the rider useful development time, not simply the fastest route to the senior squad.',
      },
      {
        key: 'youth-graduation-developing',
        title: 'Plan Developing Team Capacity',
        body:
          'The Developing Team is available to Free and Premium managers for 100 Coins activation and 100 Coins per season. Premium is not required.\n\nIf you intend to use it for Academy graduates, keep roster space and movement timing in mind before the graduation deadline.',
        primaryAction: 'Finish tutorial',
        tip: 'Keep at least one development place available when you know a strong Academy rider is approaching graduation.',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'developing-team',
    title: 'Developing Team',
    description:
      'Understand the U23 bridge from Youth Academy graduates toward the First Squad.',
    route: '/dashboard/developing-team',
    routePrefixes: ['/dashboard/developing-team'],
    target: 'dashboard-page-body',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'developing-team-access',
        title: 'Available to Every Manager',
        body:
          'The Developing Team is not Premium-only. Free and Premium managers can activate it after the normal service unlock conditions are met. First activation costs 100 Coins and each seasonal renewal costs 100 Coins.\n\nPremium-only automation or advanced analysis remains separate from normal Developing Team access.',
        primaryAction: 'Next',
        tip: 'Activate the service when you have a real development need; the recurring cost is easier to justify when the roster will actually be used.',
      },
      {
        key: 'developing-team-purpose',
        title: 'Bridge to the First Squad',
        body:
          'Use the Developing Team for young riders who need more professional development before taking a permanent First Squad role. It can contain existing development riders and graduates arriving from the Youth Academy.\n\nThe intended pathway is development, racing experience and eventual promotion when the rider is ready.',
        primaryAction: 'Next',
        tip: 'Give young riders meaningful racing and training time instead of leaving them permanently between the Academy and First Squad.',
      },
      {
        key: 'developing-team-movement',
        title: 'Movement Windows Still Apply',
        body:
          'Owning the Developing Team does not allow unlimited instant movement. Riders can move between the Developing Team and First Squad only when the current movement rules and roster limits allow it.\n\nPlan ahead for graduating youth riders and First Squad vacancies so you do not create avoidable bottlenecks.',
        primaryAction: 'Next',
        tip: 'Plan movement windows before contract or graduation deadlines so a roster limit does not trap a rider in the wrong team.',
      },
      {
        key: 'developing-team-staff',
        title: 'U23 Staff and Development',
        body:
          'The Developing Team has its own development context and can use the U23 Head Coach as part of the service. Normal U23 staff use does not require Premium.\n\nUse the team as a genuine development layer rather than simply an overflow roster.',
        primaryAction: 'Finish tutorial',
        tip: 'A good U23 coach should support the riders you actually keep here; do not treat the Developing Team as a separate senior squad.',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'new-season',
    title: 'New Season Transition',
    description:
      'A short guide to the player-facing systems that recalculate or move forward at season change.',
    route: '/dashboard/season-reset-preview',
    routePrefixes: ['/dashboard/season-reset-preview'],
    target: 'dashboard-page-body',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'new-season-calendar',
        title: 'A New Season Changes the Planning Picture',
        body:
          'Season transition moves the game into a new planning cycle. A new race calendar and new competitive context can change which events, objectives and rider commitments matter next.\n\nReview the new calendar before carrying old-season assumptions into the next campaign.',
        primaryAction: 'Next',
        tip: 'Rebuild the season plan from the new calendar instead of copying last season race for race.',
      },
      {
        key: 'new-season-national',
        title: 'National Systems Recalculate',
        body:
          'National Championship structures and National Ranking qualification status are prepared for the new season. National Association renewal and election windows also follow their seasonal schedule.\n\nCheck National Duty and Association pages again even if everything was settled at the end of the previous season.',
        primaryAction: 'Next',
        tip: 'Check National Ranking and Association pages after rollover because new-season windows can create actions even when the previous season ended cleanly.',
      },
      {
        key: 'new-season-riders',
        title: 'Riders and Contracts Move Forward',
        body:
          'Riders age, youth development moves forward, contracts can enter new phases, and team objectives can change. Youth Academy graduation and Developing Team planning become especially important when riders cross development milestones.\n\nUse the transition preview as a planning aid, not as a technical database report.',
        primaryAction: 'Finish tutorial',
        tip: 'Season change is a good moment to review contracts, youth graduation and squad space together rather than as separate problems.',
        secondaryAction: 'Learn More',
      },
    ],
  },
]

export function findAdvancedTutorialModule(pathname: string): AdvancedTutorialModule | null {
  const exactCoach = advancedTutorialModules.find(
    module => module.key === 'national-coach' && module.routePrefixes.some(prefix => pathname.startsWith(prefix)),
  )
  if (exactCoach) return exactCoach

  return (
    advancedTutorialModules.find(module =>
      module.routePrefixes.some(prefix => pathname.startsWith(prefix)),
    ) ?? null
  )
}

export function getAdvancedTutorialModule(key: TutorialKey): AdvancedTutorialModule | null {
  return advancedTutorialModules.find(module => module.key === key) ?? null
}
