export type AdvisoryStaffRole =
  | 'head_coach'
  | 'sport_director'
  | 'team_doctor'
  | 'mechanic'
  | 'scout_analyst'
  | 'u23_head_coach'

export type AdvisoryReportCadence = 'event' | 'daily' | 'weekly' | 'monthly'

export type AdvisoryReportDefinition = {
  code: string
  role: AdvisoryStaffRole
  title: string
  description: string
  cadence: AdvisoryReportCadence
  allowedContent: string[]
  forbiddenContent: string[]
}

export type AdvisoryCommercialDefaults = {
  coinPrice: number
  durationRealDays: number
  finalPricingConfirmed: boolean
  automaticRenewal: false
}

/**
 * Audited launch terms. The database-owned staff_advisory_config row remains the
 * authoritative runtime source so clients cannot override price or duration.
 */
export const ADVISORY_COMMERCIAL_DEFAULTS: AdvisoryCommercialDefaults = {
  coinPrice: 10,
  durationRealDays: 30,
  finalPricingConfirmed: true,
  automaticRenewal: false,
}

export const ADVISORY_SUPPORTED_ROLES: ReadonlyArray<AdvisoryStaffRole> = [
  'head_coach',
  'sport_director',
  'team_doctor',
  'mechanic',
  'scout_analyst',
  'u23_head_coach',
]

export const ADVISORY_ROLE_LABELS: Record<AdvisoryStaffRole, string> = {
  head_coach: 'Head Coach',
  sport_director: 'Sports Director',
  team_doctor: 'Team Doctor',
  mechanic: 'Chief Mechanic',
  scout_analyst: 'Scout',
  u23_head_coach: 'U23 Coach',
}

export const STAFF_ADVISORY_REPORTS: ReadonlyArray<AdvisoryReportDefinition> = [
  {
    code: 'HEAD_COACH_TRAINING_REVIEW',
    role: 'head_coach',
    title: 'Training & Readiness Review',
    description:
      'Summarises recent training load, freshness/readiness trends and areas the manager may want to review.',
    cadence: 'weekly',
    allowedContent: [
      'Summarise visible training load and readiness data',
      'Highlight riders whose visible trends deserve attention',
      'Recommend reviewing workload, recovery or race preparation',
      'Compare recent visible trends with prior periods',
    ],
    forbiddenContent: [
      'Change training outcomes or rider attributes',
      'Reveal hidden training coefficients or RNG values',
      'Predict exact future form or race outcomes',
      'Replace free warnings about missing race preparation',
    ],
  },
  {
    code: 'SPORT_DIRECTOR_RACE_REVIEW',
    role: 'sport_director',
    title: 'Race Programme Review',
    description:
      'Summarises upcoming race commitments, selection workload and programme balance using information already visible to the manager.',
    cadence: 'weekly',
    allowedContent: [
      'Summarise upcoming race commitments and selection density',
      'Highlight schedule congestion or unusually light periods',
      'Recommend areas of the race programme to review',
      'Summarise recent visible race results and role usage',
    ],
    forbiddenContent: [
      'Modify race tactics or calculations',
      'Reveal hidden opponent strength or race engine coefficients',
      'Predict exact future results',
      'Replace free race-entry or preparation deadline warnings',
    ],
  },
  {
    code: 'TEAM_DOCTOR_HEALTH_REVIEW',
    role: 'team_doctor',
    title: 'Team Health Review',
    description:
      'Summarises visible injuries, sickness, recovery status and team-health trends without changing medical outcomes.',
    cadence: 'daily',
    allowedContent: [
      'Summarise visible injury and sickness cases',
      'Highlight recovery trends and clusters',
      'Recommend reviewing recovery workload or squad availability',
      'Provide context around already-visible medical data',
    ],
    forbiddenContent: [
      'Change injury risk or recovery duration',
      'Reveal hidden medical risk coefficients',
      'Predict exact injury events',
      'Replace free injury or sickness notifications',
    ],
  },
  {
    code: 'CHIEF_MECHANIC_EQUIPMENT_REVIEW',
    role: 'mechanic',
    title: 'Equipment & Maintenance Review',
    description:
      'Summarises visible equipment condition, maintenance workload and stock trends.',
    cadence: 'weekly',
    allowedContent: [
      'Summarise visible equipment condition and maintenance status',
      'Highlight items or categories that may need review',
      'Summarise visible race-supply trends',
      'Recommend maintenance priorities without applying changes',
    ],
    forbiddenContent: [
      'Change equipment condition, reliability or performance',
      'Reveal hidden mechanical-risk coefficients or random values',
      'Predict exact mechanical failures',
      'Replace free low-stock or critical-maintenance warnings',
    ],
  },
  {
    code: 'SCOUT_MARKET_REVIEW',
    role: 'scout_analyst',
    title: 'Scouting & Market Review',
    description:
      'Summarises already-discovered scouting and transfer information and highlights areas worth reviewing.',
    cadence: 'weekly',
    allowedContent: [
      'Summarise visible scouting reports and discovered prospects',
      'Highlight visible market trends and expiring opportunities',
      'Recommend scouting areas or profiles to review',
      'Compare already-visible candidate information',
    ],
    forbiddenContent: [
      'Reveal unrevealed rider attributes or hidden potential values',
      'Bypass scouting uncertainty',
      'Guarantee transfer outcomes',
      'Replace free contract or negotiation deadline warnings',
    ],
  },
  {
    code: 'U23_COACH_DEVELOPMENT_REVIEW',
    role: 'u23_head_coach',
    title: 'U23 Development Review',
    description:
      'Summarises visible developing-team workload, progress and selection patterns.',
    cadence: 'weekly',
    allowedContent: [
      'Summarise visible U23 development and race participation',
      'Highlight riders or workload patterns worth reviewing',
      'Recommend development areas to inspect',
      'Compare visible progress across recent periods',
    ],
    forbiddenContent: [
      'Change development rates or attributes',
      'Reveal hidden potential or growth coefficients',
      'Predict exact future development',
      'Replace free U23 contract, injury or deadline warnings',
    ],
  },
]

export const ESSENTIAL_NOTIFICATION_POLICY = {
  alwaysFree: true,
  requiresPremium: false,
  requiresStaff: false,
  requiresAdvisoryAccess: false,
  requiresCoins: false,
  examples: [
    'race deadlines',
    'missing preparation',
    'injuries and sickness',
    'expiring contracts',
    'financial emergencies',
    'sponsor deadlines',
    'account and payment issues',
  ],
} as const

export function isAdvisorySupportedRole(role: string): role is AdvisoryStaffRole {
  return ADVISORY_SUPPORTED_ROLES.includes(role as AdvisoryStaffRole)
}

export function getReportsForRole(role: AdvisoryStaffRole): AdvisoryReportDefinition[] {
  return STAFF_ADVISORY_REPORTS.filter((report) => report.role === role)
}
