# Battle Cars – Railway Deployment Plan

This is a concise step‑by‑step to deploy the current repo to Railway with one server (WebSockets) and optional Stripe.

## 0) Prerequisites
1. GitHub repo is up to date.
2. Node 18+ locally (for testing).
3. Railway account.

## 1) Server sanity check (local)
1. Copy `.env.example` to `.env` (or create) with:
   - NODE_ENV=development
   - PORT=3001
   - PUBLIC_BASE_URL=http://localhost:3000
   - (Optional) STRIPE_SECRET_KEY=sk_test_xxx
   - (Optional) STRIPE_PUBLISHABLE_KEY=pk_test_xxx
2. Start server: `node server/index.js` (or `npm start`).
3. Open client (if separate) and confirm:
   - Able to connect, move car, round starts.
   - Health endpoint: GET http://localhost:3001/api/health.
   - Stripe config: GET http://localhost:3001/api/stripe/config (should show active=false unless keys set).

## 2) Repo housekeeping
1. Ensure `package.json` has:
   - "start": "node server/index.js"
2. (Optional) Add Procfile (if desired):
   - `web: node server/index.js`
3. Commit and push to GitHub.

## 3) Create Railway project
1. Railway → New Project → Deploy from GitHub → select repo.
2. In Service settings:
   - Start Command: `npm start`
   - Port: `3001`
3. Add Variables:
   - NODE_ENV=production
   - PORT=3001
   - PUBLIC_BASE_URL=https://<your-service>.up.railway.app (or custom domain later)
   - (Optional) STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET

## 4) First deploy & smoke test
1. Trigger the deploy; wait until “Running”.
2. Open the Railway URL and verify:
   - Game loads, WebSockets connect (check browser console).
   - Rounds start and car moves.
   - Health endpoint returns 200.
3. If Stripe keys set: GET `/api/stripe/config` shows `active: true`.

## 5) Domain (optional)
1. Add custom domain in Railway → Domains.
2. Point DNS (CNAME) per Railway instructions.
3. Update PUBLIC_BASE_URL to your domain; redeploy.

## 6) Stripe basics (optional for now)
1. Set variables:
   - STRIPE_SECRET_KEY (server)
   - STRIPE_PUBLISHABLE_KEY (client)
   - STRIPE_WEBHOOK_SECRET (for prod webhooks)
2. Expose webhook: `/api/stripe/webhook` (already implemented).
3. Test checkout:
   - Call POST `/api/stripe/create-checkout-session` with `{ priceId }`.
   - Redirect to returned `url`.

## 7) Production tweaks
1. CORS/Helmet: already configured to allow Stripe and secure defaults.
2. Logging: confirm Railway logs show “Battle Cars server running”.
3. Monitoring: watch CPU/RAM and event‑loop lag (Railway metrics).
4. Instance size: start small (512MB–1GB). Increase if CPU>70% sustained.

## 8) Rollback
1. Railway → Deployments → select previous successful build → Rollback.

## 9) Scaling later (if needed)
1. Increase instance size before horizontal scaling.
2. When required, add Redis and Socket.io adapter; keep one region.

## Checklists
- [ ] Local server runs on 3001 without errors
- [ ] Railway service running and reachable
- [ ] WebSockets connect and round starts
- [ ] Anthem music plays after first interaction (browser autoplay rules)
- [ ] Optional Stripe config returns expected values


