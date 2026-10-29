# Iron Log

Workout logger with profiles, live session logging, routines, records, calendar, history, and body tracking.

## Layout

- `public/`: the frontend. Plain ES modules, no build step.
  - `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `icon.svg`
  - `js/main.js`: entry point and router
  - `js/store.js`: shared state. `js/api.js`: API client. `js/domain.js`: units, dates, records.
  - `js/views/*.js`: one module per screen
- `api/[...path].js`: the single Vercel function. It routes every `/api/*` request.
- `lib/routes.js`: endpoints. `lib/db.js`: schema, migrations, validation, PIN hashing. `lib/api.js`: profile sign-in check.

## Deploy on Vercel (Hobby, free)

1. Push the contents of this folder to the root of a GitHub repo. `public/`, `api/`, `lib/`, `package.json`, and `vercel.json` must all be at the repo root.
2. Vercel → Add New → Project → import the repo.
   - Framework Preset: **Other**
   - Root Directory: leave as the repo root
   - Build Command: leave empty
   - Output Directory: `public` (this is also set in `vercel.json`)
3. Connect the database (see below), then deploy.

## Integrations to switch on in Vercel

- **Neon (Postgres)**: Project → Storage → Create / Connect Database → Neon. Pick the free plan. This sets `DATABASE_URL` for the project. Without it, sign-in fails with "Server error" and `/api/ping` shows `databaseUrlSet: false`.
- No other integrations are needed. Blob, KV, and Edge Config are not used.

Optional environment variables (Settings → Environment Variables):

- `PROFILE_CODE`: required to create profiles. Set it if the URL is public.
- `MAX_PROFILES`: profile limit, default 5.
- `APP_PIN`: only for upgrading a version-2 single-user database.

## Checks after deploying

1. `/api/ping` shows `"databaseUrlSet": true`.
2. The front page shows the profile screen. Create a profile, log a workout, reload, and check it's still there.

## Free-tier limits

- One serverless function, well under the Hobby function cap.
- Each request is one database connection and a few small queries.
- Saves are batched (1.5 s after typing stops, and on page hide).
- Sign-in loads the latest 150 sessions. Lifetime totals come from SQL aggregates.
- Limits (`lib/db.js`): 5 profiles, 100 routines, 200 custom exercises, 40 exercises and 30 sets per session, 5 wrong PINs per profile per 15 minutes.
- Neon Free: about 0.5 GB storage per project.

## Schema

Version 4. Upgrading from an older version migrates the tables in place. Bodyweight is stored to two decimals so pounds entries round-trip exactly.
