// Public holidays from Nager.Date (https://date.nager.at), no API key needed.
const BASE = 'https://date.nager.at/api/v3'

export type Holiday = { date: string; name: string; localName: string }
export type Country = { countryCode: string; name: string }

// Cache the promises so views flipping between months don't refetch; failures are evicted to allow a retry
const yearCache = new Map<string, Promise<Holiday[]>>()
let countriesCache: Promise<Country[]> | null = null

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Holiday service returned ${res.status}`)
  return res.json() as Promise<T>
}

export function getHolidays(country: string, year: number): Promise<Holiday[]> {
  const key = `${country}:${year}`
  let p = yearCache.get(key)
  if (!p) {
    p = getJson<Holiday[]>(`/PublicHolidays/${year}/${country}`)
    p.catch(() => yearCache.delete(key))
    yearCache.set(key, p)
  }
  return p
}

export function getCountries(): Promise<Country[]> {
  if (!countriesCache) {
    countriesCache = getJson<Country[]>('/AvailableCountries')
    countriesCache.catch(() => { countriesCache = null })
  }
  return countriesCache
}
