# Age Verification & Funded Membership Programme — Implementation Plan

People's Postcode Lottery (PPL) funds one complimentary year of membership for verified 16–25 year-olds. Yoti verifies age; a small Vercel endpoint glues Yoti to Ghost; Make.com handles comms + audit logging.

## Locked decisions

| Decision | Choice |
|---|---|
| Delivery method | **Direct comped Ghost membership** (no offer codes — not shareable, auditable) |
| Email capture | **Landing-page form (name + email + consent) before redirect to Yoti** |
| Glue endpoint | **Vercel serverless functions** (Node) |
| Make.com role | **Welcome email + Google Sheets audit log only** (no signed API work) |
| Ghost tier | **Comp on the main paid tier** + labels `Postcode Lottery`, `Verified 16-25` |
| 1-year limit | **Comped expiry date** = grant date + 1 year (Ghost ≥ 5.89 supports comped expiry; Ghost(Pro) is always current) |

## Corrections to the existing programme doc

1. The session-creation JSON in `Age Verification & Funded Membership Programme (1).md` (`"type": "OVER"`, `digital_id.threshold`) is the **legacy Yoti app API** shape. Implementation must use the current Identity Verification payload: `POST {base}/sessions` with `checks` (ID document authenticity + document data extraction incl. date of birth) and `notifications: { topic: "SESSION_COMPLETION", url: <our callback> }`. Confirm exact current field names against https://developers.yoti.com/identity-verification during implementation (the site is a JS SPA — read docs in a browser).
2. Yoti completion notifications carry only the session ID and are not signature-verified — **the retrieved session (GET /sessions/{id}) is the source of truth** for the age decision. Never trust webhook body contents beyond "go fetch session X".
3. Make.com cannot generate the RSA-SHA256 Digest headers Yoti requires, nor the HS256 JWT Ghost Admin requires. Both stay in the Vercel function.

## Caveat on the Ghost instance

`the-mill.ghost.io` currently contains theme-demo data (unsubscribe URLs point at `zora.themeix.com`, members are test accounts, no paid subscriptions, 3 active newsletters). Confirm with the org whether this install is the real programme target before go-live. Also: the tiers API call failed during planning — **tier IDs must be enumerated at implementation time** (Ghost Admin `GET /admin/tiers/`) and the "main paid tier" ID recorded as an env var.

## Vendor note

Yoti is the chosen provider (UK-based, GDPR-compliant, purpose-built age verification, sandbox already provisioned). Sandbox (`https://api.yoti.com/sandbox/...`) is free for testing. Production requires a Yoti commercial agreement — pricing is per-check and volume-based, agreed via Yoti sales. If commercial terms fail, Persona/Onfido/Veriff are drop-in alternatives (same webhook+retrieve pattern), but this plan assumes Yoti.

## Architecture

```
Applicant
  → Ghost landing page (form: name, email, consent)
  → POST https://<vercel>/api/start          (validate, anti-abuse, create Yoti session, store session→applicant mapping)
  → redirect to Yoti hosted verification page (session token from create-session response)
  → Yoti notification (SESSION_COMPLETION) → POST https://<vercel>/api/yoti-callback
      → GET /sessions/{id} (signed)          (retrieve DOB + check results)
      → age gate: 16 ≤ age ≤ 25 at verification date (inclusive)
      → Ghost Admin API (JWT): create-or-update member, comped on paid tier,
        comped expiry +1y, labels, default newsletter
      → POST outcome to Make webhook
  → Make.com: welcome email (+ magic-link sign-in) + Google Sheets audit row
  → Applicant redirected to Ghost thank-you page
```

## Implementation tasks

### Phase 0 — Setup
1. Confirm `the-mill.ghost.io` is the target install; enumerate tiers via Admin API `GET /admin/tiers/`; record main paid tier ID. Keys: Admin API key `6748…0b67` (id:secret), API URL `https://the-mill.ghost.io`. Move keys into env vars; never commit (private key + keys currently sit in this repo — add to `.gitignore`, rotate if the repo has ever been pushed).
2. Create Vercel project (Node 20+). Env vars: `YOTI_SDK_ID` (`cac9a9a1-8e71-4a08-9dc4-087a876796d7`), `YOTI_PRIVATE_KEY` (contents of `privateKey.pem`, newline-escaped), `YOTI_BASE_URL` (`https://api.yoti.com/sandbox` initially), `GHOST_URL`, `GHOST_ADMIN_KEY`, `MAKE_WEBHOOK_URL`, `SESSION_STORE` (Vercel KV / Upstash Redis URL).
3. Provision Vercel KV (or Upstash Redis) for the `session_id → {name, email, created_at}` mapping (pending applications, TTL 24h). If current Yoti API supports a session `reference_id`, it may replace the store — confirm from docs; KV is the safe default.

### Phase 1 — Vercel functions
4. **`POST /api/start`**: validate email/name/consent; rate-limit per IP + per email (KV counters, e.g. 3 sessions/email/day); reject if email is already comped with a `Postcode Lottery` label (idempotency guard); reject if email already has an active paid subscription (message: "you're already a member"). Create Yoti session: policy requesting **document authenticity + date-of-birth extraction only** (data minimisation — no address/portrait extraction unless required), `notifications.topic = SESSION_COMPLETION`, `notifications.url = https://<vercel>/api/yoti-callback`, TTL ~15 min. Store mapping; return Yoti redirect URL (build from `clientSessionTokenIso8601` per current Yoti docs).
5. **`POST /api/yoti-callback`**: look up mapping by session ID (ignore unknown/stale); `GET /sessions/{id}` with RSA-signed Digest headers; require authenticity check `REPORT_DONE`+passed; extract `dateOfBirth`; compute age at verification date; **pass iff 16 ≤ age ≤ 25**; on pass → Ghost upsert (Phase 2); always POST outcome `{timestamp, sessionId, email, name, result, reason, ghostMemberId, compedExpiry}` to `MAKE_WEBHOOK_URL`; respond 200 fast (Yoti retries on non-2xx).
6. Yoti request signing helper (Node `crypto`): `X-Yoti-Auth-Key: <SDK_ID>`, `Digest: SHA-256=<base64 signature of raw request body (empty string for GET)>` signed with the RSA private key, `Content-Type: application/json`.

### Phase 2 — Ghost integration (from Vercel)
7. Ghost Admin JWT helper (HS256, `kid` = key id, `aud: /admin/`, 5-min expiry — same scheme as Ghost's official JWT flow).
8. `GET /admin/members/?email=...`: if absent → `POST /admin/members/` with `{email, name, labels: ["Postcode Lottery", "Verified 16-25"], newsletters: [<default>]}`; then comp via `PUT /admin/members/{id}/` with `comped: true` + comped expiry field (confirm exact field name — `comped_expiry` in current Ghost — by inspecting the API schema at implementation). If existing free member → same edit path (update name/labels, comp + expiry). All calls idempotent; re-check label before comping to make webhook retries safe.
9. After success, trigger Ghost's magic-link sign-in email for the member (public Member API `POST /ghost/api/members/magic-link/` with site's `X-CSRF-Token` flow, or link in Make welcome email) so the applicant can set up access without a password.

### Phase 3 — Make.com
10. Custom webhook module receives outcome JSON. Two routes: **pass** → send branded welcome email (programme info, PPL attribution, "sign in" magic link, expiry date) + add audit row; **fail** → optional polite "not eligible" email (only if the applicant consented to outcome emails on the form). Audit Google Sheet columns: `timestamp, sessionId, email, name, ageBand (16-25/out), result, reason, ghostMemberId, compedExpiry`. No secrets stored in Make.

### Phase 4 — Ghost content
11. Build landing page on Ghost (page, e.g. `/funded-youth-membership/`): eligibility (16–25), how verification works, privacy notice (what Yoti checks, what we store — email, name, pass/fail, **never the ID document or DOB**), PPL credit, consent checkbox. HTML form POSTs to `/api/start` and redirects to the returned Yoti URL. Thank-you / not-eligible pages.

### Phase 5 — Testing (sandbox)
12. Use the sandbox response-config endpoint (`POST {sandbox}/sessions/{id}/response-config` — per https://developers.yoti.com/identity-verification/configure-sandbox-response) to script the matrix:
    - DOB → age 15 (fail: under), 16 (pass, boundary), 25 (pass, boundary), 26 (fail: over)
    - document authenticity check failed (fail: doc rejected)
    - session abandoned/timeout (no member created; mapping expires)
    - same email re-applies after pass (idempotent — no duplicate member, no second comp)
    - existing free member passes (upgraded, not duplicated)
    - Yoti webhook replayed (no double email / double audit row)
13. End-to-end test against `the-mill.ghost.io` verifying: member created, comped, correct tier + labels, expiry = +1y, newsletter subscribed, Make email received, Sheet row written.

### Phase 6 — Production cutover
14. Sign Yoti commercial agreement; create production Yoti app (new SDK ID + key). Flip `YOTI_BASE_URL` to `https://api.yoti.com` and swap `YOTI_SDK_ID`/`YOTI_PRIVATE_KEY`. Point landing page at prod endpoint. Smoke-test one real verification. Announce to PPL with reporting schedule.

## Failure modes & handling
- **Yoti webhook lost**: Yoti notifications are server-side and fire even if the applicant closes the browser; if a callback is missed, Yoti retries on non-2xx. Ops fallback: nightly KV-vs-Ghost reconciliation note (optional, low priority).
- **Ghost API down at callback time**: return non-200 to Yoti to force retry; log outcome to Make as `ghost_error` for manual retry.
- **Duplicate applications**: email-level guard at `/api/start` + label check before comping; rate limits on session creation. Cross-email identity reuse (same ID, different emails) is only fully solved by Yoti's identity-reuse/biometric dedupe options — raise with Yoti sales when agreeing production terms.
- **Children's data (16–17)**: UK GDPR age of consent for ISS is 13, so consent is valid, but run a lightweight DPIA, keep the privacy notice age-appropriate, and store only pass/fail + age band — never DOB or document images on our side.

## Validation plan
- Sandbox matrix (Phase 5) fully green; boundaries 16/25 both pass, 15/26 both fail.
- Ghost member state verified via Admin API after each scenario (tier, comped, expiry, labels).
- Audit Sheet reconciles 1:1 with Ghost members filtered by `label:Postcode Lottery` — this filter is also the standing monthly PPL report.

## Out of scope / open items
- Exact current Yoti session-create field names and redirect URL format (docs are SPA-rendered; confirm in browser during Phase 1).
- Exact Ghost comped-expiry API field name (confirm in Phase 2 against the live schema).
- Yoti production pricing/terms (commercial discussion).
- Whether `the-mill.ghost.io` or another install is the production Ghost target.
