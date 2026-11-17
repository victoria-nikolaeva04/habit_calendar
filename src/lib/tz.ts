import { TZDate } from '@date-fns/tz'

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

// Fall back to the browser's zone if the saved one is missing or not a valid IANA name
export function resolveTimeZone(tz: string | null | undefined) {
  if (!tz) return browserTimeZone()
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return tz
  } catch {
    return browserTimeZone()
  }
}

// An instant (Date, ms or ISO string) as a date whose day/hour/etc. are read in `tz`.
// date-fns functions keep the zone, so startOfDay/addDays/format all work in `tz`.
export const inTz = (d: Date | number | string, tz: string) => new TZDate(new Date(d).getTime(), tz)

export const nowIn = (tz: string) => new TZDate(Date.now(), tz)

// "2026-11-13T09:00" (or "2026-11-13") typed as wall-clock time in `tz` -> that instant
export function wallTime(s: string, tz: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s)
  if (!m) return new Date(NaN)
  const [, y, mo, d, h = '0', mi = '0'] = m
  return new TZDate(+y, +mo - 1, +d, +h, +mi, 0, 0, tz)
}

// Always UTC ("...Z"), unlike TZDate#toISOString which uses the zone's offset
export const toUtcIso = (d: Date) => new Date(d.getTime()).toISOString()
