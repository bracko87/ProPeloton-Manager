import enCalendarPage from '../../i18n/locales/en/calendarPage.json'
import srCalendarPage from '../../i18n/locales/sr-Latn/calendarPage.json'
import {
  createLegacyLocalizationBridge,
  type LegacyLocalizationBridgeOptions,
} from './createLegacyLocalizationBridge'

const MONTHS = new Set([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
])

const SHORT_MONTHS = new Set([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
])

const WEEKDAYS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
])

function month(
  value: string,
  t: (key: string) => string,
): string {
  return MONTHS.has(value)
    ? t(`calendarPage:dates.months.${value}`)
    : value
}

function dateMonth(
  value: string,
  t: (key: string) => string,
): string {
  return MONTHS.has(value)
    ? t(
        `calendarPage:dates.monthsDate.${value}`,
      )
    : value
}

function shortMonth(
  value: string,
  t: (key: string) => string,
): string {
  return SHORT_MONTHS.has(value)
    ? t(
        `calendarPage:dates.shortMonths.${value}`,
      )
    : value
}

function weekday(
  value: string,
  t: (key: string) => string,
): string {
  return WEEKDAYS.has(value)
    ? t(
        `calendarPage:dates.weekdays.${value}`,
      )
    : value
}

const options: LegacyLocalizationBridgeOptions = {
  namespace: 'calendarPage',
  enResource: enCalendarPage,
  srResource: srCalendarPage,
  routeMatch: path => {
    const clean = path.split('?')[0]

    return (
      clean === '/dashboard/calendar' ||
      clean.startsWith('/dashboard/calendar/')
    )
  },
  aliases: {
    'Loading calendar...': 'page.loading',
  },
  resolveStaticKey: (text, element) => {
    if (text !== 'Clear') return null

    return element?.tagName === 'BUTTON'
      ? 'calendarPage:filters.clear'
      : 'calendarPage:weather.clear'
  },
  transformParams: (key, params, t) => {
    if (params.month) {
      if (
        key.includes('.compact') ||
        key.includes('.dateBadge')
      ) {
        params.month = shortMonth(
          params.month,
          t,
        )
      } else if (
        key.includes('.gameDate') ||
        key.includes('.calendarCell')
      ) {
        params.month = dateMonth(
          params.month,
          t,
        )
      } else {
        params.month = month(
          params.month,
          t,
        )
      }
    }

    if (params.weekday) {
      params.weekday = weekday(
        params.weekday,
        t,
      )
    }

    return params
  },
}

export default createLegacyLocalizationBridge(options)
