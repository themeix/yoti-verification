# Veriff Migration Plan — Funded Membership Programme (16–25)

Replaces Yoti entirely per `veriff-ghost-kilo-implementation-spec.md` (no Make.com, backend owns everything: state machine, HMAC validation, idempotency, audit).

## Confirmed API facts (from devdocs.veriff.com, 2026-09-05)

- **Session create**: `POST {VERIFF_API_URL}/v1/sessions`, headers `X-AUTH-CLIENT: <apiKey>`, `X-HMAC-SIGNATURE: <hex hmac-sha256 of raw body with shared secret>`, `Content-Type: application/json`. Body `{verification: {callback, person: {firstName, lastName}, vendorData, timestamp}}` → `{status: "success", verification: {id, url, sessionToken}}`
- **Decision webhook**: POST to our endpoint, header `X-HMAC-SIGNATURE` = lowercase hex HMAC-SHA256 of the **raw** body signed with the shared secret. Payload `verification.{id, attemptId, vendorData, status: approved|declined|resubmission_requested|review|expired|abandoned, code, reason, person: {firstName, lastName, dateOfBirth: YYYY-MM-DD}}`
- **Decision fetch**: `GET /v1/sessions/{id}/decision` (same auth headers) as fallback when the webhook payload lacks `person.dateOfBirth` (e.g. event webhook)
- Credentials: API key `0514003a-…` (X-AUTH-CLIENT), shared secret `1991ff06-…` (HMAC), base `https://stationapi.veriff.com`
- Browser: Veriff InContext SDK (`cdn.veriff.me`) — `createVeriffFrame({url})` needs only the session URL, never credentials (spec §12.1 forbids client-side session creation)

## Architecture (spec §61, no Make.com)

```
Landing form (name/email/consent)
  → POST /api/applications            rate-limit, dup + Ghost guards, Veriff session (server-side), application record
  → createVeriffFrame(url)            in-context verification, no secrets in browser
  → Veriff decision webhook → POST /api/webhooks/veriff
      HMAC-SHA256 validation (401 on fail)
      idempotency key (attemptId or sessionId+status) — replays return 200 duplicate
      application lock (SETNX) — concurrent webhooks safe
      decision validation (+ decision fetch if DOB absent)
      age gate 16–25 inclusive at decision time (server-side only)
      Ghost: find-or-create member, comped +12-month expiry, labels
             "Postcode Lottery Programme" / "Verified 16-25" / "Funded Membership"
      audit trail per application
  → magic-link sign-in email (Ghost members API)
  → GET /api/applications/:id         safe status for landing/result polling
```

## Store (spec §8–§11) — KV-backed (Upstash REST, memory fallback in dev)

Per spec §38/§58 "adapt to existing codebase": existing zero-dependency KV layer replaces Postgres (it satisfies "not Make.com, not Ghost"); upgrade path to Postgres documented if volume/reporting demands it.

- `app:{applicationId}` → application doc (status machine per spec §9: APPLICATION_CREATED → VERIFICATION_STARTED → … → ELIGIBLE → MEMBERSHIP_PENDING → MEMBERSHIP_CREATED | NOT_ELIGIBLE | MEMBERSHIP_FAILED | PROCESSING_ERROR)
- `session:{veriffSessionId}` → applicationId (webhook correlation; vendorData=applicationId as fallback)
- `email:{email}` → active applicationId (duplicate guard)
- `whevent:veriff:{attemptId|sessionId:status:code}` → idempotency (spec §10 unique index equivalent)
- `lock:{applicationId}` → SETNX concurrency guard (spec §29)
- `audit:{applicationId}` → append-only event list (spec §11)
- `rl:*` → rate limits (3/email/day, 20/IP/day)

## Files

New: `api/applications.js`, `api/applications/[id].js`, `api/webhooks/veriff.js`, `api/_lib/veriff.js`, `api/_lib/store.js`, `api/_lib/eligibility.js`, `scripts/veriff-webhook-test.mjs`, rewritten `public/landing.html` (+status polling), `public/result.html`.
Changed: `_lib/env.js`, `_lib/util.js`, `_lib/kv.js` (+rpush/lrange), `_lib/ghost.js` (+Funded Membership label), `_lib/handlers.js`, `scripts/dev-server.mjs`, `.env*`, `package.json`, `README.md`.
Deleted: `api/start.js`, `api/yoti-callback.js`, `api/_lib/yoti.js`, `api/_lib/evaluator.js`, `scripts/sandbox-test.mjs`.

## Failure handling (spec §27–§28)

- Bad signature → 401, no processing, safe log only
- Unknown session → 200 `{ignored}`, audit record
- Veriff/Ghost transient failure → non-2xx so Veriff retries (their retry schedule), application stays pre-membership; membership never created before full validation
- Ghost already-funded label → idempotent success, duplicate event recorded

## Test plan (local, `npm run dev` + `npm run webhook-test`)

Webhook script sends real-HMAC-signed fake decisions: approved-21 (→ member created, comped +1y, labels), approved-15 (→ NOT_ELIGIBLE under_age), approved-26 (→ NOT_ELIGIBLE over_age), declined, duplicate replay (→ no second member), bad signature (→ 401), malformed JSON (→ 400). Age boundary unit checks 16/25 inclusive. Live session-create tested against stationapi.veriff.com. Full E2E (real Veriff flow) after webhook URL is configured in the Veriff portal.

## Open items for production (spec §62)

- Veriff portal: set `Webhook decisions URL` to `https://<deploy>/api/webhooks/veriff` and the redirect/callback base
- Confirm Veriff product returns DOB (age estimation products return `additionalVerifiedData.estimatedAge` instead — eligibility.js handles both: prefer exact DOB, fall back to estimatedAge with reason logged)
- Email provider (welcome email) if Ghost magic-link is insufficient — `EMAIL_FROM`/`EMAIL_PROVIDER_API_KEY` placeholders reserved
- Retention/audit export policy; Postgres migration if reporting outgrows KV
