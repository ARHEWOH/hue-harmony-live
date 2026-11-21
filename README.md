# Hue & Harmony LIVE — Render edition

**Valentis × Altus • Hue & Harmony: All Shades of Us**

One screen, one activity. Attendees **refresh** to see the current event update. One organizer signs in from a **separate Render-hosted admin page** to publish the activity. No payments, voting, chat, tracking, large images, or frontend frameworks.

## Architecture

- **Audience:** `index.html`, `styles.css`, `app.js`, `config.js` — tiny read-only static files. Host them on **GitHub Pages** (recommended), or use the Render web service's home page.
- **Organizer:** `/admin` on the Render web service (email/password; session cookie signed by the server).
- **API:** `GET /api/live` is public/read-only. `POST /api/live` requires the organizer's signed-in session; CSRF origin protection is enabled.
- **Database:** a single PostgreSQL row on **Render Postgres**, not on Render's ephemeral local filesystem.
- **Updates:** browser manual refresh only — no polling, WebSockets, realtime SDKs, fonts, images, or build step on the audience side.

## Before deploying: important free-plan limitations

Render free **Postgres expires after 30 days**. Create it **no earlier than 30 days before the party**, preferably within 1–2 weeks. If you need access longer, move to a supported paid Postgres plan before expiration. Free Postgres has no managed backups; the initial page and activity presets remain in the code.

Free Render **web services sleep after 15 minutes of inactivity** and can take about a minute to wake. The static GitHub Pages frontend still loads quickly; visitors see their last saved activity while the API wakes. For the actual event, warm the API before the party and keep a manual backup if cellular internet is unreliable. Render also imposes shared free instance-hour and bandwidth limits in your workspace; check the Render dashboard.

## Quick deployment (GitHub Pages + Render)

### 1. Create a *new* GitHub repository

In the connected GitHub account, create a **new public repository** named `hue-harmony-live`. Do not modify `class-book-app`.

Upload the **contents of this ZIP** to the new repository root, including `server.js` and `render.yaml`. Do not upload the ZIP itself as the website.

### 2. Create the Render backend and database

Near the date of the party, open <https://dashboard.render.com/> → **New → Blueprint**, connect the new GitHub repo, choose `render.yaml` and review the plan. It defines:

- `hue-harmony-live` — free Node.js web service in Frankfurt
- `hue-harmony-db` — free Render PostgreSQL in Frankfurt

During setup, provide these **Render secret environment values** when prompted:

- `ADMIN_EMAIL`: your organizer login email
- `ADMIN_PASSWORD`: a unique, strong password (at least **12 characters**, ideally 20+)
- `SESSION_SECRET`: generated automatically by Render; do not edit it or expose it
- `DATABASE_URL`: injected automatically from the database by the Blueprint

**Never put any password, database connection string or session secret in GitHub or `config.js`.** Do not send these credentials in chat either.

Open the Render URL shown in your service dashboard, for example `https://hue-harmony-live-xxxx.onrender.com`. The home page is the audience screen, and `/admin` is the organizer dashboard. The backend creates its table and welcome activity automatically on first start.

### 3. Enable GitHub Pages for the fast public website

In GitHub repo → Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save.

Once you have the *actual* Render URL, edit the public `config.js`:

```js
window.HUE_CONFIG = Object.freeze({
  apiUrl: 'https://YOUR-REAL-RENDER-SERVICE.onrender.com'
});
```

Use the **GitHub Pages URL** for the public QR code. Use the **Render URL + `/admin`** only for the organizer. The admin credentials are not shared publicly. **Do not open admin.html from GitHub Pages**: it needs to run on Render for secure same-origin authentication.

For the simplest setup, you may skip GitHub Pages entirely and share the Render home-page URL, but the first visit can be slower while the free web service wakes.

### 4. Run the party

1. Organizer opens the Render `/admin` URL and logs in.
2. Choose a preloaded game or type a new activity. Verify the preview.
3. Press **Publish**.
4. Attendees refresh their public page to see that one activity.
5. Announcements, breaks, winners, and closing screens are available as presets.

## Test checklist

- Open the public GitHub Pages URL with no login.
- Open Render `/admin` and check a wrong password fails.
- Sign in as the organizer, choose **Finish the Lyrics**, publish, then refresh the public page on another phone.
- Try `POST /api/live` without signing in (it must not publish).
- Disconnect cellular data and reload the same public page: last saved activity should appear with an *offline/stale* warning.
- Check the database expiration date and the workspace's free usage before event day.
- Have the MC's printed programme as a backup.

## Files

- `index.html`, `styles.css`, `app.js`, `config.js` — audience
- `admin.html`, `admin.js` — organizer panel
- `server.js` — Node API + secure session authentication + database seed
- `package.json` — only server-side dependency is `pg` (PostgreSQL client)
- `render.yaml` — free Render Blueprint for the web service + Postgres
- `.gitignore` — excludes secrets, dependencies

## Notes

- The API responds with `Access-Control-Allow-Origin: *` on the **GET-only** public activity endpoint. This is intentional; the event activity is public. Writes require a verified admin cookie and same-origin POST request.
- Keep the admin on the same Render hostname as the backend. Signed HTTP-only cookies mean passwords and auth tokens are never exposed to GitHub Pages JavaScript.
- Session expires after 12 hours; log in again if necessary. If the session secret changes, prior sessions are invalidated.
- The app doesn't implement audience interactions; it is strictly a live display.
