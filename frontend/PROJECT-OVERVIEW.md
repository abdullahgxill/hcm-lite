# HCM Lite

A role-scoped people operations application built for the **Saylani HCM Lite Challenge, 24 October 2026**. The attached official brief is the specification: 25 functions across nine modules, three dashboards, and AI grounded in application data.

**Delivery status:** application code, production frontend build and local replica-set API tests are available. This is **not a completed production deployment**. Atlas connectivity, real-provider AI, authenticated browser/mobile review and public Vercel URLs still need verification. See [the completion report](docs/COMPLETION_REPORT.md).

## Run locally in under ten minutes

Install **Node.js 22.12+ or 24 LTS** and Git. From this directory:

```sh
npm ci
```

### With MongoDB Atlas (intended application database)

Copy `backend/.env.example` to `backend/.env`, fill `MONGODB_URI`, a random `JWT_SECRET` of at least 32 characters, and the AI provider values. Set `CORS_ORIGIN=http://localhost:5173`. Use your terminal or file manager to make the copy:

```sh
# macOS / Linux / Git Bash
cp backend/.env.example backend/.env
# Windows PowerShell: Copy-Item backend/.env.example backend/.env
npm run dev
```

Open `http://localhost:5173`. The backend listens at `http://localhost:3001/api`. The Vite development proxy forwards `/api` to the backend. Production uses `VITE_API_URL` instead.

### Without Atlas: explicitly disposable local development

```sh
npm run dev:local
```

This opt-in command downloads a MongoDB binary on first use and starts an **empty temporary replica set**, plus the API and frontend. It is not Atlas, contains no business records, is disabled in production and is destroyed when stopped. It never runs automatically on deployment. A new launch is a fresh install. A compatible local environment must permit MongoDB child processes; this worked in the API test runtime but did not work in the separate managed browser-preview runtime.

`backend/.env` can still supply AI configuration for this local mode. Local mode deliberately substitutes the database URI and generates an ephemeral JWT secret. Do not depend on local-mode data for real company use.

### First Admin setup

1. On a fresh database, enter company name, Admin name/email and password.
2. Organization → add departments/designations and review office rules, leave quotas, public holidays and office location.
3. Access management → create an HR login. A random temporary password is shown once.
4. HR signs in and changes that password, then registers employees in People.
5. Employee registration creates a login. Employees change their temporary passwords before using any operational endpoints.

There are no default production credentials or preloaded employees, salaries, attendance, leaves or dashboard statistics. For HR's own attendance/leave, HR can register an employee profile with their existing HR email; the HR role is retained. Admin has no self-service attendance/leave privileges under the brief.

## Technology

- React 19, Vite 6, Tailwind CSS 4, React Router, Axios, Recharts, Lucide.
- Node.js / Express 5, JWT (HS256), bcrypt (cost 12), Zod 4.
- MongoDB Atlas / Mongoose 8; transactions require a replica set.
- OpenAI-compatible hosted chat-completions provider with function calling; keys remain server-side.
- PDFKit streams payslips directly to the HTTP response; no persistent local files.
- Separate Vercel frontend and serverless backend projects. Dependency versions are recorded in `package-lock.json`.

## Architecture

```text
frontend/src/
  components/    Accessible controls, tables, modal, states
  contexts/      Auth/session lifecycle
  hooks/         Remote-resource lifecycle
  layouts/       Scoped navigation and assistant access
  pages/         Dashboard, people, attendance, leave, payroll, settings
  features/      AI assistant
  services/      Axios and file downloads
  styles/        Navy / muted teal / warm-neutral design system
backend/
  api/index.js   Vercel exported function, no app.listen()
  src/
    app.js       Middleware, routers, safe errors
    config/      Reusable database connection and transactions
    models/      Indexed Mongoose collections
    routes/      HTTP orchestration / authorization
    middleware/  JWT, first-login gate, roles, employee scope
    validators/  Zod request contracts
    services/    Rules, leave, payroll, analytics, tools, audit, locking
    utils/       HTTP assertions and errors
    tests/       Rule and real MongoDB replica-set workflow tests
scripts/         Explicit local development and optional test-data utility
docs/            Deployment, demo and completion report
```

Request flow is router → role/scope guard → validated business service → database. Dashboard and AI tool metrics call the same analytics service. Operational transactions take a company ledger write lock so financial changes serialize with payroll finalization. Drafts record their source version; data changes make them stale. Mongoose reuses a single cached connection promise and a bounded pool across warm function invocations.

## Functional checklist and permissions

“Implemented” means the code/UI is present; provider, browser and deployment verification limits are listed separately below.

| # | Function | Admin | HR | Employee | Implementation |
| --- | --- | --- | --- | --- | --- |
| 01 | First-run company/Admin setup | Create | — | — | Implemented; empty DB tested |
| 02 | Login/logout/password and scoped menus | Own | Own | Own | Implemented; forced change, token revocation tested |
| 03 | Office hours/grace/weekend/location/radius | Manage | View | — | Implemented; rules stored and snapshotted |
| 04 | Departments/designations/leave quotas/holidays | Manage | View | — | Implemented |
| 05 | Create HR, deactivate/reset logins | Manage | — | — | Implemented; temporary credentials shown once |
| 06 | Register/edit employee, login creation | View | Manage | Own phone/address | Implemented; backend field restrictions |
| 07 | Search/filter/paging, Employee 360 | All | All | Own | Implemented; profile/attendance/leave/payslip tabs |
| 08 | CSV dry-run/import/export | — | Manage | — | Implemented; row/field/reason report tested |
| 09 | Web check-in/out | — | Own | Own | Implemented; server time, duplicate 409 tested |
| 10 | Calendar and daily attendance board | All | All | Own | Implemented; derived absence and missing checkout |
| 11 | Corrections | View | Approve | Request | Implemented; HR-reviewed times and notifications |
| 12 | Apply/cancel leave, balance/history | — | Own | Own | Implemented; working days and cancellation tested |
| 13 | Leave decisions with comment | View | Approve | — | Implemented; concurrent quota protection tested |
| 14 | Salary structure | View | Manage | — | Implemented; gross/allowances derived from basic |
| 15 | Monthly payroll draft/review | View | Manage | — | Implemented; deterministic formulas tested |
| 16 | Finalize and lock payroll | Manage | — | — | Implemented; revision/source lock tested |
| 17 | Payslip/PDF | All | All | Own | Implemented; PDF response and scope tested |
| 18 | Dashboards/filters/metrics | Company | HR | Personal | Implemented; records/department scope tested |
| 19 | Tool-driven assistant chat | All data | HR data | Own | Implemented; mocked tool-call loop tested; live key needed |
| 20 | Dashboard AI summary | Yes | Yes | — | Implemented; live provider needed |
| 21 | Smart-leave form | — | Own | Own | Implemented; JSON retry/validation/confirmation tested with mocked provider |
| 22 | Policy Q&A | Yes | Yes | Yes | Implemented; current rules in system prompt; live provider needed |
| 23 | Announcements | Post | Post | Read | Implemented |
| 24 | Notifications | Own | Own | Own | Implemented; leave and payslip notifications tested |
| 25 | Append-only application audit | View | — | — | Implemented; no update/delete endpoints, sensitive values redacted |

Optional camera/face/location attendance, face enrollment/liveness, mobile app, attrition risk scoring, PWA and other bonus features are not implemented. Location configuration is stored, but **web check-in does not claim face/geofence enforcement**.

## Business rules

- Default office start 09:00, end 18:00; grace 15 minutes; weekend Saturday/Sunday; half-day under five hours; location radius 150 m. Asia/Karachi is the initial company timezone and can be changed.
- Server timestamps decide attendance. One employee/date record has a unique index. More than 09:15 is late under default rules; exactly five hours is not half-day. Open past records are missing checkout; a day with no attendance or approved leave is absent.
- Annual 14, sick 8, casual 10; unpaid unlimited. Leave uses working days, excludes holidays/weekends, rejects overlaps and insufficient balance with 422. Pending requests reserve date ranges; approved requests consume balance. Approval rechecks balance transactionally. Cancellation returns approved days.
- Attendance and leave records retain rule snapshots. Organization revisions provide the calendar for historical dates; same-day configuration revisions take effect for new records that day.
- Gross = 1.5 × basic; HRA 40% and medical 10%. Per-day gross / working days. Deduct absent + unpaid + 0.5 × half-days. Eligibility is restricted to joining/leaving dates. Paid approved leave is not also absent.
- Illustrative annual tax on gross × 12: up to 600k zero; to 1.2M 5% above 600k; to 2.4M 30k + 15% above 1.2M; to 3.6M 210k + 25% above 2.4M; above 3.6M 510k + 35% above 3.6M. This follows the brief, not a statement of current statutory tax law.
- Money is stored in integer paisa. Components, final deductions and monthly tax round to the nearest paisa. Per-day ratios remain unrounded until the final deduction. Net cannot go below zero. Tax is calculated on contractual annualized gross and prorated for eligible joining/leaving days; the brief does not specify a different tax treatment for deductions.
- A current-month draft considers **all working days of the month**, including future days without records, as the full-month projection. Review before finalizing. Finalized runs, and their attendance/leave source months, are locked.
- To prevent self-approval, HR cannot approve their own requests. Login email is immutable after registration; Admin can deactivate identities. These are additional integrity choices where the brief does not define the behavior.
- Requests spanning calendar years must be split into separate applications so annual balances remain unambiguous.

## Metrics

All figures derive from records; there are no hardcoded dashboard statistics. Aggregations calculate department headcount, salary averages and payroll totals; daily calendar expansion computes expected/absent days from those records.

- Headcount: active/probation at end date, constrained by joining/leaving dates.
- Attrition: exits in range / mean opening and closing headcount × 100. Admin also displays YTD attrition through the selected end date.
- Attendance rate: (present + late + missing checkout + 0.5 × half-day) / (expected working-day records − on-leave records) × 100.
- Late percentage: late / (present + late) × 100. Historical missing-checkout records remain their own status; late flags still contribute to top late-comers.
- Absenteeism: absent / expected working days, including department breakdown.
- Leave use: approved days in range / annual quota for active employees at period end; unlimited unpaid quota has no finite utilization percentage.
- Payroll cost: finalized prorated gross and net in selected months, by department. Average salary: contractual mean gross by department/designation.
- Employee dashboard: own weekly hours toward 40 h, late count, current-year leave balance, today’s attendance and latest finalized payslip.

Rates are zero when their denominator is zero. Working-day attendance trends stop at today; future dates do not inflate attendance absences. Historical status/department changes are not fully versioned (see limitations).

## AI setup and guardrails

Configure `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` **on the backend only**. The API root must support `/chat/completions`, `tools` and `response_format: {type: 'json_object'}`. This may be any compatible hosted provider; compatible provider/model behavior still requires a live smoke test.

Tools: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`.

Tool names and arguments are validated. Employee tools forcibly scope to their linked employee; company headcount and late-comer tools are unavailable to them. No tool takes arbitrary database queries or writes records. Common colleague-salary requests also receive a deterministic access-control refusal even when the AI provider is unavailable; that response is labelled separately from model output.

There is a 15-second provider abort deadline, Mongo-backed 20/user/hour AI limit and `ai_logs` outcome/tool/duration metadata. Smart-leave JSON retries once before asking the user to use the regular form. The model cannot submit leave: the user must review and confirm. Provider failures return visible 503/504 states and never masquerade as live-data answers. Dashboard summaries receive current server KPI JSON. Policy Q&A is restricted by the prompt to documented/current company rules.

Chat currently sends each user question independently, rather than a persistent multi-turn provider conversation. Do not rely on a previous chat question to supply a missing date or department.

## Security

JWT verification checks issuer, audience, HS256, expiry, active account and token version on every authenticated request. Reset/password change/logout invalidate old tokens. Temporary-password users can only read their session, change the password or log out. Backend permissions remain enforced regardless of navigation visibility.

JWTs are held in sessionStorage and cleared at sign-out; HTTPS, CSP via Helmet on the API, constrained CORS, Zod validation, bounded bodies/search/date ranges, bcrypt and scoped PDF/tool queries provide application protections. React renders messages as text. CSV export escapes spreadsheet formula prefixes. Ordinary routes cannot edit/delete audit entries. Credentials are absent from source and examples contain no live secrets.

The login/setup rate limiter is process-local; configure a distributed edge/WAF limiter for production brute-force protection across cold starts. The AI limiter is database-backed. A separate production security assessment, stronger session hardening (e.g. HttpOnly-cookie architecture), recovery/email delivery and operational monitoring are not included.

## Testing and validation

```sh
npm test
npm run test:ui
npm run build
npm audit --omit=dev
```

Tests launch their own disposable MongoDB replica set and never use the application's Atlas database. The first test run can download an ~82 MB MongoDB binary. MongoDB processes must be allowed in the runtime. No production data is seeded.

Tests cover initial setup, bcrypt/JWT flows, mandatory change, roles, self-only employee/attendance/payroll access, employee registration, server timestamps/409, checkout, working days, corrections, leave overlap/balance/cancellation, simultaneous approvals, CSV dry-run/commit, dashboard vs tools, tax slabs, joining/leaving proration, payroll revision/finalization/source locks, real PDF bytes, audit access, provider unavailable fallback, mocked tool calls/JSON retry, AI limits and logout revocation.

Actual results and remaining validation are in [docs/COMPLETION_REPORT.md](docs/COMPLETION_REPORT.md). Provider stubs are explicitly tests, never production fallbacks. Authenticated desktop/375px browser review and the live fresh-install demonstration remain pending due to the separate browser runtime's database limitation.

### Optional development-only fixture utility

After starting an **empty local development API**, opt in manually:

```sh
# macOS / Linux / Git Bash
NODE_ENV=development node scripts/seed-development.mjs --allow-test-data
# Windows PowerShell:
# $env:NODE_ENV='development'
# node scripts/seed-development.mjs --allow-test-data
```

It refuses production, non-loopback URLs and an already-configured company. It creates only explicit synthetic `example.test` identities and prints their generated development credentials. It is never auto-run, never imported into production and is not used by the judge's fresh database flow.

## Deployment and demo

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for Atlas, two Vercel projects, exact environment variables and the public verification checklist. The backend exports Express from `api/index.js` without calling `listen`; `src/server.js` is exclusively local development. There are no scheduled background jobs or local-file assumptions in the production API.

See [DEMO.md](docs/DEMO.md) for the official five-minute sequence, judge questions, architecture pitch and LMS submission instructions.

## GitHub

The local repository is initialized and committed. No remote repository was created or pushed. The download includes a separate `hcm-lite-history.bundle` to restore the committed history with `git clone hcm-lite-history.bundle hcm-lite-restored`. Alternatively, after extracting the source ZIP, run `git init -b main`, `git add .`, and `git commit -m "Build HCM Lite"` inside the source directory. After creating an empty repository in your GitHub account:

```sh
git remote add origin https://github.com/YOUR_USERNAME/hcm-lite.git
git branch -M main
git push -u origin main
```

Use your actual repository URL. Authenticate through GitHub's supported browser or Git credential flow. Never put tokens into the remote URL, README or command history. Share the public repository (or grant judges access) and the verified live frontend URL through your LMS portal.

## UI repair for an existing download

See [docs/UI-FIX.md](docs/UI-FIX.md). Copy `fix-hcm-ui.cjs` beside your existing project package.json and run `node fix-hcm-ui.cjs` while the app terminal stays open. This repairs modal typing/focus and password-change UX without reinstalling packages or restarting the temporary database. The installer also lives at `scripts/fix-hcm-ui.cjs` in this source tree.

## Known limitations / remaining work

- No Atlas credentials or Vercel authorization: production connection, deployments and public URLs are unverified.
- No live hosted LLM key/model: tool orchestration is tested with a provider stub; real model accuracy, latency, summaries and relative-date interpretation are unverified.
- Managed browser preview could load the desktop connection-error screen, but its MongoDB child process failed. Logged-in screens, mobile widths and full browser flow have not been visually verified. No screenshots are claimed as finished application proof.
- Historical department/designation/status/salary changes are not fully event-versioned; existing finalized payroll stores immutable line snapshots. Missing checkout contributes presence for payroll as the brief specifies no missing-checkout deduction.
- Operational lists other than the employee directory/audit are bounded (typically 100/500) and calendar analytics expand records in memory after database queries. Very large organizations need pagination and optimized date materialization.
- Configuration revisions are date-granular. Changing timezone or weekends midway through a day needs administrative care; existing attendance/leave retains snapshots.
- Full-month draft projection, year-split leave, immutable login email, self-approval rejection and tax proration are described above so judges can review these choices.
- No camera/mobile/biometric bonus features, email/password recovery, production monitoring/backup tooling, multi-company tenancy or statutory payroll compliance.
