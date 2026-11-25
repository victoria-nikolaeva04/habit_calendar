import { addMonths, format } from 'date-fns'
import { MAX_REPEATS, type Freq } from '../lib/recurrence'
import { repeatSummary, type Repeat, type RepeatState } from '../lib/repeat'
import { Repeat as RepeatIcon } from 'lucide-react'

const UNITS: { value: Freq; one: string; many: string }[] = [
  { value: 'daily', one: 'day', many: 'days' },
  { value: 'weekly', one: 'week', many: 'weeks' },
  { value: 'monthly', one: 'month', many: 'months' },
  { value: 'yearly', one: 'year', many: 'years' },
]
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Props = {
  state: RepeatState
  onChange: (next: RepeatState) => void
  start: Date          // the first date; may be invalid while its field is being edited
  zone: string         // the zone `start` is in
  noun: string         // 'events' or 'tasks', for the summary and labels
}

// The "Repeat" dropdown with its custom rule and end settings, shared by the event and task forms
export function RepeatPicker({ state, onChange, start, zone, noun }: Props) {
  const set = (changes: Partial<RepeatState>) => onChange({ ...state, ...changes })
  const startValid = !isNaN(start.getTime())
  // Labels for the presets, named after the start date
  const startLabel = (f: string) => (startValid ? format(start, f) : '…')
  const summary = repeatSummary(state, start, zone, noun)
  const minDate = startValid ? format(start, 'yyyy-MM-dd') : undefined

  return (
    <div className="repeat-box">
      <label className="field">
        <span>Repeat</span>
        <select value={state.repeat} onChange={(e) => {
          const repeat = e.target.value as Repeat
          // A first end date a few months out, so choosing a repeat gives a usable rule right away
          set({ repeat, ...(repeat !== 'none' && !state.until && startValid && { until: format(addMonths(start, 3), 'yyyy-MM-dd') }) })
        }}>
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">{`Weekly on ${startLabel('EEEE')}`}</option>
          <option value="monthly">{`Monthly on day ${startLabel('d')}`}</option>
          <option value="yearly">{`Annually on ${startLabel('MMMM d')}`}</option>
          <option value="weekdays">Every weekday (Monday to Friday)</option>
          <option value="custom">Custom…</option>
        </select>
      </label>
      {state.repeat === 'custom' && (
        <div className="custom-repeat">
          <div className="field-row">
            <label className="field">
              <span>Repeat every</span>
              <input type="number" min={1} max={999} required value={state.interval}
                onChange={(e) => set({ interval: e.target.value })} />
            </label>
            <label className="field">
              <span>Unit</span>
              <select value={state.unit} onChange={(e) => set({ unit: e.target.value as Freq })}>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{Number(state.interval) === 1 ? u.one : u.many}</option>
                ))}
              </select>
            </label>
          </div>
          {state.unit === 'weekly' && (
            <div className="field">
              <span>Repeat on</span>
              <div className="weekdays" role="group" aria-label="Repeat on">
                {WEEKDAYS.map((l, d) => (
                  <button key={d} type="button" aria-pressed={state.days.includes(d)} aria-label={WEEKDAY_NAMES[d]}
                    className={`weekday${state.days.includes(d) ? ' selected' : ''}`}
                    onClick={() => set({ days: state.days.includes(d) ? state.days.filter((x) => x !== d) : [...state.days, d] })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {state.repeat !== 'none' && (
        <>
          <label className="check">
            <input type="checkbox" checked={state.never} onChange={(e) => set({ never: e.target.checked })} /> Never ends
          </label>
          {!state.never && (
            <div className="field-row">
              <label className="field">
                <span>Ends</span>
                <select value={state.endMode} onChange={(e) => set({ endMode: e.target.value as 'until' | 'count' })}>
                  <option value="until">On date</option>
                  <option value="count">{`After a number of ${noun}`}</option>
                </select>
              </label>
              {state.endMode === 'until' ? (
                <label className="field">
                  <span>End date</span>
                  <input type="date" required value={state.until} min={minDate}
                    onChange={(e) => set({ until: e.target.value })} />
                </label>
              ) : (
                <label className="field">
                  <span>{noun[0].toUpperCase() + noun.slice(1)}</span>
                  <input type="number" min={1} max={MAX_REPEATS} required value={state.count}
                    onChange={(e) => set({ count: e.target.value })} />
                </label>
              )}
            </div>
          )}
        </>
      )}
      {summary && <p className="repeat-summary"><RepeatIcon size={16} aria-hidden="true" /> {summary}</p>}
    </div>
  )
}
