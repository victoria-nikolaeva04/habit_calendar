import type { Holiday } from '../lib/holidays'

// Read-only label for a public holiday; clicking it falls through to the day (add event)
export function HolidayChip({ holiday }: { holiday: Holiday }) {
  const title = holiday.localName !== holiday.name ? `${holiday.name} (${holiday.localName})` : holiday.name
  return <div className="holiday" title={title}>{holiday.name}</div>
}
