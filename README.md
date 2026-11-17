# Habit Calendar

A calendar app to help with habit tracking. Built with React, TypeScript, Vite and Supabase.

> Work in progress. Calendar views, events and user profiles are working; habit-tracking features are still to come.

## Features

- **Passwordless sign-in**: enter your email and get a magic link (Supabase Auth).
- **Month, Week and Day views**: switch between them from the app bar.
- **Events**: add, edit and delete events from any view. Events can be all-day, have notes and a color, and multi-day events show up across every day they overlap.
- **Profile page**:
  - Display name
  - Time zone
  - Choose which day the week starts on (affects Month and Week views)
  - 12-hour or 24-hour time format
  - Sign out
  - Delete account (permanently removes your profile and all your events)

## Tech stack

- [React 19](https://react.dev) + TypeScript
- [Vite](https://vite.dev)
- [Supabase](https://supabase.com) (auth + Postgres database)
- [date-fns](https://date-fns.org) + `@date-fns/tz` for date handling in the profile's time zone
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

3. Your Supabase database needs these pieces (types are in [src/lib/database.types.ts](src/lib/database.types.ts)):
   - `events` table: `id`, `user_id`, `title`, `notes`, `starts_at`, `ends_at`, `all_day`, `color`, `created_at`
   - `profiles` table: `id`, `display_name`, `timezone`, `week_start_on`, `time_format`, `created_at`, `updated_at`
   - A `delete_own_account` RPC function used by the Delete account button

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
  App.tsx              # Auth gate, view switcher, profile loading
  components/
    SignIn.tsx         # Magic-link sign-in form
    MonthView.tsx      # Month calendar
    WeekView.tsx       # Week calendar
    DayView.tsx        # Day calendar
    EventForm.tsx      # Add / edit / delete events
    Profile.tsx        # Profile + account settings
  hooks/
    useSession.ts      # Supabase auth session hook
  lib/
    api.ts             # Events and profile queries
    supabase.ts        # Supabase client
    tz.ts              # Time zone helpers (profile zone <-> UTC)
    dayLayout.ts       # Event placement in Week/Day columns, overlap layout
    eventStyle.ts      # Event chip colors with readable text
    timeFormat.ts      # 12h / 24h formatting
    database.types.ts  # Generated database types
```

## Roadmap

- Habit tracking features (the original goal of the app)
