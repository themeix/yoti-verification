# Veriff → Custom Webhook/API → Ghost CMS
## Age Verification & Funded Membership Programme
### Kilo Implementation Specification

**Project:** People's Postcode Lottery – Funded Membership Programme  
**Verification Provider:** Veriff  
**Membership Platform:** Ghost CMS  
**Automation Platform:** None  
**Custom Integration Layer:** Verfic/Veriff integration backend hosted on Vercel or equivalent  
**Document Type:** Technical implementation specification for Kilo  
**Version:** 1.0  
**Date:** 2026-09-05

---

# 1. Project Overview

The objective is to build a secure, automated age-verification and funded-membership onboarding system for applicants aged **16–25**.

The system will use:

- Veriff for identity/age verification
- A custom backend/API for application management and webhook processing
- Ghost CMS for member creation and membership access
- A database for application state, audit records, and idempotency
- Email notifications through the approved email provider
- Vercel or an equivalent secure hosting platform

**Make.com must NOT be used.**

The custom backend must own the complete workflow:

```text
Applicant
   ↓
Landing Page / Application
   ↓
Custom Backend
   ↓
Create Veriff Session
   ↓
Veriff Verification
   ↓
Veriff Decision Webhook
   ↓
Custom Webhook Endpoint
   ↓
Validate Webhook
   ↓
Retrieve / Validate Verification Result
   ↓
Eligibility Check
   ↓
Duplicate / Fraud Checks
   ↓
Ghost API
   ↓
Create Membership
   ↓
Send Welcome / Result Email
   ↓
Audit Log
```

---

# 2. Primary Objectives

The implementation must:

1. Verify whether an applicant is between 16 and 25 years old.
2. Ensure only eligible applicants receive the funded membership.
3. Prevent duplicate membership allocation.
4. Prevent duplicate webhook processing.
5. Prevent users from bypassing verification.
6. Avoid exposing Veriff credentials to the browser.
7. Validate Veriff webhook authenticity.
8. Maintain a complete application/audit trail.
9. Automatically create eligible Ghost members.
10. Handle failed verification and API failures safely.
11. Support retries without creating duplicate Ghost members.
12. Provide enough logging/reporting information for administrators.
13. Avoid unnecessary storage of identity documents or sensitive verification data.
14. Keep Veriff as the verification authority and Ghost as the membership authority.

---

# 3. Non-Goals

The initial implementation should NOT include:

- Make.com
- Zapier
- Other third-party automation platforms
- Manual membership approval unless explicitly requested later
- Storage of identity documents
- Storage of raw Veriff identity data unless legally/business-required
- Custom identity verification logic
- Client-side Ghost Admin API credentials
- Client-side Veriff API credentials

---

# 4. Recommended Architecture

## 4.1 High-Level Architecture

```text
┌─────────────────────┐
│       Applicant     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Landing/Application │
│       Page          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Custom Backend    │
│   Application API   │
└──────────┬──────────┘
           │
           │ Create Session
           ▼
┌─────────────────────┐
│       Veriff        │
│ Verification Flow   │
└──────────┬──────────┘
           │
           │ Decision Webhook
           ▼
┌─────────────────────┐
│ Veriff Webhook API  │
│   Custom Endpoint   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Verification Logic  │
│ + Eligibility       │
│ + Duplicate Checks  │
└──────────┬──────────┘
           │
           │ Eligible
           ▼
┌─────────────────────┐
│      Ghost API      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Ghost Membership   │
│       Created       │
└─────────────────────┘
```

---

# 5. System Components

## 5.1 Applicant Frontend

The applicant-facing page should:

- Explain the programme
- Explain the 16–25 eligibility requirement
- Explain the verification process
- Link to privacy information
- Collect the minimum application information
- Start verification
- Display verification status
- Display final application status where appropriate

The frontend must never contain:

- Veriff API secret
- Ghost Admin API key
- Ghost Admin API secret
- Database credentials
- Webhook secret

---

# 6. Custom Backend

The custom backend is the central component.

Recommended deployment:

- Vercel
- Node.js
- TypeScript
- Next.js API routes or a dedicated Node.js API
- PostgreSQL-compatible database

The exact framework can be selected based on the existing Verfic/website codebase, but the implementation must maintain a clean separation between:

```text
Application API
Veriff Service
Webhook Handler
Eligibility Service
Ghost Service
Email Service
Audit Service
Database Layer
```

---

# 7. Environment Variables

Secrets must be stored only as server-side environment variables.

Example:

```env
VERIFF_API_URL=
VERIFF_API_KEY=
VERIFF_SHARED_SECRET=

GHOST_API_URL=
GHOST_ADMIN_API_KEY=

DATABASE_URL=

APP_BASE_URL=
VERIFF_WEBHOOK_URL=

EMAIL_FROM=
EMAIL_PROVIDER_API_KEY=

LOG_LEVEL=info
```

Do not commit `.env` files to Git.

Create:

```text
.env.local
.env.example
```

`.env.example` must contain variable names but no production credentials.

Example:

```env
VERIFF_API_URL=
VERIFF_API_KEY=
VERIFF_SHARED_SECRET=

GHOST_API_URL=
GHOST_ADMIN_API_KEY=

DATABASE_URL=

APP_BASE_URL=
VERIFF_WEBHOOK_URL=

EMAIL_FROM=
EMAIL_PROVIDER_API_KEY=
```

---

# 8. Application Data Model

A database should be used rather than relying on Make.com or Ghost as the application-state database.

## 8.1 Applications Table

Suggested schema:

```sql
CREATE TABLE applications (
    id UUID PRIMARY KEY,
    reference_id VARCHAR(255) NOT NULL UNIQUE,

    email VARCHAR(320) NOT NULL,
    name VARCHAR(255),

    veriff_session_id VARCHAR(255) UNIQUE,
    veriff_status VARCHAR(50),
    veriff_decision VARCHAR(100),

    age_eligible BOOLEAN,

    status VARCHAR(50) NOT NULL,

    ghost_member_id VARCHAR(255),
    ghost_member_email VARCHAR(320),

    membership_created_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    processed_at TIMESTAMP
);
```

---

# 9. Recommended Application Statuses

Use explicit application states.

```text
PENDING
VERIFICATION_STARTED
VERIFICATION_IN_PROGRESS
VERIFICATION_APPROVED
VERIFICATION_DECLINED
VERIFICATION_EXPIRED
VERIFICATION_ABANDONED
VERIFICATION_REVIEW
NOT_ELIGIBLE
ELIGIBLE
MEMBERSHIP_PENDING
MEMBERSHIP_CREATED
MEMBERSHIP_FAILED
PROCESSING_ERROR
```

The exact values can be implemented as database enums or strings.

---

# 10. Webhook Event Log

Create a separate table to support idempotency and debugging.

Suggested schema:

```sql
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100),

    event_id VARCHAR(255),
    session_id VARCHAR(255),

    signature_valid BOOLEAN NOT NULL,

    payload_hash VARCHAR(128),

    processing_status VARCHAR(50) NOT NULL,

    received_at TIMESTAMP NOT NULL,
    processed_at TIMESTAMP,

    error_message TEXT
);
```

Create a unique index where possible:

```sql
CREATE UNIQUE INDEX webhook_events_provider_event_id
ON webhook_events(provider, event_id);
```

If Veriff does not provide a suitable unique event ID for the specific webhook implementation, use a deterministic idempotency strategy based on the session ID + event type + decision/version information.

---

# 11. Audit Log

Create an audit table.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,

    application_id UUID,

    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50),

    message TEXT,

    metadata JSONB,

    created_at TIMESTAMP NOT NULL
);
```

Examples:

```text
APPLICATION_CREATED
VERIFF_SESSION_CREATED
VERIFF_WEBHOOK_RECEIVED
VERIFF_WEBHOOK_VALIDATED
VERIFICATION_APPROVED
VERIFICATION_DECLINED
ELIGIBILITY_PASSED
ELIGIBILITY_FAILED
GHOST_MEMBER_LOOKUP
GHOST_MEMBER_CREATED
GHOST_MEMBER_EXISTS
EMAIL_SENT
MEMBERSHIP_FAILED
PROCESSING_RETRY
```

Do not log sensitive identity information unnecessarily.

---

# 12. Veriff Integration

## 12.1 Session Creation

The backend should create a Veriff session server-side.

The browser must never call Veriff with the private API credentials.

Conceptually:

```text
POST /api/applications
        ↓
Create application
        ↓
POST Veriff /v1/sessions
        ↓
Store session ID
        ↓
Return safe session information to browser
```

The Veriff session should contain a unique application reference.

Example concept:

```json
{
  "reference_id": "programme-<application-id>"
}
```

The reference must allow the backend to correlate Veriff with the internal application.

---

# 13. Veriff Webhook

The primary webhook endpoint should be:

```text
POST /api/webhooks/veriff
```

Production example:

```text
https://<backend-domain>/api/webhooks/veriff
```

Do not use a Make.com webhook.

Do not proxy the webhook through Make.com.

---

# 14. Webhook Security

The webhook endpoint must validate Veriff authentication before processing any event.

Veriff webhook requests use authentication headers including:

```text
X-AUTH-CLIENT
X-HMAC-SIGNATURE
```

The implementation must verify the signature according to Veriff's current documentation.

The shared secret must remain server-side.

Never expose:

```text
VERIFF_SHARED_SECRET
```

to the browser.

If webhook authentication fails:

```text
HTTP 401
```

or the appropriate secure status should be returned.

Do not process the payload.

---

# 15. Webhook Processing Strategy

The webhook should be lightweight at the HTTP boundary and robust internally.

Recommended flow:

```text
Receive webhook
     ↓
Validate HTTP method
     ↓
Validate authentication
     ↓
Validate HMAC signature
     ↓
Parse JSON
     ↓
Identify event/session
     ↓
Check idempotency
     ↓
Store webhook event
     ↓
Return appropriate acknowledgement
     ↓
Process event
```

Where the hosting architecture permits asynchronous processing, webhook receipt and business processing should be separated.

If processing is synchronous, keep the process reliable and ensure duplicate requests are safe.

---

# 16. Idempotency

This is a critical requirement.

Veriff webhook delivery can be retried.

Therefore:

```text
Webhook A
Webhook A again
Webhook A again
```

must NOT produce:

```text
Ghost Member 1
Ghost Member 2
Ghost Member 3
```

It must produce:

```text
Ghost Member 1
```

only once.

Before creating a Ghost member:

1. Lock or atomically update the application state.
2. Check whether membership has already been created.
3. Check Ghost using the applicant email where appropriate.
4. If a member already exists and is associated with this programme, do not create another membership.
5. Record the duplicate/idempotent event.

---

# 17. Eligibility Rules

The initial programme rule is:

```text
Applicant age >= 16
AND
Applicant age <= 25
```

The exact age calculation must be based on the verified date of birth or the age result supported by the selected Veriff product.

Avoid implementing age calculation from untrusted browser input.

The browser-provided date of birth must NOT be treated as proof of eligibility.

The verified Veriff result is authoritative for the verification decision.

---

# 18. Important Boundary Condition

The implementation must explicitly define whether eligibility means:

```text
16 <= age <= 25 at verification time
```

or another programme-specific rule.

This must be confirmed during Phase 1.

Do not assume a different interpretation.

The code should centralize the rule in one service:

```text
eligibility.service.ts
```

Example:

```ts
function isEligible(age: number): boolean {
    return age >= 16 && age <= 25;
}
```

If the programme later changes the rule, only the eligibility service should need modification.

---

# 19. Veriff Decision Handling

The backend should support the relevant Veriff decision states.

Example mapping:

| Veriff Decision | Internal Action |
|---|---|
| approved | Continue eligibility check |
| declined | Mark verification declined |
| resubmission_requested | Keep application pending |
| expired | Mark expired |
| abandoned | Mark abandoned |
| review | Keep pending / manual review if required |

Do not create a membership merely because a webhook was received.

Membership creation must happen only after the complete verification and eligibility checks succeed.

---

# 20. Membership Creation

Recommended approach:

```text
Veriff Approved
      ↓
Age Eligible
      ↓
No Existing Funded Membership
      ↓
Create Ghost Member
      ↓
Apply Labels
      ↓
Record Ghost Member ID
      ↓
Send Welcome Email
```

---

# 21. Ghost API

The Ghost Admin API credential must remain server-side.

The browser must never call the Ghost Admin API directly.

The custom backend should expose an internal service such as:

```text
ghost.service.ts
```

Functions:

```text
findMemberByEmail()
createMember()
updateMemberLabels()
getMember()
```

---

# 22. Ghost Member Creation

The implementation should create a Ghost member with:

- Email
- Name if available
- Appropriate labels
- Any programme-specific metadata supported by the existing Ghost setup

Example conceptual payload:

```json
{
  "members": [
    {
      "email": "user@example.com",
      "name": "John Smith",
      "labels": [
        {
          "name": "Postcode Lottery Programme"
        },
        {
          "name": "Verified 16-25"
        },
        {
          "name": "Funded Membership"
        }
      ]
    }
  ]
}
```

The exact payload must be adapted to the installed Ghost version/API behavior.

---

# 23. Ghost Duplicate Prevention

Before creating a member:

```text
Find member by email
```

If no member exists:

```text
Create member
```

If member exists:

```text
Check whether they already have the funded programme membership/label
```

If they already have it:

```text
Do not create another allocation.
```

If they exist but do not have the funded programme:

```text
Apply the required membership/label according to the agreed programme rules.
```

Do not overwrite unrelated Ghost member data.

---

# 24. Ghost Membership vs Labels

Labels should not be treated as proof of verification.

The authoritative programme record should remain in the application database.

Ghost labels are primarily for:

- Segmentation
- Reporting
- Administration
- Campaign targeting

The database should maintain the authoritative relationship:

```text
Application
    ↓
Veriff Session
    ↓
Eligibility
    ↓
Ghost Member
```

---

# 25. Email Flow

Recommended emails:

## Application Started

Optional.

```text
Your age verification application has started.
```

## Verification Successful

```text
Your verification has been completed successfully.
```

## Membership Created

```text
Your complimentary membership has been created.
```

## Not Eligible

```text
Unfortunately, you do not meet the age requirements for this programme.
```

## Verification Failed

Generic wording should be used without exposing sensitive verification information.

---

# 26. Email Security

Do not include:

- Identity document details
- Full verification payload
- Sensitive verification results
- Government ID information
- Internal API credentials
- Internal application IDs unless necessary

Use a safe public-facing status message.

---

# 27. Error Handling

## Veriff Session Creation Failure

If Veriff session creation fails:

```text
Application → VERIFICATION_STARTED
```

should not be stored as successful.

Record:

```text
VERIFF_SESSION_CREATE_FAILED
```

and allow retry.

---

## Webhook Authentication Failure

Return an appropriate error.

Do not process the request.

Log only safe metadata.

---

## Unknown Session

If the Veriff session cannot be matched:

```text
PROCESSING_ERROR
```

Record the event for investigation.

Do not create a Ghost member.

---

## Ghost API Failure

If Ghost fails:

```text
MEMBERSHIP_PENDING
```

or:

```text
MEMBERSHIP_FAILED
```

The application must retain enough information to retry without requiring the user to repeat verification.

---

# 28. Retry Strategy

Implement controlled retries for transient failures.

Suggested:

```text
Attempt 1
↓
Short delay
↓
Attempt 2
↓
Exponential backoff
↓
Attempt 3
↓
Mark failed / alert administrator
```

Do not retry indefinitely.

Do not retry permanent validation errors.

---

# 29. Concurrency Protection

Two webhook requests can arrive at nearly the same time.

Example:

```text
Webhook A ──┐
            ├── Application
Webhook B ──┘
```

Both must not create a member.

Use one or more:

- Database transaction
- Row-level lock
- Atomic status transition
- Unique database constraint
- Ghost email lookup
- Idempotency key

Recommended database transition:

```text
ELIGIBLE
   ↓
MEMBERSHIP_PENDING
   ↓
MEMBERSHIP_CREATED
```

Only one process should be allowed to transition the application into membership creation.

---

# 30. Security Requirements

The implementation must:

- Use HTTPS everywhere.
- Store secrets in environment variables.
- Never expose secrets to frontend JavaScript.
- Validate Veriff webhook authentication.
- Validate HMAC signatures.
- Validate request method.
- Validate JSON payload.
- Use parameterized database queries/ORM.
- Protect application endpoints against abuse.
- Rate-limit public endpoints where appropriate.
- Avoid logging sensitive personal information.
- Use secure HTTP headers.
- Keep dependencies updated.
- Restrict CORS where applicable.
- Validate email addresses.
- Sanitize display data.
- Implement least-privilege credentials.

---

# 31. Privacy / Data Minimization

Only store information necessary for:

- Programme eligibility
- Membership allocation
- Fraud/duplicate prevention
- Reporting
- Audit requirements

Do not store identity documents unless explicitly required and legally approved.

Prefer storing:

```text
Veriff session ID
Verification status
Eligibility result
Application status
Ghost member ID
Timestamps
```

instead of storing raw verification data.

The final retention period must be agreed with the programme owner/legal/privacy team.

---

# 32. Fraud Prevention

Recommended controls:

1. Unique application ID.
2. Unique Veriff session ID.
3. Unique reference ID.
4. Duplicate email detection.
5. Existing Ghost member check.
6. Idempotent webhook processing.
7. Webhook signature validation.
8. Server-side age validation.
9. Verification result validation.
10. Application state machine.
11. Rate limiting.
12. Audit logging.

Additional anti-abuse controls can be added later if required.

---

# 33. Public API Endpoints

Recommended endpoints:

```text
POST /api/applications
```

Creates an application and Veriff session.

```text
GET /api/applications/:id
```

Returns safe application status.

```text
POST /api/webhooks/veriff
```

Receives Veriff webhook notifications.

Optional:

```text
POST /api/applications/:id/retry-verification
```

Allows a controlled retry where appropriate.

Optional:

```text
GET /api/admin/applications
```

Admin reporting endpoint, protected by proper authentication.

---

# 34. POST /api/applications

Request example:

```json
{
  "name": "John Smith",
  "email": "john@example.com"
}
```

Response should contain only safe information.

Example:

```json
{
  "applicationId": "safe-public-id",
  "status": "VERIFICATION_STARTED",
  "verificationUrl": "https://..."
}
```

Never return:

```text
VERIFF_API_KEY
VERIFF_SHARED_SECRET
GHOST_ADMIN_API_KEY
DATABASE_URL
```

---

# 35. GET Application Status

Example:

```text
GET /api/applications/{id}
```

Safe response:

```json
{
  "status": "VERIFICATION_IN_PROGRESS"
}
```

Possible public states:

```text
VERIFICATION_IN_PROGRESS
VERIFICATION_APPROVED
NOT_ELIGIBLE
MEMBERSHIP_CREATED
VERIFICATION_FAILED
```

Do not expose internal error messages.

---

# 36. Admin Reporting

An admin-only reporting interface can be added later.

Potential metrics:

```text
Total Applications
Verification Started
Verification Approved
Verification Declined
Eligible
Not Eligible
Memberships Created
Membership Creation Failed
Pending
Duplicate Applications
```

Filters:

```text
Date
Status
Verification Decision
Membership Status
```

---

# 37. Observability

Implement structured server logs.

Example:

```json
{
  "event": "GHOST_MEMBER_CREATED",
  "applicationId": "...",
  "timestamp": "..."
}
```

Avoid logging:

```text
ID document number
Full identity payload
Veriff secret
Ghost secret
Passwords
Sensitive verification attributes
```

Use a request/correlation ID:

```text
X-Request-ID
```

or an internal correlation ID.

---

# 38. Project Structure

Recommended structure:

```text
src/
├── app/
│   └── api/
│       ├── applications/
│       │   └── route.ts
│       ├── applications/
│       │   └── [id]/
│       │       └── route.ts
│       └── webhooks/
│           └── veriff/
│               └── route.ts
│
├── services/
│   ├── veriff.service.ts
│   ├── ghost.service.ts
│   ├── eligibility.service.ts
│   ├── membership.service.ts
│   ├── email.service.ts
│   └── audit.service.ts
│
├── lib/
│   ├── database.ts
│   ├── logger.ts
│   ├── security.ts
│   ├── idempotency.ts
│   └── validation.ts
│
├── types/
│   ├── veriff.ts
│   ├── ghost.ts
│   └── application.ts
│
└── tests/
    ├── eligibility/
    ├── webhook/
    ├── veriff/
    ├── ghost/
    └── membership/
```

Adapt this structure to the existing codebase rather than unnecessarily replacing an established architecture.

---

# 39. Service Responsibilities

## veriff.service.ts

Responsibilities:

```text
createSession()
getSession()
validateWebhook()
parseDecision()
```

## eligibility.service.ts

Responsibilities:

```text
checkAgeEligibility()
validateProgrammeEligibility()
```

## ghost.service.ts

Responsibilities:

```text
findMemberByEmail()
createMember()
updateMember()
addLabels()
```

## membership.service.ts

Responsibilities:

```text
processEligibleApplication()
createFundedMembership()
preventDuplicateMembership()
```

## audit.service.ts

Responsibilities:

```text
recordApplicationEvent()
recordVerificationEvent()
recordMembershipEvent()
```

---

# 40. State Machine

The application lifecycle should be explicit.

```text
APPLICATION_CREATED
        ↓
VERIFICATION_STARTED
        ↓
VERIFICATION_IN_PROGRESS
        ↓
       ┌───────────────┐
       │               │
       ▼               ▼
   APPROVED         DECLINED
       │
       ▼
ELIGIBILITY_CHECK
       │
   ┌───┴────┐
   │        │
   ▼        ▼
ELIGIBLE  NOT_ELIGIBLE
   │
   ▼
MEMBERSHIP_PENDING
   │
   ▼
MEMBERSHIP_CREATED
```

Invalid transitions should be rejected.

For example:

```text
NOT_ELIGIBLE → MEMBERSHIP_CREATED
```

must never be allowed.

---

# 41. Important Ghost Integration Consideration

Before implementation, inspect the current Ghost installation.

Confirm:

- Ghost version
- Membership configuration
- Existing offers
- Existing tiers
- Existing labels
- Existing member signup flow
- Existing email configuration
- Existing Admin API configuration

Do not assume that the example Ghost payload is directly compatible with every Ghost version/configuration.

The implementation must use the actual Ghost API available in the production environment.

---

# 42. Important Veriff Integration Consideration

Before development, confirm the exact Veriff product and verification configuration purchased/selected.

Specifically confirm:

- Identity verification requirements
- Age verification requirements
- Whether date of birth is returned
- Whether age is returned
- Age threshold configuration
- Decision webhook payload
- Webhook authentication requirements
- Session creation requirements
- Required callback/redirect URLs
- Sandbox/testing capabilities
- Data retention behavior
- Relevant regional/privacy configuration

Do not hard-code assumptions about the Veriff response payload until the actual Veriff account/product documentation has been confirmed.

---

# 43. Testing Plan

## Unit Tests

Test:

```text
Age 15 → false
Age 16 → true
Age 17 → true
Age 25 → true
Age 26 → false
```

Also test:

- Missing age
- Invalid date of birth
- Invalid verification status
- Duplicate application
- Duplicate email
- Existing Ghost member

---

# 44. Webhook Tests

Test:

### Valid Webhook

Expected:

```text
HTTP 2xx
Event processed
```

### Invalid Signature

Expected:

```text
HTTP 401/403
No processing
No membership
```

### Duplicate Webhook

Expected:

```text
HTTP 2xx
No duplicate membership
```

### Unknown Session

Expected:

```text
Safe failure
Audit record
No membership
```

### Malformed JSON

Expected:

```text
HTTP 400
No processing
```

---

# 45. Membership Tests

Test:

### Eligible New Applicant

```text
Veriff Approved
+
Age 16–25
+
No Ghost Member
=
Ghost Member Created
```

### Ineligible Applicant

```text
Veriff Approved
+
Age outside range
=
No Ghost Member
```

### Existing Member

```text
Eligible
+
Existing Ghost Member
=
No Duplicate Member
```

### Ghost API Failure

```text
Eligible
+
Ghost API unavailable
=
Membership Pending/Failed
+
Retry Available
```

---

# 46. End-to-End Test

Complete the entire journey:

```text
Applicant
→ Application
→ Veriff Session
→ Verification
→ Veriff Webhook
→ Webhook Validation
→ Eligibility
→ Ghost API
→ Member Created
→ Label Applied
→ Email
→ Audit Log
```

Confirm every stage.

---

# 47. Security Testing

Before launch:

- Test webhook signature validation.
- Test replay/duplicate webhook.
- Test malformed requests.
- Test unauthorized application access.
- Test rate limiting.
- Test secret exposure.
- Test frontend source for credentials.
- Test database authorization.
- Test Ghost API credential security.
- Test Veriff credential security.
- Test logging for sensitive information.

---

# 48. Deployment

Recommended environments:

```text
Development
    ↓
Staging
    ↓
Production
```

Do not test the first implementation directly against production membership data.

Use Veriff sandbox/test environment where available.

Use a staging Ghost installation or controlled test members for integration testing.

---

# 49. Production Deployment Checklist

Before launch:

```text
[ ] Veriff production credentials configured
[ ] Veriff webhook URL configured
[ ] Webhook authentication tested
[ ] HMAC validation tested
[ ] Ghost production API configured
[ ] Database production configured
[ ] Environment variables configured
[ ] HTTPS enabled
[ ] Error logging enabled
[ ] Audit logging enabled
[ ] Duplicate protection tested
[ ] Ghost duplicate handling tested
[ ] Email delivery tested
[ ] Privacy/retention requirements confirmed
[ ] UAT completed
[ ] Rollback plan prepared
```

---

# 50. Rollback Strategy

If the integration fails after deployment:

1. Disable new applications.
2. Do not delete existing Ghost members automatically.
3. Preserve application records.
4. Investigate failed webhook events.
5. Fix the integration.
6. Retry eligible pending applications.
7. Re-enable applications.

Do not ask applicants to repeat verification unless the Veriff session is genuinely invalid/expired.

---

# 51. Monitoring

Monitor:

```text
Veriff session creation failures
Webhook authentication failures
Webhook processing failures
Unknown sessions
Eligibility failures
Ghost API failures
Email failures
Duplicate webhook events
Membership creation failures
```

An alert should be triggered for repeated infrastructure/API failures.

---

# 52. Data Retention

Retention periods must be confirmed with the project owner/privacy/legal team.

Recommended principle:

> Store the minimum information necessary for the shortest approved period.

Where possible, retain:

```text
Application ID
Veriff Session ID
Verification status
Eligibility result
Ghost Member ID
Audit timestamps
```

and avoid retaining unnecessary sensitive verification data.

---

# 53. User Experience

The user should not need to understand the technical workflow.

Ideal experience:

```text
Apply
 ↓
Verify age
 ↓
Verification complete
 ↓
Membership created
 ↓
Welcome
```

Avoid unnecessary intermediate screens.

If verification is still processing, show:

```text
Your verification is being processed.
You will receive an update when it is complete.
```

---

# 54. Failure User Experience

If verification fails:

```text
We could not complete your verification.
Please follow the instructions provided to continue, if available.
```

If the applicant is outside the eligible age range:

```text
Unfortunately, you are not eligible for this funded membership programme.
```

Do not expose internal Veriff decision details unless specifically required.

---

# 55. Implementation Phases

## Phase 1 – Planning

Estimated:

**1–2 days**

Tasks:

- Confirm requirements
- Confirm age rule
- Confirm Veriff product
- Confirm Ghost configuration
- Confirm privacy/retention
- Confirm email requirements

---

## Phase 2 – Veriff Integration

Estimated:

**3–5 days**

Tasks:

- Configure Veriff
- Implement session creation
- Implement redirect
- Implement webhook
- Implement webhook authentication
- Implement result handling

---

## Phase 3 – Custom Backend

Estimated:

**4–6 days**

Tasks:

- Application database
- State machine
- Eligibility service
- Idempotency
- Audit logs
- Error handling
- Retry handling

---

## Phase 4 – Ghost Integration

Estimated:

**5–7 days**

Tasks:

- Ghost API integration
- Member lookup
- Member creation
- Labels
- Membership handling
- Welcome email
- Duplicate prevention

---

## Phase 5 – Testing & Launch

Estimated:

**2–3 days**

Tasks:

- Unit tests
- Integration tests
- Webhook tests
- Security testing
- End-to-end testing
- UAT
- Production deployment

---

# 56. Overall Estimated Development Time

Estimated development effort:

```text
Planning:             1–2 days
Veriff Integration:   3–5 days
Custom Backend:       4–6 days
Ghost Integration:    5–7 days
Testing & Launch:     2–3 days
--------------------------------
Total:               15–23 working days
```

The final estimate depends on:

- Existing codebase
- Ghost configuration
- Veriff product configuration
- Email infrastructure
- Database availability
- Reporting requirements
- UAT requirements

---

# 57. Required Credentials

## Veriff

Required:

```text
Veriff API Key
Veriff Shared Secret
Veriff account/project access
```

## Ghost

Required:

```text
Ghost Admin API credentials
Ghost URL
Membership/tier configuration
```

## Hosting

Required:

```text
Vercel/project access
Production domain
Environment variable access
```

## Database

Required:

```text
Production database
DATABASE_URL
```

## Email

Required only if email is handled outside Ghost:

```text
Email provider credentials
```

---

# 58. Kilo Development Instructions

Kilo should implement this project incrementally.

## Step 1

Inspect the existing repository.

Identify:

- Framework
- Existing API routes
- Existing database
- Existing Ghost integration
- Existing authentication
- Existing email system
- Existing deployment configuration

Do not replace existing infrastructure unnecessarily.

## Step 2

Create the application data model.

## Step 3

Implement Veriff session creation.

## Step 4

Implement the Veriff webhook.

## Step 5

Implement webhook signature validation.

## Step 6

Implement idempotency.

## Step 7

Implement eligibility checking.

## Step 8

Implement Ghost API integration.

## Step 9

Implement duplicate membership prevention.

## Step 10

Implement email notifications.

## Step 11

Implement audit logging.

## Step 12

Write automated tests.

## Step 13

Run staging end-to-end tests.

## Step 14

Prepare production deployment.

---

# 59. Kilo Coding Rules

Kilo must follow these rules:

1. Do not add Make.com.
2. Do not add Zapier.
3. Do not expose secrets client-side.
4. Do not hard-code production credentials.
5. Do not trust browser-provided age.
6. Do not create membership from the frontend.
7. Do not create membership before verified eligibility.
8. Do not process unauthenticated Veriff webhooks.
9. Do not create duplicate members from repeated webhooks.
10. Do not store identity documents unnecessarily.
11. Do not log sensitive verification information.
12. Do not rewrite unrelated existing application functionality.
13. Use TypeScript types for Veriff/Ghost payloads.
14. Validate external API responses.
15. Add automated tests for all critical flows.
16. Keep business rules centralized.
17. Use database transactions/atomic operations where required.
18. Document all new environment variables.
19. Handle transient external API failures safely.
20. Never silently swallow errors.

---

# 60. Definition of Done

The project is considered complete when all of the following are true:

### Application

- [ ] Applicant can start an application.
- [ ] Application record is created.
- [ ] Veriff session is created.
- [ ] Applicant can complete Veriff verification.

### Webhook

- [ ] Veriff webhook is publicly reachable via HTTPS.
- [ ] Webhook authentication is implemented.
- [ ] HMAC signature validation is implemented.
- [ ] Duplicate webhook delivery is handled safely.
- [ ] Unknown sessions do not create memberships.

### Eligibility

- [ ] Age 16 is eligible.
- [ ] Age 25 is eligible.
- [ ] Age below 16 is ineligible.
- [ ] Age above 25 is ineligible.
- [ ] Eligibility is determined server-side.

### Ghost

- [ ] Eligible applicant can create a Ghost member.
- [ ] Required labels are applied.
- [ ] Existing Ghost members are handled correctly.
- [ ] Duplicate memberships cannot be created.

### Reliability

- [ ] Ghost failures can be retried.
- [ ] Veriff webhook retries are safe.
- [ ] Application state remains consistent.
- [ ] Errors are logged.
- [ ] Audit events are recorded.

### Security

- [ ] No secrets are exposed to frontend.
- [ ] Veriff webhook authentication works.
- [ ] HTTPS is enforced.
- [ ] Sensitive data is minimized.
- [ ] Production credentials are stored securely.

### Testing

- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Webhook tests pass.
- [ ] Duplicate tests pass.
- [ ] Ghost failure tests pass.
- [ ] End-to-end staging test passes.

---

# 61. Final Architecture Decision

The final implementation should use:

```text
                    VERIFF
                       │
                       │ Decision Webhook
                       ▼
              ┌─────────────────┐
              │ Custom Backend   │
              │ / Webhook API    │
              └────────┬────────┘
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
       Application DB        Ghost API
             │                   │
             │                   ▼
             │             Ghost Member
             │                   │
             └──────────► Audit / Status
```

There is **no Make.com** in the final architecture.

The custom backend is the source of truth for application processing, verification state, eligibility, idempotency, and audit records.

Veriff is the source of truth for verification.

Ghost is the source of truth for membership.

---

# 62. Important Pre-Implementation Questions

Before Kilo moves from staging to production, the following must be confirmed:

1. What exact Veriff product is being purchased/used?
2. Does the selected Veriff configuration return verified date of birth, verified age, or an age-range/threshold result?
3. Is the eligibility rule strictly 16–25 inclusive?
4. Should age be evaluated at verification time or another defined date?
5. What Ghost membership tier/offer should be assigned?
6. Should an existing Ghost member receive the funded membership?
7. What happens if an existing member has a different paid membership?
8. What labels should be created?
9. What email system should send the welcome message?
10. What data retention period is approved?
11. What reporting interface is required?
12. Is manual review required for Veriff `review` outcomes?
13. What should happen after `resubmission_requested`?
14. What should happen when verification expires?
15. What geographic restrictions apply, if any?

These questions should be resolved before production launch.

---

# 63. Final Implementation Summary

The recommended solution is a **direct Veriff-to-custom-backend-to-Ghost integration**.

The complete workflow is:

```text
1. Applicant submits application
2. Backend creates application record
3. Backend creates Veriff session
4. Applicant completes Veriff verification
5. Veriff sends Decision Webhook
6. Backend authenticates webhook
7. Backend checks idempotency
8. Backend identifies application
9. Backend validates verification result
10. Backend checks age eligibility
11. Backend checks duplicate membership
12. Backend creates/updates Ghost member
13. Backend applies programme labels
14. Backend records Ghost member ID
15. Backend sends confirmation
16. Backend records complete audit trail
```

This architecture provides:

- No Make.com dependency
- Full control over business logic
- Secure webhook processing
- Automated membership allocation
- Duplicate prevention
- Better auditability
- Better reliability
- Easier future maintenance
- Clear separation between verification and membership systems

**Kilo should treat this document as the implementation specification and adapt the exact API payloads to the current Veriff and Ghost API documentation/configuration available in the project.**
