# Yoti → Veriff Migration: Age Verification & Funded Membership

Age verification flow for 16–25 year-olds applying to The Mill's funded membership (People's Postcode Lottery). Replaces the Yoti integration with Veriff + Ghost magic-link. No Make.com; backend owns the full workflow.

## Credentials

### Veriff (identity verification)
- **API key:** `0514003a-f748-42cc-baaf-7d93dd68a996`
- **Shared secret:** `1991ff06-89c7-40be-9d66-ed664732abd9`
- **Base URL:** `https://stationapi.veriff.com`
- **Webhook decisions URL (configure in Customer Portal):** `https://<deployment-url>/api/webhooks/veriff`

### Ghost CMS
- **Admin URL:** `https://the-mill.ghost.io`
- **Admin API key:** `67484ec52ee2340001265c86:8c2dc840517fead69aba34ce2fac0ba11442927944ddc0d1e76df68144dd0b67`

### KV Store (Upstash)
- **KV_REST_URL:** (set in deployment / `.env.local`)
- **KV_REST_TOKEN:** (set in deployment / `.env.local`)

### Deployment
- **Base URL:** (set after Vercel deploy)
- **APP_BASE_URL:** must match deployment root (used in Veriff session return URL)

## Local Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Visit `http://localhost:8787/landing.html` to test the applicant flow.

## Environment Variables

| Variable | Purpose |
|---|---|
| `VERIFF_API_KEY` | Veriff API key |
| `VERIFF_SHARED_SECRET` | Veriff webhook HMAC secret |
| `VERIFF_BASE_URL` | Veriff station API base |
| `GHOST_ADMIN_URL` | Ghost CMS URL |
| `GHOST_ADMIN_API_KEY` | Ghost Admin API key |
| `KV_REST_URL` | Upstash KV REST endpoint |
| `KV_REST_TOKEN` | Upstash KV REST token |
| `APP_BASE_URL` | Deployment root (used in session return URLs) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (lock to real domain in prod) |

## Key Files

- `api/applications.js` — `POST /api/applications` creates Veriff session
- `api/applications/[id].js` — `GET /api/applications/:id` polls status
- `api/webhooks/veriff.js` — `POST /api/webhooks/veriff` Veriff decision handler
- `api/_lib/veriff.js` — Veriff session create / HMAC validate / parse
- `api/_lib/store.js` — application state machine, KV store, locks, audit, idempotency
- `api/_lib/eligibility.js` — 16–25 age gate (DOB preferred, `estimatedAge` fallback)
- `public/landing.html` — applicant form + Veriff InContext frame + polling
- `public/result.html` — post-verification status page
- `scripts/veriff-webhook-test.mjs` — signed fake webhook test matrix

## Webhook Security

Webhook body is validated with `X-HMAC-SIGNATURE` (lowercase hex SHA-256 of raw body). Bad signature returns `401`. Idempotency is enforced by `veriffSessionId`.

## Member Labels Created on Success

- `Postcode Lottery Programme`
- `Verified 16-25`
- `Funded Membership`

## Notes

- Yoti code fully removed (`api/start.js`, `api/yoti-callback.js`, etc.)
- Old Yoti plan superseded: `.kilo/plans/1788082005811-yoti-funded-youth-membership-plan.md`
- `privateKey.pem` (Yoti-era) is git-ignored; no longer used
