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
      'Understand rider-only national ranking, qualification, National Duty, finals and champion recognition.',
    route: '/dashboard/national-ranking',
    routePrefixes: [
      '/dashboard/national-ranking',
      '/dashboard/national-championships/',
    ],
    target: 'national-ranking-page',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'national-championships-ranking',
        title: 'National Ranking',
        body:
          'Every rider competes in the National Championship of the rider’s nationality. National Ranking is separate from Team Ranking and is used to determine the rider’s position in the national championship structure.\n\nA sufficiently strong ranking can place a rider directly into the National Final, while riders from larger cycling nations may first need to qualify.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-qualification',
        title: 'Qualification and the National Final',
        body:
          'The size of the national rider population determines whether qualification groups are needed. Large cycling nations can use several qualification groups; smaller nations can send the eligible field directly to the Final.\n\nQualification winners and other qualified riders join the direct qualifiers in the National Championship Final.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-duty',
        title: 'National Duty Blocks Club Racing',
        body:
          'When one of your riders receives National Championship duty, review the notification and the My National Duty section. You can approve or refuse participation according to the current rules.\n\nImportant: an approved rider is unavailable for normal club racing during the confirmed National Duty window. The block is reflected in calendars, rider availability and race lineup selection so the rider has not “disappeared” from your club.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-preparation',
        title: 'Preparation and Notifications',
        body:
          'National Championship participation is connected to the normal preparation flow. When your rider is involved, notifications guide you to the relevant event and approved riders are synchronized into National Championship preparation.\n\nCheck deadlines early because an accepted National Duty window can overlap with club plans.',
        primaryAction: 'Next',
      },
      {
        key: 'national-championships-champion',
        title: 'Champion Recognition',
        body:
          'The National Final decides the country’s champion. Championship results feed the rider’s career history and recognition, including National Champion status and the championship visual identity used by the game where applicable.\n\nUse the National Ranking page throughout the season to follow qualification status and upcoming duty.',
        primaryAction: 'Finish tutorial',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'national-association',
    title: 'National Association & National Team',
    description:
      'Learn membership, funding, elections, call-ups and the World Nations competition.',
    route: '/dashboard/national-association',
    routePrefixes: ['/dashboard/national-association'],
    target: 'national-association-page',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'national-association-distinction',
        title: 'Championship or National Team?',
        body:
          'These are two different international systems.\n\nNational Championship = an individual rider competition based on nationality.\n\nNational Association / National Team = a shared, manager-driven country organisation that elects a National Coach and enters international team competition.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-membership',
        title: 'Membership and Activation',
        body:
          'Each country has one National Association for eligible human-controlled clubs. A forming Association needs at least five eligible managers and the shared one-time 50-Coin founding requirement before activation.\n\nCoin contributions fund activation or renewal only. They do not buy sporting strength, ownership or extra voting power.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-renewal',
        title: 'Seasonal Renewal and Voting',
        body:
          'After activation, the Association must meet its seasonal membership and renewal rules. Beginning in January, members can jointly fund the 30-Coin renewal before the February deadline.\n\nEvery active member has exactly one vote per election round, including candidates. Contributions never create extra votes.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-elections',
        title: 'National Coach Elections',
        body:
          'The Association elects its National Coach through candidate registration, manifestos, voting and runoff rounds when required. The Elections tab shows the current phase, candidates, dates and available actions.\n\nWinning the election gives the coach sporting-management responsibility; it does not create a guaranteed rider place.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-callups',
        title: 'National Team Call-ups',
        body:
          'The National Coach sends provisional call-ups to eligible riders. Your club receives the request and can review the duty window before responding.\n\nAccepting makes that rider unavailable to the club during the confirmed National Duty window. The coach can then build the final 10-rider National Team squad from accepted or automatically accepted call-ups.',
        primaryAction: 'Next',
      },
      {
        key: 'national-association-world-nations',
        title: 'World Nations Competition',
        body:
          'Every active Association enters the World Nations structure automatically. Qualification groups reduce the field toward the World Final, where the final nations compete in a three-day event.\n\nEach competition round uses National Team lineups and standardised system-covered equipment and resources, so Association Coins do not purchase race performance.',
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
    target: 'national-coach-page',
    contextualEligibility: 'national-coach',
    steps: [
      {
        key: 'national-coach-role',
        title: 'Your National Coach Role',
        body:
          'As the elected National Coach, you manage sporting selection for the country. The workspace shows the eligible rider pool, availability, National Ranking context and the current competition cycle.\n\nThe role does not reveal hidden rider information that a normal manager would not otherwise be allowed to see.',
        primaryAction: 'Next',
      },
      {
        key: 'national-coach-callups',
        title: 'Choose 10 and Send Call-ups',
        body:
          'Build a provisional selection of exactly 10 riders. Nothing is sent while the selection remains a draft. When you lock the 10, invitations are sent to the riders’ clubs.\n\nExplicit declines reopen those places for replacement; accepted and still-pending riders remain locked according to the current response rules.',
        primaryAction: 'Next',
      },
      {
        key: 'national-coach-final-squad',
        title: 'Confirm the Final 10',
        body:
          'Once the selection has the required accepted or automatically accepted riders, confirm the final 10-rider National Team squad. That squad is then locked for the current selection cycle.\n\nUse rider availability and the competition schedule before committing the final group.',
        primaryAction: 'Next',
      },
      {
        key: 'national-coach-lineups',
        title: 'Seven Riders per Race Day',
        body:
          'World Nations race days use exactly seven riders selected from the confirmed 10. Reserves stay available inside the squad, and the competition rules limit how many rider changes can be made between consecutive days.\n\nPrepare each race-day lineup and equipment setup for the actual profile rather than treating all three days the same.',
        primaryAction: 'Next',
      },
      {
        key: 'national-coach-duty',
        title: 'National Duty Has Club Consequences',
        body:
          'A call-up is not only a National Team action. Once National Duty is confirmed, that rider becomes unavailable to the rider’s normal club for the relevant window.\n\nUse call-ups responsibly and watch the competition calendar so clubs have clear information before their riders are committed.',
        primaryAction: 'Finish tutorial',
        secondaryAction: 'Learn More',
      },
    ],
  },
  {
    key: 'youth-academy',
    title: 'Youth Academy / U16',
    description:
      'Learn the Premium U16 pathway, uncertain potential, delegation, youth racing, costs and graduation.',
    route: '/dashboard/youth-academy',
    routePrefixes: ['/dashboard/youth-academy'],
    target: 'youth-academy-page',
    contextualEligibility: 'premium-youth',
    steps: [
      {
        key: 'youth-academy-access',
        title: 'Premium U16 Development',
        body:
          'Youth Academy is a Premium-only long-term development programme for riders roughly aged 12–16. It is not a source of ready-made professionals.\n\nAfter the normal unlock requirement is met, Premium managers can activate the Academy for 50 Coins. Academy access then costs 50 Coins per later season while Premium remains active. Capacity is fixed at 16 youth riders.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-pathway',
        title: 'The Development Pathway',
        body:
          'Youth riders belong to a separate U16 population and are not professional First Squad riders yet. Recruitment, development, racing and graduation happen inside the Academy.\n\nThe normal long-term pathway is Youth Academy → Developing Team → First Squad, although the final promotion decision depends on the rider, available places and the options shown at graduation.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-potential',
        title: 'Potential Is Intentionally Uncertain',
        body:
          'Youth Potential is shown as an assessment band such as Limited, Promising, Very Promising or Exceptional. These are estimates, not an exact hidden Potential number.\n\nAssessment quality becomes more useful as scouting and development information improves, so early impressions can be less precise than later ones.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-delegation',
        title: 'Manage or Delegate',
        body:
          'You set the Academy direction: staff, budget, development philosophy, racing philosophy and responsibility settings. Routine work can be delegated to the Youth Academy staff where the page allows it.\n\nYou do not need to manually control every U16 decision. Delegation can cover recurring areas such as scouting, recruitment, equipment or race entry while you keep overall control.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-racing',
        title: 'Youth Racing and Development',
        body:
          'Youth racing is designed around age, readiness, fatigue and long-term development. Younger riders should not be treated like senior professionals or raced constantly.\n\nThe Academy calendar, competition hierarchy, rankings and race reports let you follow progress without requiring full senior-style management for every event.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-economy',
        title: 'Coins Unlock Access; Club Cash Runs It',
        body:
          'Coins are used for Academy access and selected optional actions. Normal club money funds the Academy’s operating budget, staff, equipment, travel, racing and development costs.\n\nPremium and Coins do not directly buy hidden rider talent or race-engine strength. Sporting success still depends on talent, development choices and management.',
        primaryAction: 'Next',
      },
      {
        key: 'youth-academy-graduation',
        title: 'Graduation',
        body:
          'When a youth rider reaches the graduation stage, review the available pathway promptly. Moving the rider to the Developing Team is the normal bridge when that service is active and has room. Other implemented options can include a direct senior pathway or release/free-agent outcome.\n\nThe Developing Team is available to all managers for 100 Coins activation and 100 Coins per season; it does not require Premium.',
        primaryAction: 'Finish tutorial',
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
    target: 'developing-team-page',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'developing-team-access',
        title: 'Available to Every Manager',
        body:
          'The Developing Team is not Premium-only. Free and Premium managers can activate it after the normal service unlock conditions are met. First activation costs 100 Coins and each seasonal renewal costs 100 Coins.\n\nPremium-only automation or advanced analysis remains separate from normal Developing Team access.',
        primaryAction: 'Next',
      },
      {
        key: 'developing-team-purpose',
        title: 'Bridge to the First Squad',
        body:
          'Use the Developing Team for young riders who need more professional development before taking a permanent First Squad role. It can contain existing development riders and graduates arriving from the Youth Academy.\n\nThe intended pathway is development, racing experience and eventual promotion when the rider is ready.',
        primaryAction: 'Next',
      },
      {
        key: 'developing-team-movement',
        title: 'Movement Windows Still Apply',
        body:
          'Owning the Developing Team does not allow unlimited instant movement. Riders can move between the Developing Team and First Squad only when the current movement rules and roster limits allow it.\n\nPlan ahead for graduating youth riders and First Squad vacancies so you do not create avoidable bottlenecks.',
        primaryAction: 'Next',
      },
      {
        key: 'developing-team-staff',
        title: 'U23 Staff and Development',
        body:
          'The Developing Team has its own development context and can use the U23 Head Coach as part of the service. Normal U23 staff use does not require Premium.\n\nUse the team as a genuine development layer rather than simply an overflow roster.',
        primaryAction: 'Finish tutorial',
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
    target: 'new-season-page',
    contextualEligibility: 'always',
    steps: [
      {
        key: 'new-season-calendar',
        title: 'A New Season Changes the Planning Picture',
        body:
          'Season transition moves the game into a new planning cycle. A new race calendar and new competitive context can change which events, objectives and rider commitments matter next.\n\nReview the new calendar before carrying old-season assumptions into the next campaign.',
        primaryAction: 'Next',
      },
      {
        key: 'new-season-national',
        title: 'National Systems Recalculate',
        body:
          'National Championship structures and National Ranking qualification status are prepared for the new season. National Association renewal and election windows also follow their seasonal schedule.\n\nCheck National Duty and Association pages again even if everything was settled at the end of the previous season.',
        primaryAction: 'Next',
      },
      {
        key: 'new-season-riders',
        title: 'Riders and Contracts Move Forward',
        body:
          'Riders age, youth development moves forward, contracts can enter new phases, and team objectives can change. Youth Academy graduation and Developing Team planning become especially important when riders cross development milestones.\n\nUse the transition preview as a planning aid, not as a technical database report.',
        primaryAction: 'Finish tutorial',
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
