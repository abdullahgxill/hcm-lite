# HCM Lite

Human Capital Management application with separate React frontend and Express serverless backend.

- `backend/`: MongoDB Atlas, authentication, role permissions, employees, attendance, leave, payroll, PDF payslips and scoped AI tools.
- `frontend/`: React + Vite dashboard and role-specific workflows.

Deploy as TWO Vercel projects from this repository: backend Root Directory `backend`; frontend Root Directory `frontend`. Each folder has an independent lockfile and environment example. See each folder's README and DEPLOY-NOW.md; when using this combined repository, choose the corresponding folder as Root Directory instead of `./`.

Verified locally: 19 backend tests, 5 integrated UI tests, standalone frontend tests and production build. Atlas credentials, live AI and live Vercel deployment require configuration and verification. Do not commit real `.env` files or secrets.
