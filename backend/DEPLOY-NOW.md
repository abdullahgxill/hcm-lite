# Combined repository deployment

This repository already contains `backend/` and `frontend/`. Import the same repository twice in Vercel: backend project Root Directory `backend`, frontend project Root Directory `frontend`. Skip GitHub publishing steps below. Use the corresponding folder rather than `./`.

# Deploy in this order

1. Extract the backend ZIP. Open its folder containing package.json in VS Code. Publish this folder to a GitHub repository named hcm-lite-backend. Do not publish .env or node_modules.
2. Repeat with the frontend ZIP as hcm-lite-frontend. The two ZIPs are separate projects; do not place one inside the other.
3. In Atlas use Connect -> Drivers -> Node.js, copy the URI, substitute the database user password, and set the database to hcm_lite. Save it privately. Allow the host network in Atlas.
4. In Vercel import hcm-lite-backend. Root Directory backend, Framework Other, Install npm ci --omit=dev, Build override empty, Output default. Set MONGODB_URI, JWT_SECRET (32+ random characters), CORS_ORIGIN=http://localhost:5173 initially, NODE_ENV=production. Deploy. Open the actual URL/api/health and require database connected.
5. In Vercel import hcm-lite-frontend. Root Directory backend, Framework Vite, Install npm ci --include=dev, Build npm run build, Output dist. Set VITE_API_URL to the actual backend HTTPS URL followed by /api. Deploy.
6. Change backend CORS_ORIGIN to the actual frontend HTTPS origin without a trailing slash. Redeploy backend.
7. Open the frontend URL in a fresh browser session. Create company + Admin, create HR, sign in as HR with the exact temporary password, change it, register an employee, sign in as employee, record attendance and apply leave, approve as HR, draft payroll, finalize as Admin, download the payslip. See docs/DEMO.md.
8. Configure a hosted AI provider on backend using AI_API_KEY, AI_BASE_URL and AI_MODEL, then redeploy and test live tool calling. Without this, the app reports AI unavailable and must not be presented as live AI.
9. Submit the actual verified frontend URL, backend URL and both GitHub repository URLs. A sample URL in a guide is not a deployed app.

Generate a private JWT secret on your own computer:

    node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"

The database URI and keys belong only in backend Vercel environment settings. Never paste them into chat or commit them.
