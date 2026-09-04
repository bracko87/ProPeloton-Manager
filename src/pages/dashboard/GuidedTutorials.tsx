// src/pages/dashboard/GuidedTutorials.tsx
import React from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowRight,
  Bike,
  BookOpenCheck,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  Flag,
  Handshake,
  LineChart,
  Play,
  Route,
  Target,
  UserCog,
  Users,
} from 'lucide-react'
import TutorialOverlay from '../../components/tutorial/TutorialOverlay'
import TutorialTargetFrame from '../../components/tutorial/TutorialTargetFrame'

type GuidedTutorialStep = {
  key: string
  title: string
  body: string
  target: string
  relatedPath?: string
  relatedPathLabel?: string
}

type GuidedTutorial = {
  key: string
  title: string
  subtitle: string
  description: string
  duration: string
  difficulty: 'Beginner' | 'Important' | 'Advanced'
  icon: React.ComponentType<{ size?: number; className?: string }>
  startPath: string
  startPathLabel: string
  steps: GuidedTutorialStep[]
}

const guidedTutorials: GuidedTutorial[] = [
  {
    key: 'new-manager-first-steps',
    title: 'New Manager First Steps',
    subtitle: 'What should I do after creating a team?',
    description:
      'A short practical path for new managers: check the overview, understand the squad, set training, find a race, and prepare the team.',
    duration: '5–7 min',
    difficulty: 'Beginner',
    icon: Target,
    startPath: '/dashboard/overview',
    startPathLabel: 'Open Overview',
    steps: [
      {
        key: 'overview',
        title: 'Start From Overview',
        body:
          'Begin every login from the Overview page. It is your daily control room.\n\nCheck the Staff Briefing Centre, News Board, next race, last race, sponsor area, and any locked Premium dashboards you may want to unlock later.',
        target: 'guided-new-manager-first-steps-overview',
        relatedPath: '/dashboard/overview',
        relatedPathLabel: 'Open Overview',
      },
      {
        key: 'squad',
        title: 'Check Your Squad',
        body:
          'After Overview, open Squad and look at your riders.\n\nCheck their age, role, overall level, fitness, fatigue, wage, contract situation, and availability. This tells you what kind of team you have and what problems need attention first.',
        target: 'guided-new-manager-first-steps-squad',
        relatedPath: '/dashboard/squad',
        relatedPathLabel: 'Open Squad',
      },
      {
        key: 'training',
        title: 'Set Basic Training',
        body:
          'Training is one of the first actions a new manager should understand.\n\nSet regular training for the team, but do not push every rider too hard. Better development is useful, but high fatigue can hurt race performance.',
        target: 'guided-new-manager-first-steps-training',
        relatedPath: '/dashboard/training',
        relatedPathLabel: 'Open Training',
      },
      {
        key: 'race',
        title: 'Find Your Next Race',
        body:
          'Open Calendar to see available races and upcoming events.\n\nWhen a race is useful for your team, open its race profile and check dates, category, rider limits, application windows, stages, and possible sponsor goals.',
        target: 'guided-new-manager-first-steps-race',
        relatedPath: '/dashboard/calendar',
        relatedPathLabel: 'Open Calendar',
      },
      {
        key: 'preparation',
        title: 'Prepare Before Deadlines',
        body:
          'Race Preparation is where the game becomes active.\n\nWhen your team is accepted to a race, submit riders, staff, assets, equipment, supplies, and tactics before the deadlines. If you ignore this page, the team may enter a race with weak or incomplete preparation.',
        target: 'guided-new-manager-first-steps-preparation',
        relatedPath: '/dashboard/race-preparation',
        relatedPathLabel: 'Open Race Preparation',
      },
    ],
  },
  {
    key: 'prepare-first-race',
    title: 'Prepare Your First Race',
    subtitle: 'Race application, race plan, stage plans and deadlines.',
    description:
      'Explains the complete race-preparation chain, from the Calendar to Race Profile and Race Preparation.',
    duration: '8–10 min',
    difficulty: 'Important',
    icon: ClipboardCheck,
    startPath: '/dashboard/race-preparation',
    startPathLabel: 'Open Race Preparation',
    steps: [
      {
        key: 'calendar',
        title: 'Find a Race in Calendar',
        body:
          'Start on the Calendar. Look for races that fit your team level, rider type, and calendar situation.\n\nCheck if the race is a one-day race or a stage race, and whether it connects to a sponsor goal.',
        target: 'guided-prepare-first-race-calendar',
        relatedPath: '/dashboard/calendar',
        relatedPathLabel: 'Open Calendar',
      },
      {
        key: 'race-profile',
        title: 'Open the Race Profile',
        body:
          'The Race Profile explains the race before you apply.\n\nCheck team limits, rider limits, prize fund, application close date, participating teams announcement, number of stages, terrain, and weather when available.',
        target: 'guided-prepare-first-race-race-profile',
      },
      {
        key: 'race-plan',
        title: 'Submit the Race Plan',
        body:
          'After your team is accepted, go to Race Preparation and open Race Plan.\n\nChoose the competing squad, riders, race staff, team assets, equipment setup, and race supplies. The page also shows costs and validation warnings.',
        target: 'guided-prepare-first-race-race-plan',
        relatedPath: '/dashboard/race-preparation',
        relatedPathLabel: 'Open Race Preparation',
      },
      {
        key: 'stage-plans',
        title: 'Create Stage Plans',
        body:
          'Stage Plans open after the rider deadline.\n\nFor each stage, assign roles and tactics. A flat sprint stage, mountain stage, time trial, or hilly stage should not use the same plan.',
        target: 'guided-prepare-first-race-stage-plans',
        relatedPath: '/dashboard/race-preparation',
        relatedPathLabel: 'Open Race Preparation',
      },
      {
        key: 'deadlines',
        title: 'Respect the Deadlines',
        body:
          'Game time moves faster than real life. One in-game day is 12 real-life hours.\n\nRace Plan, rider submission, and Stage Plan locks all have deadlines. Check Overview, Notifications, and Race Preparation often so you do not miss them.',
        target: 'guided-prepare-first-race-deadlines',
        relatedPath: '/dashboard/notifications',
        relatedPathLabel: 'Open Notifications',
      },
    ],
  },
  {
    key: 'rider-development',
    title: 'How to Improve a Rider',
    subtitle: 'Skills, fatigue, morale, race sharpness and training.',
    description:
      'Shows how rider growth works and why more training is not always better.',
    duration: '6–8 min',
    difficulty: 'Important',
    icon: Users,
    startPath: '/dashboard/squad',
    startPathLabel: 'Open Squad',
    steps: [
      {
        key: 'profile',
        title: 'Open the Rider Profile',
        body:
          'Start from Squad and open a rider profile.\n\nThe profile gives the clearest view of the rider: role, age, overall, contract, market value, salary, medical status, form, and results.',
        target: 'guided-rider-development-profile',
        relatedPath: '/dashboard/squad',
        relatedPathLabel: 'Open Squad',
      },
      {
        key: 'skills',
        title: 'Understand Skills',
        body:
          'Rider skills decide what the rider can do well.\n\nSprint, climbing, time trial, endurance, flat, recovery, resistance, race IQ, teamwork, and morale all matter in different situations.',
        target: 'guided-rider-development-skills',
      },
      {
        key: 'fatigue',
        title: 'Watch Fatigue and Readiness',
        body:
          'High fatigue can reduce performance and increase problems.\n\nDo not only chase training gains. Sometimes rest, easier training, or skipping a race is better for long-term development.',
        target: 'guided-rider-development-fatigue',
        relatedPath: '/dashboard/training',
        relatedPathLabel: 'Open Training',
      },
      {
        key: 'training',
        title: 'Use Training Intelligently',
        body:
          'Use team default training for simple control, and individual training when a rider needs a special focus.\n\nTraining camps can give stronger progress, but they cost money and can affect fatigue and availability.',
        target: 'guided-rider-development-training',
        relatedPath: '/dashboard/training',
        relatedPathLabel: 'Open Training',
      },
    ],
  },
  {
    key: 'money-sponsors-survival',
    title: 'Money, Sponsors and Survival',
    subtitle: 'Avoid financial mistakes and understand income.',
    description:
      'Explains balance, income, expenses, sponsors, taxes, policies, emergency debt and liquidation risk.',
    duration: '7–9 min',
    difficulty: 'Important',
    icon: CircleDollarSign,
    startPath: '/dashboard/finance',
    startPathLabel: 'Open Finance',
    steps: [
      {
        key: 'balance',
        title: 'Watch Your Balance',
        body:
          'Finance shows whether your club is safe or under pressure.\n\nDo not spend everything at once on transfers, equipment, infrastructure, and training camps. Salaries, taxes, policies, and race operations continue to cost money.',
        target: 'guided-money-sponsors-survival-balance',
        relatedPath: '/dashboard/finance',
        relatedPathLabel: 'Open Finance',
      },
      {
        key: 'sponsors',
        title: 'Sponsors Are Core Income',
        body:
          'Sponsors bring money and sometimes bonus objectives.\n\nStandard sponsors pay without changing your team name. Naming-rights sponsors can pay more, but can temporarily change your team name during the season.',
        target: 'guided-money-sponsors-survival-sponsors',
        relatedPath: '/dashboard/finance',
        relatedPathLabel: 'Open Finance',
      },
      {
        key: 'tax',
        title: 'Do Not Ignore Tax',
        body:
          'Tax is part of the financial system. Transactions can create obligations, and audits happen during the season.\n\nCheck Tax so you understand what has been calculated, paid, refunded, or still needs attention.',
        target: 'guided-money-sponsors-survival-tax',
        relatedPath: '/dashboard/finance',
        relatedPathLabel: 'Open Finance',
      },
      {
        key: 'policies',
        title: 'Policies Can Help but Cost Money',
        body:
          'Team policies can improve comfort, attractiveness, recovery, travel, and daily operations.\n\nBut better policies usually cost more. Use them carefully and check whether the club can afford the recurring cost.',
        target: 'guided-money-sponsors-survival-policies',
        relatedPath: '/dashboard/finance',
        relatedPathLabel: 'Open Finance',
      },
    ],
  },
  {
    key: 'transfers-scouting',
    title: 'Transfers and Scouting',
    subtitle: 'Buy riders, sign free agents and reduce risk.',
    description:
      'Explains the difference between transfer-listed riders, free agents, contract negotiations, staff market and scouting.',
    duration: '6–8 min',
    difficulty: 'Important',
    icon: Handshake,
    startPath: '/dashboard/transfers',
    startPathLabel: 'Open Transfers',
    steps: [
      {
        key: 'transfer-list',
        title: 'Transfer List Riders',
        body:
          'Transfer-listed riders belong to another team.\n\nYou first make an offer to the selling team. If they accept, you then negotiate the rider contract.',
        target: 'guided-transfers-scouting-transfer-list',
        relatedPath: '/dashboard/transfers',
        relatedPathLabel: 'Open Transfers',
      },
      {
        key: 'free-agents',
        title: 'Free Agents',
        body:
          'Free agents do not belong to another team.\n\nThere is no transfer fee to a selling club, but you still need to negotiate salary, contract duration, and agent fee.',
        target: 'guided-transfers-scouting-free-agents',
        relatedPath: '/dashboard/transfers',
        relatedPathLabel: 'Open Transfers',
      },
      {
        key: 'scouting',
        title: 'Scout Before Big Decisions',
        body:
          'Scouting helps you reduce risk.\n\nBefore you spend money, scouting can improve your information about a rider. This is especially useful when visible data is incomplete or uncertain.',
        target: 'guided-transfers-scouting-scouting',
        relatedPath: '/dashboard/scouting',
        relatedPathLabel: 'Open Scouting',
      },
      {
        key: 'staff-market',
        title: 'Staff Market',
        body:
          'Transfers are not only for riders.\n\nThe Staff market lets you hire staff members. Staff limits matter, so infrastructure upgrades can become important when you want a larger staff setup.',
        target: 'guided-transfers-scouting-staff-market',
        relatedPath: '/dashboard/transfers',
        relatedPathLabel: 'Open Transfers',
      },
    ],
  },
  {
    key: 'staff-advisors',
    title: 'Staff and Advisors',
    subtitle: 'Use staff support and the Staff Briefing Centre.',
    description:
      'Explains Head Coach, Sports Director, Team Doctor, Chief Mechanic and advisor-style support on Overview.',
    duration: '5–7 min',
    difficulty: 'Important',
    icon: UserCog,
    startPath: '/dashboard/staff',
    startPathLabel: 'Open Staff',
    steps: [
      {
        key: 'hire-staff',
        title: 'Hire the Right Staff',
        body:
          'Staff members support different parts of your club.\n\nHead Coach helps training and readiness, Sports Director helps race planning, Team Doctor helps health and recovery, and Chief Mechanic helps equipment and assets.',
        target: 'guided-staff-advisors-hire-staff',
        relatedPath: '/dashboard/staff',
        relatedPathLabel: 'Open Staff',
      },
      {
        key: 'limits',
        title: 'Staff Limits Matter',
        body:
          'You cannot hire unlimited staff.\n\nSome limits depend on your club setup and infrastructure. Upgrading facilities can unlock or increase staff capacity.',
        target: 'guided-staff-advisors-limits',
        relatedPath: '/dashboard/infrastructure',
        relatedPathLabel: 'Open Infrastructure',
      },
      {
        key: 'briefing-centre',
        title: 'Use the Staff Briefing Centre',
        body:
          'The Staff Briefing Centre on Overview lets you assign staff as optional advisors for additional analysis and reports.\n\nSome advisor functions or advanced reports may require Premium or coins.',
        target: 'guided-staff-advisors-briefing-centre',
        relatedPath: '/dashboard/overview',
        relatedPathLabel: 'Open Overview',
      },
    ],
  },
  {
    key: 'equipment-supplies',
    title: 'Equipment and Race Supplies',
    subtitle: 'Race setups, inventory, market and consumables.',
    description:
      'Explains how equipment bonuses and supplies connect to Race Preparation and difficult weather.',
    duration: '6–8 min',
    difficulty: 'Advanced',
    icon: Bike,
    startPath: '/dashboard/equipment',
    startPathLabel: 'Open Equipment',
    steps: [
      {
        key: 'inventory',
        title: 'Understand Inventory',
        body:
          'Inventory shows the equipment your team owns.\n\nCheck quality, condition, bonuses, value, and availability. Equipment can be useful, but poor condition can reduce value and performance.',
        target: 'guided-equipment-supplies-inventory',
        relatedPath: '/dashboard/equipment',
        relatedPathLabel: 'Open Equipment',
      },
      {
        key: 'setups',
        title: 'Create Race Setups',
        body:
          'Race setups connect equipment to race performance.\n\nDifferent terrain needs different support. A sprint stage, mountain stage, cobble stage, and time trial can all benefit from different equipment choices.',
        target: 'guided-equipment-supplies-setups',
        relatedPath: '/dashboard/equipment',
        relatedPathLabel: 'Open Equipment',
      },
      {
        key: 'supplies',
        title: 'Use Race Supplies',
        body:
          'Race supplies are consumable support items.\n\nBidons, gels, nutrition packs, race jerseys, and rain jackets can protect riders or help performance in difficult race conditions. They are selected during Race Preparation.',
        target: 'guided-equipment-supplies-supplies',
        relatedPath: '/dashboard/equipment',
        relatedPathLabel: 'Open Equipment',
      },
    ],
  },
  {
    key: 'infrastructure-assets',
    title: 'Infrastructure and Assets',
    subtitle: 'Build long-term club strength.',
    description:
      'Explains facility upgrades, project times, staff limits, vehicles, repairs, sales and race support assets.',
    duration: '6–8 min',
    difficulty: 'Advanced',
    icon: Building2,
    startPath: '/dashboard/infrastructure',
    startPathLabel: 'Open Infrastructure',
    steps: [
      {
        key: 'facilities',
        title: 'Facilities Improve the Club',
        body:
          'Facilities are long-term investments.\n\nTraining Center, Medical Center, Youth Academy, Mechanics Workshop, Scouting Office, and Club House upgrades can unlock bonuses, staff capacity, and better club support.',
        target: 'guided-infrastructure-assets-facilities',
        relatedPath: '/dashboard/infrastructure',
        relatedPathLabel: 'Open Infrastructure',
      },
      {
        key: 'projects',
        title: 'Projects Take Game Days',
        body:
          'Infrastructure projects are not instant.\n\nCheck cost, duration, project slots, completion date, and cancellation/refund information before starting an upgrade.',
        target: 'guided-infrastructure-assets-projects',
        relatedPath: '/dashboard/infrastructure',
        relatedPathLabel: 'Open Infrastructure',
      },
      {
        key: 'assets',
        title: 'Team Assets Support Racing',
        body:
          'Team cars, buses, equipment vans, mobile workshops, and medical vans can help during races and preparation.\n\nAssets can have levels, condition, bonuses, limits, repair options, and sale options. Some advanced asset features may require Premium or coins.',
        target: 'guided-infrastructure-assets-assets',
        relatedPath: '/dashboard/infrastructure',
        relatedPathLabel: 'Open Infrastructure',
      },
    ],
  },
  {
    key: 'ranking-season-progress',
    title: 'Ranking and Season Progress',
    subtitle: 'Understand the bigger goal of the season.',
    description:
      'Explains why races matter: points, tiers, promotion, relegation, statistics and long-term progress.',
    duration: '5–7 min',
    difficulty: 'Beginner',
    icon: LineChart,
    startPath: '/dashboard/team-ranking',
    startPathLabel: 'Open Team Ranking',
    steps: [
      {
        key: 'points',
        title: 'Races Create Points',
        body:
          'Race results create international points.\n\nBetter results in bigger races usually give more points. These points decide your position in the team ranking.',
        target: 'guided-ranking-season-progress-points',
        relatedPath: '/dashboard/team-ranking',
        relatedPathLabel: 'Open Team Ranking',
      },
      {
        key: 'tiers',
        title: 'Understand Tiers and Divisions',
        body:
          'Teams compete in different tiers and divisions, such as WorldTeam, ProTeam, Continental, and Amateur.\n\nYour goal is to improve your team and climb as high as possible over multiple seasons.',
        target: 'guided-ranking-season-progress-tiers',
        relatedPath: '/dashboard/team-ranking',
        relatedPathLabel: 'Open Team Ranking',
      },
      {
        key: 'statistics',
        title: 'Use Statistics to Compare Progress',
        body:
          'Statistics help you understand the wider cycling world.\n\nCompare teams and riders by points, wins, podiums, jerseys, current season results, and historical performance.',
        target: 'guided-ranking-season-progress-statistics',
        relatedPath: '/dashboard/statistics',
        relatedPathLabel: 'Open Statistics',
      },
    ],
  },
]

const difficultyClass: Record<GuidedTutorial['difficulty'], string> = {
  Beginner: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Important: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  Advanced: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

function getStepTarget(lesson: GuidedTutorial, step: GuidedTutorialStep): string {
  return `guided-${lesson.key}-${step.key}`
}

export default function GuidedTutorialsPage(): JSX.Element {
  const navigate = useNavigate()
  const [selectedKey, setSelectedKey] = React.useState(guidedTutorials[0].key)
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  const [activeStepIndex, setActiveStepIndex] = React.useState(0)

  const selectedTutorial = React.useMemo(() => {
    return guidedTutorials.find(tutorial => tutorial.key === selectedKey) ?? guidedTutorials[0]
  }, [selectedKey])

  const activeTutorial = React.useMemo(() => {
    if (!activeKey) return null
    return guidedTutorials.find(tutorial => tutorial.key === activeKey) ?? null
  }, [activeKey])

  const activeStep = activeTutorial?.steps[activeStepIndex] ?? null
  const activeTarget = activeTutorial && activeStep ? getStepTarget(activeTutorial, activeStep) : null

  const startTutorial = (tutorial: GuidedTutorial): void => {
    setSelectedKey(tutorial.key)
    setActiveKey(tutorial.key)
    setActiveStepIndex(0)

    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 0)
  }

  const closeTutorial = (): void => {
    setActiveKey(null)
    setActiveStepIndex(0)
  }

  const goNext = (): void => {
    if (!activeTutorial) return

    if (activeStepIndex >= activeTutorial.steps.length - 1) {
      closeTutorial()
      return
    }

    setActiveStepIndex(current => current + 1)
  }

  const goPrevious = (): void => {
    setActiveStepIndex(current => Math.max(0, current - 1))
  }

  const openRelatedPage = (path: string): void => {
    navigate(path)
  }

  const SelectedIcon = selectedTutorial.icon

  return (
    <div className="min-h-full bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section
          data-tutorial-target="guided-page-intro"
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="bg-black px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  Guided Tutorials
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                  Manager Lessons
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Optional process tutorials that explain what is happening across several pages. The main tutorial shows where pages are; these lessons explain how to actually play important parts of the game.
                </p>
              </div>

              <button
                type="button"
                onClick={() => startTutorial(selectedTutorial)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-yellow-300"
              >
                <Play size={16} />
                Start selected lesson
              </button>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Lesson types</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">9</div>
              <div className="mt-1 text-sm text-slate-500">Process flows</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Best first</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">First Steps</div>
              <div className="mt-1 text-sm text-slate-500">For new managers</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Most important</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">First Race</div>
              <div className="mt-1 text-sm text-slate-500">Preparation deadlines</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Safe design</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">Optional</div>
              <div className="mt-1 text-sm text-slate-500">Does not interrupt play</div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Available guided tutorials</h2>
                <p className="mt-1 text-sm text-slate-500">Choose a process, then start the lesson.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              {guidedTutorials.map(tutorial => {
                const Icon = tutorial.icon
                const selected = tutorial.key === selectedTutorial.key

                return (
                  <button
                    key={tutorial.key}
                    type="button"
                    onClick={() => setSelectedKey(tutorial.key)}
                    className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-yellow-300 hover:bg-yellow-50/40 ${
                      selected ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black text-yellow-400">
                        <Icon size={19} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-950">{tutorial.title}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${difficultyClass[tutorial.difficulty]}`}>
                            {tutorial.difficulty}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">{tutorial.subtitle}</span>
                        <span className="mt-2 block text-xs text-slate-400">{tutorial.duration} · {tutorial.steps.length} steps</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div
              data-tutorial-target="guided-selected-lesson"
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-black text-yellow-400">
                    <SelectedIcon size={26} />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold text-slate-950">{selectedTutorial.title}</h2>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${difficultyClass[selectedTutorial.difficulty]}`}>
                        {selectedTutorial.difficulty}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{selectedTutorial.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-3 py-1">{selectedTutorial.duration}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">{selectedTutorial.steps.length} steps</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">Optional lesson</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startTutorial(selectedTutorial)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-300"
                  >
                    <Play size={16} />
                    Start lesson
                  </button>
                  <button
                    type="button"
                    onClick={() => openRelatedPage(selectedTutorial.startPath)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {selectedTutorial.startPathLabel}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Route size={18} className="text-yellow-600" />
                <h3 className="text-lg font-semibold text-slate-950">Process flow</h3>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                These are the points explained by this guided tutorial.
              </p>

              <div className="mt-5 space-y-3">
                {selectedTutorial.steps.map((step, index) => {
                  const target = getStepTarget(selectedTutorial, step)

                  return (
                    <div
                      key={step.key}
                      data-tutorial-target={target}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-sm font-semibold text-black">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-950">{step.title}</div>
                          <div className="mt-1 text-sm leading-6 text-slate-600">{step.body.split('\n\n')[0]}</div>

                          {step.relatedPath && step.relatedPathLabel ? (
                            <button
                              type="button"
                              onClick={() => openRelatedPage(step.relatedPath!)}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-black"
                            >
                              {step.relatedPathLabel}
                              <ArrowRight size={13} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div
              data-tutorial-target="guided-page-note"
              className="rounded-3xl border border-yellow-200 bg-yellow-50 p-6 text-sm leading-6 text-yellow-900"
            >
              <div className="flex items-start gap-3">
                <BookOpenCheck size={20} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">How this is different from the main tutorial</div>
                  <p className="mt-1">
                    The main tutorial should stay a general page tour. These guided tutorials are separate optional lessons for deeper processes, so users can repeat them without resetting the full tutorial.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {activeTutorial && activeStep ? (
        <>
          <TutorialTargetFrame target={activeTarget} />
          <TutorialOverlay
            key={`${activeTutorial.key}-${activeStep.key}`}
            open
            title={activeStep.title}
            body={activeStep.body}
            stepLabel={`${activeStepIndex + 1} / ${activeTutorial.steps.length}`}
            primaryAction={
              activeStepIndex >= activeTutorial.steps.length - 1
                ? 'Finish lesson'
                : 'Next'
            }
            secondaryAction={activeStepIndex > 0 ? 'Previous' : 'Close'}
            onPrimary={goNext}
            onSecondary={activeStepIndex > 0 ? goPrevious : closeTutorial}
            onClose={closeTutorial}
          />
        </>
      ) : null}
    </div>
  )
}
