# Habit Calendar

A calendar app to help with habit tracking. Built with React, TypeScript, Vite and Supabase.

> Work in progress. Calendar views, events and user profiles are working; habit-tracking features are still to come.

## Features

- **Passwordless sign-in**: enter your email and get a magic link (Supabase Auth).
- **Month, Week and Day views**: switch between them from the app bar.
- **Events**: add events from any view. Events can be all-day, have notes and a color, and multi-day events show up across every day they overlap. Click an event to see its details, then use the pencil icon to edit it (the edit form has the Delete button).
- **Repeating events**: daily, weekly, monthly, annually, every weekday, or a custom rule (every N days/weeks/months/years, with a weekday picker). A series can end on a date, after a number of events, or never. When you edit or delete an event in a series you choose **This event**, **This and following events** or **All events**.
- **Search**: search event titles and notes from the app bar; clicking a result jumps the calendar to that date. A repeating event is listed once, as its next occurrence.
- **Public holidays**: pick a country in your profile to show its public holidays on the calendar (from [Nager.Date](https://date.nager.at), no API key needed).
- **Profile page**:
  - Display name
  - Time zone
  - Choose which day the week starts on (affects Month and Week views)
  - Country for public holidays
  - 12-hour or 24-hour time format
  - Sign out
  - Delete account (permanently removes your profile and all your events)

## How repeating events are stored

A series is a single "master" row in `events`: its first start and end plus the rule in the `recurrence` column. The occurrences are generated in the app for whatever range is on screen, so nothing is stored per occurrence and a series can safely never end. Only an occurrence you change or delete gets its own "exception" row, which points at the master and records which occurrence it replaces. "This and following events" ends the old series the day before and starts a new one, in a single database call (`split_series`).

## Tech stack

- [React 19](https://react.dev) + TypeScript
- [Vite](https://vite.dev)
- [Supabase](https://supabase.com) (auth + Postgres database)
- [date-fns](https://date-fns.org) + `@date-fns/tz` for date handling in the profile's time zone
- [Nager.Date](https://date.nager.at) public holidays API (free, no API key)
- ESLint

## Getting started

### Prerequisites

- Node.js and npm
- A Supabase project

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file in the project root with your Supabase credentials:

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

3. Apply the database migrations in [supabase/migrations/](supabase/migrations/) (for example with `npx supabase db push` on a linked project). Together they create these pieces:
   - `events` table: `id`, `user_id`, `title`, `notes`, `starts_at`, `ends_at`, `all_day`, `color`, `created_at`, plus the repeating-event columns `recurrence`, `recurrence_ends_at`, `series_id`, `original_start`, `cancelled`. A repeating event is one row holding its rule; only occurrences you change or delete get their own row (see [the migration](supabase/migrations/20261119120000_events_parent_child.sql))
   - `events_in_range` and `split_series` RPC functions used to load the calendar and to edit "this and following events"
   - `profiles` table: `id`, `display_name`, `timezone`, `week_start_on`, `time_format`, `holiday_country`, `created_at`, `updated_at`
   - A `delete_own_account` RPC function used by the Delete account button

   (types are in [src/lib/database.types.ts](src/lib/database.types.ts))

4. Start the dev server:

   ```bash
   npm run dev
   ```

### Scripts

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `npm run dev`     | Start the Vite dev server           |
| `npm run build`   | Type-check and build for production |
| `npm run lint`    | Run ESLint                          |
| `npm run preview` | Preview the production build        |

## Project structure

```
src/
  App.tsx              # Auth gate, view switcher, search, profile loading
  components/
    SignIn.tsx         # Magic-link sign-in form
    MonthView.tsx      # Month calendar
    WeekView.tsx       # Week calendar
    DayView.tsx        # Day calendar
    SearchBox.tsx      # Event search in the app bar
    EventPopup.tsx     # Event details first, then the edit form
    EventDetails.tsx   # Read-only event details
    EventForm.tsx      # Add / edit / delete events, repeat rules and scopes
    HolidayChip.tsx    # Public holiday label on a day
    RepeatMark.tsx     # Marker for events in a series
    Profile.tsx        # Profile + account settings
  hooks/
    useSession.ts      # Supabase auth session hook
    useHolidays.ts     # Public holidays for the visible dates
    useNow.ts          # Current time, for the "now" line
  lib/
    api.ts             # Event (including series and search) and profile queries
    recurrence.ts      # Repeat rules: generating occurrences, splitting a series
    holidays.ts        # Public holiday lookups (Nager.Date)
    supabase.ts        # Supabase client
    tz.ts              # Time zone helpers (profile zone <-> UTC)
    dayLayout.ts       # Event placement in Week/Day columns, overlap layout
    eventStyle.ts      # Event chip colors with readable text
    eventLabel.ts      # Event hover text
    timeFormat.ts      # 12h / 24h formatting
    a11y.ts            # Keyboard activation for clickable areas
    database.types.ts  # Database types
supabase/
  migrations/          # Database schema and functions
```

## Roadmap

- Habit tracking features (the original goal of the app)
