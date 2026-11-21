# TeamForge

TeamForge is an EJS and Express engineering workspace with database-backed authentication, projects, tasks, technical documents, service checks, notifications, and optional GitHub Actions data. It can run locally or as a Vercel Express application.

## Deploy to Vercel

Vercel runs the Express app as a serverless function. The app and static files are included in the deployment; user uploads and local files must not be used for persistent storage. Configure these environment variables in **Project → Settings → Environment Variables**:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Connection URL for a reachable managed MySQL database |
| `SESSION_SECRET` | Yes | Long, random secret used to sign secure session cookies |
| `ADMIN_EMAIL` | Recommended | Email address for the initial administrator account |
| `ADMIN_PASSWORD` | Recommended | Strong password for that initial account; only used when that email is absent |
| `ADMIN_NAME` | No | Initial administrator's display name |
| `CRON_SECRET` | Recommended | Secret used to authenticate scheduled service checks |
| `GITHUB_TOKEN` | No | Server-side GitHub token with repository and Actions read access |
| `GITHUB_OWNER` | No | GitHub username or organization whose repositories are queried |

Use a MySQL host that accepts connections from Vercel Functions. The database must already exist and allow TLS when required by the provider. Do not use a local SQLite database or commit `.env` credentials for production. The schema is synchronized on application initialization; for a production team, replace this with reviewed Sequelize migrations before making incompatible schema changes.

1. Push this repository to GitHub and import it into Vercel.
2. Add the environment variables above for the Production environment (and Preview if desired).
3. Deploy. Vercel uses the root Express entry and serves files in `public/` as static assets.
4. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. New self-registered accounts have developer access. Admins/managers can create projects and services.

`vercel.json` schedules `/api/monitoring/check` daily at 08:00 UTC, which is compatible with Vercel Hobby cron limits. A Vercel Pro project can change the schedule to a more frequent interval. Set `CRON_SECRET` in Vercel; Vercel sends it as a Bearer authorization header for cron requests. Manual checks are also available at that endpoint when no cron secret is configured.

## Run locally

Requires Node.js 20 or newer.

```sh
cp .env.example .env
npm install
npm run dev
```

Without `DATABASE_URL`, local development uses a SQLite file named `.teamforge-dev.sqlite`. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env` for an initial admin. Open `http://localhost:3000`.

## Included routes

- Server-rendered pages: `/dashboard`, `/projects`, `/tasks`, `/documents`, `/pipelines`, `/monitoring`, `/notifications`
- Authentication: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Projects: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`
- Tasks: `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id`
- Documents and revisions: `GET/POST /api/documents`, `GET/PUT /api/documents/:id`, `POST /api/documents/:id/publish`
- GitHub: `GET /api/github/repositories`, `GET /api/pipelines?repository=repo-name`
- Services and metrics: `/api/monitoring/services`, `/api/monitoring/metrics`, `/api/monitoring/check`
- Notifications: `GET /api/notifications`, `PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`

## Vercel runtime notes

- Express runs in a function, so Socket.IO's long-lived connection model is not used here. The UI requests ordinary HTTP endpoints and can be extended with polling or a hosted realtime provider.
- Service health checks run from Vercel Cron. Do not start an in-process interval worker in a serverless function.
- GitHub data is fetched server-side. With no GitHub credentials, the UI identifies the integration as unconfigured and does not present fabricated pipeline data as live results.
- The demo implements the core platform flows, not every item in the original product brief yet. File attachments, OAuth/webhook processing, sprint workflows, full rich-text editing, password recovery, and a full audit/permissions console still need implementation before treating it as a complete production product.
