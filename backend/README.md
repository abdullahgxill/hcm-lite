# HCM Lite backend

Independent Express + MongoDB backend; deploy this repository FIRST.

## Local Windows setup

1. Open this folder in VS Code.
2. Run npm.cmd ci
3. Copy .env.example to .env and set MONGODB_URI, JWT_SECRET (at least 32 random characters), CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173
4. Run npm.cmd run dev
5. Open http://127.0.0.1:3001/api/health; expect status ok and database connected.

Use a MongoDB Atlas replica set; no local MongoDB install is required. No accounts or business data are seeded.

## Vercel

Import ONLY this repository. Root Directory backend, Framework Other, Node 22.x or 24.x, Install npm ci --omit=dev, Build override EMPTY, Output default. api/index.js exports Express for the serverless runtime; never run npm start as a Vercel build command.

Environment: MONGODB_URI, JWT_SECRET, CORS_ORIGIN (the actual frontend HTTPS origin, no trailing slash), NODE_ENV=production. Optional AI: AI_API_KEY, AI_BASE_URL, AI_MODEL. AI requires a real hosted provider with tool calling. Secrets belong only in backend environment settings.

In Atlas permit database access from the host network. A temporary 0.0.0.0/0 access entry may be used for a demo with a strong scoped database user; restrict access afterwards.

After deploy open YOUR_BACKEND_URL/api/health. It must return status ok and database connected. A deployed URL alone does not prove database connectivity.

After frontend deploy update CORS_ORIGIN to its actual origin and redeploy backend.

## Tests

npm.cmd ci
npm.cmd test

Tests use a separate disposable MongoDB replica set and never seed production. MongoDB test binary download may be required.
