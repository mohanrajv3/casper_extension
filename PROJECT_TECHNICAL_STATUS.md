# CASPER Technical Status and Implementation Notes

Date: 2026-03-07

## 1) Project objective implemented
Implemented a browser extension with deception-based breach detection:
- Real credential vault
- Decoy credential generation (honeytokens)
- Honey server registration and monitoring
- Breach detection alerts in extension
- Breach/welcome email alerts via EmailJS

This follows the principle: detect evidence of vault exfiltration via decoy use, not by monitoring third-party providers directly.

## 2) Current architecture
## Extension (`/casper-extension`)
- `background/service-worker.js`
  - Core runtime, vault operations, CASPER flow, decoy pipeline, messaging APIs
- `content/autofill.js`
  - Form scan, save prompt, page autofill injection
- `vault/vault.html`, `vault/vault.js`, `vault/vault.css`
  - Full vault UI: passwords, OTP, security dashboard, settings
- `popup/*`
  - Setup/unlock and quick actions
- `background/casper-core.js`
  - Cryptographic helpers and vault encrypt/decrypt primitives
- `background/sync-manager.js`
  - Cloud/local sync handling with fallback behavior

## Honey server (`/honey-server`)
- `server.js`
  - HTTP endpoints for decoy registration and breach checks
- `attacker-script.js`
  - Simulates decoy login for demo/testing
- `data/store.json`
  - Local storage for decoys + alerts (server-side)

## 3) Services and integrations
## A) Honey server (Render)
Live URL:
- `https://casper-extension.onrender.com`

Main endpoints:
- `GET /` -> server info
- `GET /health` -> health check
- `POST /decoy/register` -> register decoys
- `POST /decoy/check` -> check breach events for provided decoy IDs
- `POST /auth/login` -> simulated attacker login endpoint
- `GET /decoys` and `GET /alerts` -> debug endpoints (auth required)

Auth:
- Bearer token via `Authorization: Bearer <HONEY_API_TOKEN>`

## B) EmailJS
Configured in extension code:
- Service ID: `service_zi7rghf`
- Public Key: `dXRu3TBvGNhECPyuB`
- Breach template: `template_n6m2wxk`
- Welcome template: `template_zgcsbzo`

Behavior:
- Welcome email on vault onboarding / first credential email capture
- Breach email on detected decoy-triggered events
- Test email from settings

## 4) Key implemented functions
## `background/service-worker.js`
- `makeDecoyVariants(username, password, count)`
  - Creates decoy username/password variants.
- `registerDecoysWithHoneyServer(decoys, serviceName)`
  - Registers decoys with password hash only.
- `checkHoneyServerForBreach()`
  - Polls `/decoy/check`, creates breach events, triggers email.
- `triggerBreachTest()`
  - Sends simulated decoy login and performs immediate breach check.
- `sendBreachEmailIfConfigured(event, cloudData)`
  - Sends breach alert mail and logs success/failure.
- `addPassword`, `updatePassword`, `deletePassword`
  - Integrated decoy create/regenerate/remove lifecycle.
- `updateSettings`
  - Stores deception settings and restarts polling.
- Message routes:
  - `GET_DECOY_STATUS`
  - `CHECK_BREACH_NOW`
  - `TRIGGER_BREACH_TEST`

## `vault/vault.js`
- `loadSecurity()`
  - Loads breach alerts + decoy status and updates dashboard state.
- `checkBreachNow()`
  - On-demand breach check.
- `triggerBreachTest()`
  - Runs test and now shows real email-send outcome.
- Settings binding for deception and email config.

## `content/autofill.js`
- Save password prompt on submit/login click/Enter.
- Context invalidation handling with clear retry message.

## `honey-server/server.js`
- Token enforcement for protected endpoints.
- `/decoy/check` implementation aligned with extension payload.
- Root endpoint `/` added for status response.

## 5) Important fixes completed
1. Integrated friend’s branch concepts without destructive merge.
2. Added honey-server project into workspace.
3. Fixed extension/server API mismatch (`/decoy/check` and payload alignment).
4. Fixed security dashboard inconsistency:
- Top breach card now uses actual breach alert count.
5. Improved breach test UX:
- UI now reports actual email send state.
- Manual fallback breach test email path added.
6. Improved autofill error handling:
- Clear message when extension context is invalidated.
7. Render readiness:
- Server uses `PORT` and `0.0.0.0`.

## 6) Current known behavior
1. `No breach detected` means no new breach event since last check window.
2. `/decoys` may show historic test/demo rows from older users/runs.
3. Decoys currently use `user_id: "default"` from extension registration path.
4. Render file storage is ephemeral unless disk is configured.

## 7) Progress summary
## Completed
- Core vault + OTP + autofill
- Save prompt workflow
- Deception monitoring integration
- Honey server deployment on Render
- Breach detection dashboard
- Email test/welcome/breach alerts
- PIN verification for sensitive edits

## Pending/next recommended
1. Send real `user_id` from extension to honey server for clean multi-user separation.
2. Add "Register Decoys Now" action to re-register after server reset.
3. Add "Acknowledge/Clear Breach Alerts" UX.
4. Add Render persistent disk and set `HONEY_DATA_DIR=/var/data/casper-honey`.
5. Add security/audit endpoint for mail delivery diagnostics.
6. Add automated tests for decoy lifecycle + breach check flow.

## 8) Quick operational runbook
1. Verify server: `GET /health`.
2. In extension settings, verify URL + API key.
3. Add credential and check `Decoys: X/Y monitored`.
4. Trigger breach test.
5. Check logs:
- Extension `View Security Logs`
- Server `/alerts` with auth token

## 9) Definition of done for project demo
1. Save real password.
2. Show decoy generation and monitored count.
3. Simulate attacker login to honey server.
4. Show breach detection event in extension.
5. Show breach email delivery evidence.
