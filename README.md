# LBC Rides

A mobile-first web app that helps SDSU students get rides to **Church**, **CL**, and **Events**, and gives drivers an organized list of who they're picking up, where, and when.

- **Riders:** pick a ride, choose a pickup spot (Zura Loop, Eureka Loop, …), and pick a driver or "Any driver." No account needed. "Remember me" saves their details on their own phone, so next time signing up takes one tap.
- **Drivers:** sign in with an email link, register a car, offer seats, and paste a **Messenger group chat join link**. Riders in their car get a "Join group chat" button, which **disappears automatically once the event ends**.
- **Admins:** one shared username and password. Admins add events (what it is, start → end time, where) and manage the pickup-spot list.

Works on phones, tablets, and desktops (responsive layout, 48px touch targets, iPhone notch safe areas, dark mode, reduced-motion support, and keyboard and screen-reader friendly).

## Tech stack

| Layer | Tool |
|---|---|
| Front end | React 19 + TypeScript + Vite |
| Styling | Hand-written, mobile-first CSS with design tokens (`src/styles.css`) |
| Backend | Supabase: Postgres, Auth, Row-Level Security, SQL functions |
| Validation | Zod (`src/lib/validation.ts`) |
| Tests | Vitest (`npm test`) |
| CI | GitHub Actions: type-check, test, and build on every push |

## Run it on your computer

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). To see the phone layout, open it on your phone using the "Network" URL Vite prints (same Wi-Fi), or use your browser's device toolbar.

With no Supabase keys, the site runs in **demo mode**. Data is saved only in your browser and starts with sample rides. The demo admin login is `admin` / `demo1234`, and the "Reset demo" link puts the sample data back.

## Connect the real database (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste all of `supabase/schema.sql` and run it. This creates the tables, the security rules, and the pickup spots.
3. **Make the shared admin login:**
   - Go to Authentication → Users → Add user. Use the email `admin@lbcrides.app`, pick a password, and tick **Auto confirm**.
   - In the SQL Editor, run:
     ```sql
     update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
     where email = 'admin@lbcrides.app';
     ```
   - On the site, sign in with username `admin` and that password.
4. Go to Authentication → URL Configuration and add your site URL (and `http://localhost:5173`) to **Redirect URLs**, so driver email links work.
5. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Project Settings → API.
6. Optional: turn on the **pg_cron** extension and run the commented cleanup block at the bottom of `schema.sql`. It deletes old group chat links every night.

## Deploy (GitHub Pages)

The site is live at **https://joshthinh.github.io/Church-Rides/**.

`.github/workflows/deploy.yml` type-checks, tests, builds, and publishes the site every time you push to `main`. You can watch it run in the repo's **Actions** tab.

One-time setup:
1. GitHub repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Supabase → **Authentication → URL Configuration**: set **Site URL** to `https://joshthinh.github.io/Church-Rides/`, and add that URL plus `http://localhost:5173` under **Redirect URLs**.

Don't use "Deploy from a branch". That publishes the raw source files, which shows a blank white page.

## Admin password

Sign in at **☰ → Admin login**, then use **Change admin password** at the bottom of the admin page.

## How the security works

- Riders never read the database tables directly. They sign up through `request_ride()` and get back a secret **token** that's saved on their phone. "My rides" sends those tokens to `my_rides()`, which returns only their own rides.
- **Rider phone numbers** are readable only by that rider's driver and by admins (Row-Level Security policies).
- **Group chat links** come back only to riders in that car, and only while `now() < event end time`.
- **Admin** is a Supabase user with `app_metadata.role = "admin"`. Only the server can set that, so nobody can make themselves an admin from the browser.

## How "Any driver" matching works

`src/lib/assign.ts`, mirrored in SQL inside `request_ride()`:

1. Only cars with an open seat.
2. Prefer a car already stopping at your pickup spot (fewer stops for the driver).
3. Then the car with the most open seats.
4. Then the car that leaves first.

## Project layout

```
src/
  api/          demo.ts (browser-only backend), supabase.ts (real backend), types.ts (shared interface)
  components/   Header (☰ menu), small UI pieces
  pages/        Home, RideList, RidePage (sign-up), MyRides, Drive, Admin, About
  lib/          assign (matching), validation (Zod), storage (remember me), format (dates)
supabase/
  schema.sql    tables, security rules, functions, starting data
```
