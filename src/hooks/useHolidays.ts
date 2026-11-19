import { useEffect, useState } from 'react'
import { getHolidays, type Holiday } from '../lib/holidays'

// Holidays by 'yyyy-MM-dd' for every year touched by [from, to]. Failures are non-fatal: no holidays are shown.
export function useHolidays(country: string | null | undefined, from: Date, to: Date) {
  const [byDate, setByDate] = useState<Map<string, Holiday[]>>(new Map())
  const y1 = from.getFullYear()
  const y2 = to.getFullYear()

  useEffect(() => {
    if (!country) return
    let cancelled = false
    const years = y1 === y2 ? [y1] : [y1, y2]
    Promise.all(years.map((y) => getHolidays(country, y)))
      .then((lists) => {
        if (cancelled) return
        const map = new Map<string, Holiday[]>()
        for (const h of lists.flat()) map.set(h.date, [...(map.get(h.date) ?? []), h])
        setByDate(map)
      })
      .catch((e) => {
        if (cancelled) return
        console.error('Could not load holidays:', e)
        setByDate(new Map())
      })
    return () => { cancelled = true }
  }, [country, y1, y2])

  return country ? byDate : NONE
}

const NONE = new Map<string, Holiday[]>()
