# Release verification

19 backend tests passed; 5 monorepo UI tests passed, including actual React HR creation, reset, fresh-session sign-in and mandatory password change against Express + a real disposable MongoDB replica set. The frontend standalone package also passed 4 UI regression tests and its production build.

Both independent packages were installed using their own package-lock.json and npm ci in separate directories. Backend tests passed from its independent directory. The serverless api/index.js import was verified.

Verified fixes: modal typing focus, password-change session retention, copyable exact credentials, visible password toggle, trimmed/case-normalized account emails, Admin-chosen or generated temporary passwords, repeated HR reset and password invalidation. Password hashing enforces bcrypt's 72 UTF-8 byte boundary.

Not verified: the user's existing Windows database/session, actual Atlas connection, hosted AI provider, live Vercel URLs, and desktop/mobile browser visual rendering. Tests do not establish that every possible defect is absent. No deployment is claimed complete.

No production database data, real .env, node_modules or build artifacts are included. Existing local database data is not automatically migrated to Atlas. First launch against a fresh Atlas database asks for company setup.
