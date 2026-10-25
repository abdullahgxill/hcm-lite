# HCM Lite

Human Capital Management application for the Saylani HCM Lite challenge, with a React frontend and a separate Express serverless backend.

## Live deployment

- Frontend: https://hcm-lite-web.vercel.app/
- Backend health: https://hcm-lite-api-mu.vercel.app/api/health
- Source: https://github.com/abdullahgxill/hcm-lite

Live checks on 25 October 2026 confirmed MongoDB connectivity, company/Admin setup, authenticated Admin dashboard, organization settings save, role management and empty-state management pages. Full HR/employee attendance, leave and payroll workflows were verified in automated tests against a disposable MongoDB replica set; they have not all been repeated against production.

**Hosted AI is not configured on the live deployment.** The live assistant correctly reports that the provider is unavailable. Real tool calling and smart-leave live demonstrations require backend AI_API_KEY, AI_BASE_URL and AI_MODEL.

Atlas access currently uses an owner-approved temporary six-hour network rule. Connectivity will stop when that rule expires unless the owner configures continued network access. This is a demo deployment; it is not a claim of fully completed production acceptance.

## Technology and architecture

React, Vite, Tailwind CSS, React Router, Axios, Recharts and Lucide power the frontend. Node.js, Express, Mongoose/MongoDB Atlas, JWT, bcrypt and Zod power the backend. PDFKit generates payslips. An OpenAI-compatible hosted API supports backend-controlled AI tools when configured.

- frontend/: independent React project, lockfile and Vercel configuration.
- backend/: independent Express project, lockfile and Vercel configuration.
- backend/api/index.js exports Express for Vercel; it does not start a permanent server.
- Database connections are reused between serverless invocations.
- Controllers/routes delegate payroll, leave, attendance and AI scope rules to services.

## Implemented modules

Company/organization configuration; Admin, HR and Employee authentication; employee registration and directory; CSV validation-only dry run, import/export; web attendance and corrections; working-day leave management; payroll drafts and Admin finalization; locked payroll and PDF payslips; role dashboards; announcements, notifications and immutable application audit routes; permission-controlled AI tools and smart-leave parsing with graceful provider failure.

Payroll uses integer monetary units and deterministic business rules. Attendance uses server timestamps. Employee-sensitive records and AI tools enforce server-side data scope.

## Role permissions

| Role | Responsibilities |
|---|---|
| Admin | Company settings, HR logins, organization-wide records, payroll finalization and audit |
| HR | Employee registration, attendance/leave reviews, salary management, payroll preparation and announcements |
| Employee | Own profile/self-service, attendance, leave and own payslips |

Employees do not publicly sign up. Admin creates HR logins; employee registration creates the employee login with a temporary password. The user must change that password before protected workflows.

## Local installation

Use Node.js 22.12 or later. Open each directory in its own terminal.

Backend:

    cd backend
    npm ci
    # Copy .env.example to .env and configure Atlas, JWT_SECRET and CORS_ORIGIN.
    npm run dev

Frontend:

    cd frontend
    npm ci
    # Copy .env.example to .env; use VITE_API_URL=http://127.0.0.1:3001/api.
    npm run dev

On Windows PowerShell use npm.cmd if npm.ps1 is blocked. Keep both terminals running. Allow both localhost and 127.0.0.1 origins when using both locally.

No business data is seeded automatically. Against an empty database the owner creates the company and first Admin using the setup screen. Configure departments/designations, create an HR login, then register employees. Existing local disposable database records are not automatically transferred to Atlas.

## Environment configuration

Backend only: MONGODB_URI, JWT_SECRET (at least 32 random characters), CORS_ORIGIN, NODE_ENV. Optional hosted AI: AI_API_KEY, AI_BASE_URL, AI_MODEL. Local backend also uses PORT.

Frontend only: VITE_API_URL, including the backend /api suffix. Never put database credentials, signing secrets or AI keys in frontend variables or Git.

AI requests validate tool names/arguments, roles and record scope. The backend controls data access; the provider cannot query MongoDB directly. AI responses are labelled, logged, limited and timed out. Smart leave requires user confirmation before submission.

## Camera, location and assistant update

Camera attendance now supports a front-camera preview, local single-face detection, fresh GPS, server Haversine geofence checks and result-only storage. No photos, face descriptors or raw GPS fixes are stored. Open `/device-check` to check hardware without logging in or saving attendance. Employees and HR with an employee profile can choose camera attendance; Admin sets the office coordinates/radius.

The assistant exposes clearly labeled verified database reports even without an LLM key. Hosted AI chat, smart leave and summaries still require server-side provider configuration. Real-device camera/GPS confirmation and live hosted-AI verification are pending.

Latest extension checks: **24 backend tests passed; 11 UI tests passed; frontend build passed.** See [camera/location/AI guide](docs/CAMERA_LOCATION_AI.md) for setup, privacy, anti-spoofing limits and verification scope. These are isolated test results, not a claim of a complete production HR/employee demo.

## Tests and actual verification

- 19 backend tests passed against a real disposable MongoDB replica set.
- 6 UI tests passed, including real React forms calling Express and MongoDB through supertest transport.
- 4 standalone frontend regression tests passed.
- Frontend production build passed.
- Independent npm ci installations and production-only backend serverless export passed.
- Real-form tests cover Admin HR creation/reset, HR employee registration, Employee login/password change/check-in/check-out/leave application, HR leave approval/payroll draft, Admin finalization lock, Employee PDF download, cross-employee salary/payslip scope, leave balances and notification delivery.
- Backend tests cover all three roles, registration, attendance, leave overlap/balances/concurrency, payroll formulas/finalization/PDF scope, audit/notifications, dashboard/tool consistency and mocked AI tools/rate limits.
- Live hosted LLM behavior, complete production HR/employee demo and mobile browser visual review remain unverified.

Reproduce:

    cd backend
    npm ci
    npm test

    cd ../frontend
    npm ci
    npm test
    npm run test:workflow
    npm run build

Tests do not write production business data. Backend tests start a disposable test database and may download a MongoDB binary. See package docs for saved test logs and the demonstration sequence. Passing tests are not a guarantee that every defect has been eliminated.

## Vercel deployment

Import this Git repository twice.

| Setting | Backend project | Frontend project |
|---|---|---|
| Root Directory | backend | frontend |
| Framework | Other | Vite |
| Install | npm ci --omit=dev | npm ci --include=dev |
| Build | Empty override | npm run build |
| Output | Default | dist |

Configure backend environment variables, deploy and check /api/health. Configure frontend VITE_API_URL to the actual backend HTTPS URL plus /api and deploy. Set backend CORS_ORIGIN to the actual frontend HTTPS origin without a trailing slash and redeploy backend. Environment changes require a new deployment.

## Five-minute demonstration

See backend/docs/DEMO.md. Use actual records entered through the app: Admin/company settings and HR login; HR employee registration; employee login/password change and attendance; smart leave (only after AI configuration); HR approval; dashboards and authorized AI queries; payroll draft/finalization; employee PDF payslip; audit and access restrictions.

Do not present missing hosted AI as live data or claim production workflows were tested merely because the build deployed.
