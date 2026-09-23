const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

export interface Zoned {
  weekday: string
  day: number
  hour: number
  minute: number
  offsetMin: number
}

export function zoned(tz: string, ms: number): Zoned {
  const p: Record<string, string> = {}
  for (const part of formatter(tz).formatToParts(ms)) p[part.type] = part.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return {
    weekday: p.weekday,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    offsetMin: Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000),
  }
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const supported = Intl.supportedValuesOf('timeZone')
export const allZones: string[] = supported.includes('UTC') ? supported : ['UTC', ...supported]

export function resolveZone(input: string): string | null {
  const q = input.trim().toLowerCase().replace(/[\s_]+/g, ' ')
  if (!q) return null
  if (/^(utc|gmt)( ?[+-] ?0{1,2}(:00)?)?$/.test(q)) return 'UTC'
  const norm = (z: string) => z.toLowerCase().replace(/_/g, ' ')
  const exact = allZones.find((z) => norm(z) === q || norm(z).split('/').pop() === q)
  if (exact) return exact
  const partial = allZones.find((z) => norm(z).includes(q))
  if (partial) return partial
  return isValidZone(input.trim()) ? input.trim() : null
}

export function cityName(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
}

export function formatOffset(min: number): string {
  const sign = min < 0 ? '-' : '+'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

export function formatDiff(min: number): string {
  if (min === 0) return 'same time'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const body = m ? `${h}h ${m}m` : `${h}h`
  return `${body} ${min > 0 ? 'ahead' : 'behind'}`
}

export function formatShortDiff(min: number): string {
  if (min === 0) return '±0h'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${min > 0 ? '+' : '-'}${h}h${m ? pad2(m) : ''}`
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

const HOUR = 3_600_000
const STEP = 15 * 60_000

export interface Block {
  start: number
  hour: number
  dayLabel: string | null
  kind: 'night' | 'edge' | 'work'
}

export function hourBlocks(tz: string, start: number, end: number): Block[] {
  const blocks: Block[] = []
  for (let t = start - HOUR; t < end; t += STEP) {
    const z = zoned(tz, t)
    if (z.minute !== 0) continue
    const kind = z.hour >= 9 && z.hour < 18 ? 'work' : z.hour >= 7 && z.hour < 24 ? 'edge' : 'night'
    blocks.push({
      start: t,
      hour: z.hour,
      dayLabel: z.hour === 0 ? `${z.weekday} ${z.day}` : null,
      kind,
    })
  }
  return blocks
}

export { HOUR }
