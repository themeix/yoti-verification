# Yoti → Veriff Migration: Age Verification & Funded Membership

Age verification flow for 16–25 year-olds applying to The Mill's funded membership (People's Postcode Lottery). Replaces the Yoti integration with Veriff + Ghost magic-link. No Make.com; backend owns the full workflow.

## Credentials

### Veriff (identity verification)
- **API key:** `0514003a-f748-42cc-baaf-7d93dd68a996`
- **Shared secret:** `1991ff06-89c7-40be-9d66-ed664732abd9`
- **Base URL:** `https://stationapi.veriff.com`

### Ghost CMS
- **Admin URL:** `https://the-mill.ghost.io`
- **Admin API key:** `67484ec52ee2340001265c86:8c2dc840517fead69aba34ce2fac0ba11442927944ddc0d1e76df68144dd0b67`

### KV Store (Upstash)
- **KV_REST_URL:** (set in Vercel / `.env.local`)
- **KV_REST_TOKEN:** (set in Vercel / `.env.local`)

### Deployment
- **Base URL:** `https://yoti-verification.vercel.app`
- **APP_BASE_URL:** `https://yoti-verification.vercel.app` (used in Veriff session return URLs)

## Veriff Customer Portal Setup

1. Log in to [Veriff Customer Portal](https://stationapi.veriff.com) → **Settings** → **Webhooks**
2. Set **Webhook events URL** to:
   ```
   https://yoti-verification.vercel.app/api/webhooks/veriff
   ```
3. Set **Callback URL** (fallback) to:
   ```
   https://yoti-verification.vercel.app/result.html
   ```
   (Note: the backend overrides this per-session with the applicant's application ID, so the fallback is only used if something goes wrong.)

## Vercel Deployment

1. Push this repo to GitHub and import into Vercel (or deploy via Vercel CLI).
2. In Vercel project settings → **Environment Variables**, set:

   | Variable | Value |
   |---|---|
   | `VERIFF_API_URL` | `https://stationapi.veriff.com` |
   | `VERIFF_API_KEY` | `0514003a-f748-42cc-baaf-7d93dd68a996` |
   | `VERIFF_SHARED_SECRET` | `1991ff06-89c7-40be-9d66-ed664732abd9` |
   | `GHOST_URL` | `https://the-mill.ghost.io` |
   | `GHOST_ADMIN_API_KEY` | `67484ec52ee2340001265c86:...` |
   | `KV_REST_URL` | (Upstash REST endpoint) |
   | `KV_REST_TOKEN` | (Upstash REST token) |
   | `APP_BASE_URL` | `https://yoti-verification.vercel.app` |
   | `ALLOWED_ORIGINS` | `https://yoti-verification.vercel.app` |

3. Deploy. Visit `https://yoti-verification.vercel.app/landing.html` to test.

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
| `VERIFF_API_URL` | Veriff Station API base |
| `VERIFF_API_KEY` | Veriff API key |
| `VERIFF_SHARED_SECRET` | Veriff webhook HMAC secret |
| `GHOST_URL` | Ghost CMS URL |
| `GHOST_ADMIN_API_KEY` | Ghost Admin API key |
| `GHOST_NEWSLETTER_ID` | Ghost newsletter ID (optional) |
| `KV_REST_URL` | Upstash KV REST endpoint |
| `KV_REST_TOKEN` | Upstash KV REST token |
| `APP_BASE_URL` | Deployment root (used in Veriff session return URLs) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (lock to real domain in prod) |
| `SEND_MAGIC_LINK` | `true`/`false` — send Ghost magic-link email on membership creation |
| `EMAIL_FROM` | Magic-link sender email |
| `EMAIL_PROVIDER_API_KEY` | Reserved for future email provider integration |
| `AGE_MIN` | Minimum age (default 16) |
| `AGE_MAX` | Maximum age (default 25) |
| `MEMBERSHIP_MONTHS` | Comped membership duration in months (default 12) |
| `PROGRAMME_LABEL` | Ghost label for programme (default "Postcode Lottery Programme") |
| `VERIFIED_LABEL` | Ghost label for age verification (default "Verified 16-25") |
| `FUNDED_LABEL` | Ghost label for funded status (default "Funded Membership") |

## Key Files

- `api/applications.js` — `POST /api/applications` creates Veriff session
- `api/applications/[id].js` — `GET /api/applications/:id` polls status
- `api/webhooks/veriff.js` — `POST /api/webhooks/veriff` Veriff decision handler
- `api/health.js` — config sanity check
- `api/_lib/veriff.js` — Veriff session create / HMAC validate / parse
- `api/_lib/store.js` — application state machine, KV store, locks, audit, idempotency
- `api/_lib/eligibility.js` — 16–25 age gate (DOB preferred, `estimatedAge` fallback)
- `api/_lib/handlers.js` — request handlers for create/status/webhook/health
- `api/_lib/{env,ghost,util,kv}.js` — shared services
- `public/landing.html` — applicant form + Veriff InContext frame + polling
- `public/result.html` — post-verification status page
- `scripts/veriff-webhook-test.mjs` — signed fake webhook test matrix
- `scripts/ghost-test-members.mjs` — list/delete webhook-test members from live Ghost

## Webhook Security

Webhook body is validated with `X-HMAC-SIGNATURE` (lowercase hex SHA-256 of raw body). Bad signature returns `401`. Idempotency is enforced by `veriffSessionId`.

## Member Labels Created on Success

- `Postcode Lottery Programme`
- `Verified 16-25`
- `Funded Membership`

Comped membership expiry is recorded in the member's Ghost `note` field (e.g. "Funded membership comped until 2027-09-05") and in the local application audit log.

## Notes

- Yoti code fully removed (`api/start.js`, `api/yoti-callback.js`, etc.)
- Old Yoti plan superseded: `.kilo/plans/1788082005811-yoti-funded-youth-membership-plan.md`
- `privateKey.pem` (Yoti-era) is git-ignored; no longer used
