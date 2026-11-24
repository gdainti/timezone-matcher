import { ZONE_COUNTRY } from './zone-country'

/** ISO weekdays: 1 = Monday … 7 = Sunday */
export interface WeekInfo {
  firstDay: number
  weekend: number[]
}

// Used only when the browser has no Intl.Locale week info (CLDR weekData, abridged).
const SUNDAY_FIRST = new Set(
  'AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'.split(
    ' ',
  ),
)
const SATURDAY_FIRST = new Set('AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'.split(' '))
const FRI_SAT_WEEKEND = new Set('AE BH DZ EG IQ IL JO KW LY OM QA SA SD SY YE'.split(' '))

function regionFromLocale(): string | undefined {
  try {
    return new Intl.Locale(navigator.language).maximize().region
  } catch {
    return undefined
  }
}

/**
 * Week convention for a time zone: the zone's country decides (so an en-US browser in
 * Europe/Tallinn still gets Monday); zones without a country (UTC, Etc/*) fall back to the
 * browser locale's region.
 */
export function weekInfo(tz: string): WeekInfo {
  const region = ZONE_COUNTRY[tz] ?? regionFromLocale() ?? '001'
  try {
    const loc = new Intl.Locale(`und-${region}`) as Intl.Locale & {
      getWeekInfo?: () => WeekInfo
      weekInfo?: WeekInfo
    }
    const info = loc.getWeekInfo?.() ?? loc.weekInfo
    if (info?.firstDay) return { firstDay: info.firstDay, weekend: info.weekend ?? [6, 7] }
  } catch {}
  return {
    firstDay: SUNDAY_FIRST.has(region) ? 7 : SATURDAY_FIRST.has(region) ? 6 : 1,
    weekend: FRI_SAT_WEEKEND.has(region) ? [5, 6] : [6, 7],
  }
}
