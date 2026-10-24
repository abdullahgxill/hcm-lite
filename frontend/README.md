# HCM Lite frontend

Independent React + Vite frontend; deploy after the backend.

## Local Windows setup

1. Open this folder in VS Code.
2. Run npm.cmd ci
3. Copy .env.example to .env. Set VITE_API_URL=http://127.0.0.1:3001/api
4. Keep the backend terminal running. Run npm.cmd run dev in this folder.
5. Open http://127.0.0.1:5173

Use the persistent Atlas database backend, not an ephemeral test database. First launch creates the company and Admin. Admin creates HR under Access management. HR registers employees under People. Everyone uses the same sign-in page with their OWN account. There is no public employee signup.

## Vercel

Import ONLY this repository. Root Directory frontend, Framework Vite, Install npm ci --include=dev, Build npm run build, Output dist. Set VITE_API_URL=YOUR_ACTUAL_BACKEND_HTTPS_URL/api before building. Never put MongoDB credentials or AI keys in the frontend.

Set backend CORS_ORIGIN to this frontend's actual HTTPS origin, without a trailing slash, and redeploy backend. Changing VITE_API_URL requires rebuilding the frontend.

## Login and reset

Admin: Access management -> Create HR login. Optionally choose a strong temporary password; otherwise one is generated. Copy email and password using the buttons. HR signs in and must set a new password. Reset password invalidates the old password and existing sessions. Passwords are case-sensitive. Work emails are trimmed and matched without case.

## Checks

npm.cmd test
npm.cmd run build

These check focus behavior, password visibility/copy controls, password error session behavior and production build. Full real-form/database integration tests are maintained in the original monorepo.
