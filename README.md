# Age Verification & Funded Membership Programme

People's Postcode Lottery funds a free one-year Ghost membership for people verified as aged 16–25.

```
Applicant → landing page (name/email/consent)
         → POST /api/start            create Yoti session (RSA-signed), store pending mapping
         → Yoti hosted ID scan
         → Yoti notification → POST /api/yoti-callback
              GET /sessions/{id}      retrieve full result (source of truth)
              age gate 16–25
              Ghost Admin API         create-or-update member, comped + 12-month expiry, labels
              POST → Make.com         welcome email + Google Sheets audit row
```

Zero runtime dependencies (Node 20 built-ins only).

## Files

| Path | Purpose |
|---|---|
| `api/start.js` | Landing-page form target; creates the Yoti session |
| `api/yoti-callback.js` | Yoti completion notification; age gate; Ghost write; Make notify |
| `api/health.js` | Config sanity check |
| `api/_lib/` | env/util/kv/yoti/ghost/evaluator/handlers |
| `public/landing.html` | Landing page (standalone or embedded in Ghost) |
| `public/result.html` | "Check your email" return page |
| `scripts/dev-server.mjs` | Local server for the whole flow |
| `scripts/sandbox-test.mjs` | Sandbox session matrix (ages 15/16/21/25/26 + rejected doc) |
| `scripts/ghost-tiers.mjs` | Enumerate Ghost tiers |

## Configuration

Copy `.env.example` to `.env.local` (dev) or set the same vars in Vercel. Required:

- `YOTI_SDK_ID`, `YOTI_PRIVATE_KEY` (full PEM; `\n` escapes are normalised; in dev `privateKey.pem` in the repo root is used as fallback)
- `GHOST_URL`, `GHOST_ADMIN_KEY` (`id:secret` from Ghost Admin → Integrations)

Important:

- `YOTI_BASE_URL` — `https://api.yoti.com/sandbox/idverify/v1` for testing, `https://api.yoti.com/idverify/v1` for production
- `KV_REST_URL` / `KV_REST_TOKEN` — Upstash/Vercel KV REST credentials. Without them an in-memory store is used (fine for a single dev process, not for production)
- `PUBLIC_BASE_URL` — canonical origin of the deployment (used for the Yoti notification URL when headers are unreliable)
- `MAKE_WEBHOOK_URL` — Make.com custom webhook that receives the outcome payload
- `GHOST_NEWSLETTER_ID` — newsletter to subscribe new members to (run `npm run tiers`-style listing or Ghost Admin → newsletters; without it, members are created without a newsletter override)
- `GHOST_COMPED_EXPIRY_FIELD` — defaults to `comped_expiry`; if Ghost ignores it (member comps but shows no expiry), check the Admin API schema and set the correct field name here
- `ALLOWED_ORIGINS` — comma-separated origins allowed to call `/api/start` from a browser; `*` by default, lock to your Ghost origin in production
- Programme knobs: `AGE_MIN`/`AGE_MAX` (16/25), `MEMBERSHIP_MONTHS` (12), `PROGRAMME_LABEL`, `VERIFIED_LABEL`

`GET /api/health` shows what is configured and which KV mode is active.

## Local testing

1. `cp .env.example .env.local` and fill in real values (`privateKey.pem` is picked up automatically).
2. `npm run dev` → http://localhost:8080 (landing page, `/health`, and both API routes).
3. `npm run tiers` → verify Ghost Admin access and list tiers.

## Sandbox testing (Yoti)

The Yoti sandbox app (SDK ID `cac9a9a1-…`) accepts the same signed calls and lets you pre-seed each session's document data and check outcome:

```
npm run sandbox
node scripts/sandbox-test.mjs --callback=https://your-deploy.vercel.app/api/yoti-callback
```

The script creates six sessions — ages 15, 16, 21, 25, 26 and an age-21 with a rejected document — and prints for each: session id, redirect URL and the exact JSON to POST to `/api/yoti-callback`.

Then, per session: open the redirect URL and complete the hosted flow (the sandbox still requires driving the client-side steps), or POST the printed `{"session_id":...}` body to the callback to exercise the backend path directly.

Expected results: 16/21/25 → `{"result":"pass"}` and a comped Ghost member with labels `Postcode Lottery` + `Verified 16-25` and a 12-month expiry; 15 → `under_age`; 26 → `over_age`; bad document → `document_not_authentic`. Re-posting the same session id → `{"ignored":true,...}` (idempotent).

**Schema drift:** the sandbox docs are a JS-rendered SPA; payloads here were written from the documented API shape. If `createSession` or `response-config` returns 4xx, compare the printed error body against https://developers.yoti.com/identity-verification and adjust `sessionSpecification()` in `api/_lib/yoti.js` (session/notifications/check fields) or the config in `scripts/sandbox-test.mjs`. The DOB reader (`findDateOfBirth`) already tolerates several field spellings; the redirect URL template is configurable via `YOTI_REDIRECT_TEMPLATE` (`{sdkId}`/`{token}` placeholders).

## Deploying to Vercel

1. Push this folder to a git repo and import it in Vercel (framework preset: Other; functions are picked up from `api/`).
2. Set all env vars from `.env.example` (production values: `YOTI_BASE_URL=https://api.yoti.com` once you have a production Yoti app).
3. Provision Vercel KV / Upstash and set `KV_REST_URL`/`KV_REST_TOKEN`.
4. Check `https://<deploy>.vercel.app/api/health`.

## Ghost landing page

Create a page (e.g. `/funded-youth-membership/`) with an HTML block containing:

```html
<script>window.FUNDED_API_BASE = "https://<deploy>.vercel.app";</script>
<iframe src="https://<deploy>.vercel.app/landing.html" style="width:100%;border:0;min-height:900px" title="Funded membership application"></iframe>
```

or embed the form markup from `public/landing.html` directly, keeping the `FUNDED_API_BASE` script line. Set `ALLOWED_ORIGINS` to your Ghost origin. Point the Yoti session's return experience at `https://<deploy>.vercel.app/result.html` (or a Ghost page with the same copy).

## Make.com scenario

1. New scenario → trigger **Custom webhook** → copy its URL into `MAKE_WEBHOOK_URL`.
2. The webhook receives:

```json
{
  "event": "age_verification_outcome",
  "timestamp": "…", "sessionId": "…", "email": "…", "name": "…",
  "result": "pass | fail | error",
  "reason": "eligible | under_age | over_age | document_not_authentic | …",
  "age": 21, "ghostMemberId": "…", "created": true,
  "compedExpiry": "2027-08-30T…", "magicLinkSent": true
}
```

3. Add a **Router**:
   - Route `result = pass` → email module (welcome email: programme info, People's Postcode Lottery credit, sign-in link `https://<ghost>/#/portal/`, expiry date) → Google Sheets *Add a row*.
   - Route `result = fail` → optional polite not-eligible email.
   - Route `result = error` → notify an internal address.
4. Audit sheet columns: `timestamp, sessionId, email, name, result, reason, age, ghostMemberId, compedExpiry`. This sheet plus Ghost's `label:Postcode Lottery` filter is the standing monthly PPL report. No secrets are stored in Make.

## Production cutover

1. Sign the Yoti commercial agreement; create a production Yoti app (new SDK ID + key pair).
2. Swap `YOTI_SDK_ID`/`YOTI_PRIVATE_KEY`, set `YOTI_BASE_URL=https://api.yoti.com/idverify/v1`, set `PUBLIC_BASE_URL`, lock `ALLOWED_ORIGINS`. Also complete organisation verification in hub.yoti.com — Yoti blocks the age verification service (including sandbox sessions for the app) until the organisation is verified.
3. Re-run `npm run sandbox` only against the sandbox app; run one live verification end-to-end on production.
4. Ask Yoti about identity-reuse/biometric de-duplication options to stop the same ID claiming via multiple emails.

## Security & data protection notes

- Keys live only in env vars (Vercel/`.env.local`); `privateKey.pem` and `.env*` are git-ignored — rotate any key that was ever committed.
- We store: name, email, pass/fail + reason, and (in Make logs) the derived age — never the ID document or the date of birth itself.
- 16–17 year-olds: consent is collected on the form; keep the DPIA and privacy notice current; Ghost data can be erased on request via Admin API.
- `/api/start` is rate-limited (3 sessions/email/day, 20/IP/day) and blocks emails that already have an active paid or already-funded membership.
