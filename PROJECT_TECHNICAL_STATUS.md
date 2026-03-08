# CASPER Technical Status and Implementation Notes

Date: 2026-03-08

## 1) Current project definition
CASPER is a browser extension that combines:
1. Password vault
2. OTP authenticator
3. Deception-based breach detection
4. Incident-response UX (alerts, details, guidelines)

It is designed as a secure academic prototype with controlled telemetry-based detection.

## 2) Architecture
### Extension (`/casper-extension`)
- `background/service-worker.js`
  - Vault lifecycle, auth policy, decoy logic, email, event ingestion
- `background/casper-core.js`
  - Crypto helpers and OTP generation
- `content/autofill.js`
  - Autofill and save/update prompts (result-aware for dummy site)
- `vault/*`
  - Main UI, security dashboard, breach details modal, guidelines launcher
- `popup/*`
  - Setup/unlock flow and first-run recovery code display

### Controlled demo backend (`/dummy-site`)
- Multi-page fitness site (`Home`, `Login`, `Register`, `Workouts`, `Dashboard`)
- Auth endpoints:
  - `POST /auth/register`
  - `POST /auth/login`
- Deception endpoints:
  - `POST /decoy/register`
  - `POST /decoy/check`
- Debug endpoints:
  - `GET /alerts`
  - `GET /decoys`
  - `GET /health`

### Hosted/local honey backend (`/honey-server`)
- Secondary backend option aligned with extension API contract.

## 3) Completed feature map
1. Vault encryption and PIN unlock
2. Sensitive-action step-up PIN verification
3. Password CRUD and autofill
4. Save/update credential prompting
5. OTP onboarding + code generation + verify action
6. Recovery code generation/regeneration
7. Unlock rate limiting and lockout timers
8. Auth Status card (attempts left / lockout countdown)
9. Decoy generation per credential
10. Decoy registration and monitoring
11. Breach detail modal in UI
12. Wrong-password warning ingestion from dummy site
13. Security response guide page
14. Email test/welcome/breach warning notifications
15. Developer-only decoy view (PIN-gated)

## 4) Key recent changes
1. Added dummy site register + login as separate pages.
2. Switched dummy app to fitness-themed multi-page website.
3. Added result-aware save prompt behavior on dummy site (no prompt on failed auth).
4. Added wrong-password warning conversion into security events + warning alerts.
5. Added `Security Response Guide` button and guidelines page.

## 5) Behavior clarifications
1. Historical alerts remain until cleared (future enhancement).
2. `Check Breach Now` reports new events; dashboard count includes historical alerts.
3. Third-party backend detection (e.g., Instagram server-side auth results) is out of scope.
4. Detection claim is valid for controlled monitored endpoints.

## 6) Remaining recommended enhancements
1. Add alert acknowledge/resolve workflow.
2. Add clear separation of WARNING vs CRITICAL counts in UI cards.
3. Add exportable incident report from breach details modal.
4. Add automated integration tests for dummy site + extension message flows.
5. Add passkey-native step-up where browser support is available.
