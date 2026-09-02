import './mobile-race-preparation-refit-v2.css'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'
const RACE_PREPARATION_PAGE = '[data-ppm-dashboard-page="race-preparation"]'

function getStageProfileActionLabel(action: 'expand' | 'close'): string {
  const language = (document.documentElement.lang || 'en').toLowerCase()
  const baseLanguage = language.startsWith('sr') ? 'sr' : language.split('-')[0]

  const labels: Record<string, { expand: string; close: string }> = {
    en: { expand: 'Expand stage profile', close: 'Close stage profile' },
    sr: { expand: 'Proširi profil etape', close: 'Zatvori profil etape' },
    de: { expand: 'Etappenprofil vergrößern', close: 'Etappenprofil schließen' },
    hr: { expand: 'Proširi profil etape', close: 'Zatvori profil etape' },
    es: { expand: 'Ampliar perfil de etapa', close: 'Cerrar perfil de etapa' },
    it: { expand: 'Espandi profilo tappa', close: 'Chiudi profilo tappa' },
    fr: { expand: 'Agrandir le profil de l’étape', close: 'Fermer le profil de l’étape' },
    ru: { expand: 'Развернуть профиль этапа', close: 'Закрыть профиль этапа' },
  }

  return (labels[baseLanguage] ?? labels.en)[action]
}

function buildAcceptedRaceMobileSummary(infoButton: HTMLButtonElement): void {
  if (infoButton.dataset.ppmMobileRaceSummaryReady === 'true') return

  const metaRow = infoButton.children.item(0) as HTMLElement | null
  const routeRow = infoButton.children.item(1) as HTMLElement | null

  if (!metaRow || !routeRow || metaRow.children.length < 2) return

  const summary = document.createElement('div')
  summary.className = 'ppm-mobile-race-summary'
  summary.dataset.ppmMobileRaceSummary = 'true'

  const titleRow = document.createElement('div')
  titleRow.className = 'ppm-mobile-race-summary-title'

  const flag = metaRow.children.item(0)?.cloneNode(true)
  const name = metaRow.children.item(1)?.cloneNode(true)
  if (flag) titleRow.appendChild(flag)
  if (name) titleRow.appendChild(name)

  const route = routeRow.cloneNode(true) as HTMLElement
  route.classList.add('ppm-mobile-race-summary-route')

  const badgeRow = document.createElement('div')
  badgeRow.className = 'ppm-mobile-race-summary-badges'
  Array.from(metaRow.children)
    .slice(2)
    .forEach((badge) => badgeRow.appendChild(badge.cloneNode(true)))

  summary.append(titleRow, route, badgeRow)
  infoButton.appendChild(summary)

  metaRow.dataset.ppmMobileRaceOriginal = 'true'
  routeRow.dataset.ppmMobileRaceOriginal = 'true'
  infoButton.dataset.ppmMobileRaceSummaryReady = 'true'
}

function prepareAcceptedRaceCards(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>('div.grid[class*="md:grid-cols-[80px_1fr_auto]"]')
    .forEach((grid) => {
      const infoButton = grid.children.item(1)
      if (!(infoButton instanceof HTMLButtonElement)) return

      grid.dataset.ppmMobileAcceptedRaceGrid = 'true'
      const dateColumn = grid.children.item(0) as HTMLElement | null
      const actionColumn = grid.children.item(2) as HTMLElement | null
      if (dateColumn) dateColumn.dataset.ppmMobileAcceptedRaceDate = 'true'
      if (actionColumn) actionColumn.dataset.ppmMobileAcceptedRaceActions = 'true'

      buildAcceptedRaceMobileSummary(infoButton)
    })
}

function closeExpandedStageProfile(wrapper: HTMLElement): void {
  delete wrapper.dataset.ppmStageProfileExpanded
  delete document.body.dataset.ppmStageProfileExpanded
}

function prepareStageProfileChart(svg: SVGSVGElement): void {
  const wrapper = svg.parentElement
  if (!wrapper || wrapper.dataset.ppmStageProfilePrepared === 'true') return

  wrapper.dataset.ppmStageProfilePrepared = 'true'
  svg.dataset.ppmStageProfileChart = 'true'

  const expandButton = document.createElement('button')
  expandButton.type = 'button'
  expandButton.className = 'ppm-stage-profile-expand'
  expandButton.textContent = '⛶'
  expandButton.setAttribute('aria-label', getStageProfileActionLabel('expand'))
  expandButton.setAttribute('title', getStageProfileActionLabel('expand'))
  expandButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    wrapper.dataset.ppmStageProfileExpanded = 'true'
    document.body.dataset.ppmStageProfileExpanded = 'true'
    wrapper.scrollLeft = 0
  })

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'ppm-stage-profile-close'
  closeButton.textContent = '×'
  closeButton.setAttribute('aria-label', getStageProfileActionLabel('close'))
  closeButton.setAttribute('title', getStageProfileActionLabel('close'))
  closeButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    closeExpandedStageProfile(wrapper)
  })

  wrapper.prepend(closeButton)
  wrapper.prepend(expandButton)
}

function prepareStageProfiles(root: HTMLElement): void {
  root
    .querySelectorAll<SVGSVGElement>('svg[aria-label="Stage profile chart"]')
    .forEach(prepareStageProfileChart)
}

function applyMobileRacePreparationRefit(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const root = document.querySelector<HTMLElement>(RACE_PREPARATION_PAGE)
  if (!root) return

  prepareAcceptedRaceCards(root)
  prepareStageProfiles(root)
}

function installMobileRacePreparationRefitBridge(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const mobileMedia = window.matchMedia(MOBILE_MEDIA_QUERY)
  let frame = 0

  const scheduleApply = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      if (mobileMedia.matches) applyMobileRacePreparationRefit()
    })
  }

  const observer = new MutationObserver(scheduleApply)
  observer.observe(document.body, { childList: true, subtree: true })

  window.addEventListener('hashchange', scheduleApply)
  mobileMedia.addEventListener('change', scheduleApply)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return

    const expanded = document.querySelector<HTMLElement>(
      `${RACE_PREPARATION_PAGE} [data-ppm-stage-profile-expanded="true"]`,
    )
    if (expanded) closeExpandedStageProfile(expanded)
  })

  scheduleApply()
}

installMobileRacePreparationRefitBridge()

export {}
