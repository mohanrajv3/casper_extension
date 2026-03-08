# CASPER Authenticator + Vault Full Feature Test Guide

## 1) Objective
Validate all implemented capabilities end-to-end with expected outputs and purpose.

## 2) Environment setup
1. Load extension from `/Users/mohan/casper_web_extension/casper-extension`.
2. Start dummy backend:
```bash
cd /Users/mohan/casper_web_extension/dummy-site
node server.js
```
3. In extension Settings, set:
- Honey Server URL: `http://127.0.0.1:8790`
- Honey API key if enabled

## 3) Setup and onboarding
### Steps
1. Create vault with PIN.
2. Provide alert email.
3. Record displayed recovery codes.

### Expected
- Vault initializes.
- Recovery codes appear.
- Welcome email path works.

### Why
Confirms secure bootstrap and account recovery readiness.

## 4) Register flow + save prompt
### Steps
1. Open `http://127.0.0.1:8790/register`.
2. Create account.

### Expected
- CASPER prompts to save credential after successful register.
- Credential appears in vault.

### Why
Validates result-aware save behavior.

## 5) Login flow tests
### A) Success login
1. Open `/login` and login with correct password.
2. CASPER may prompt save/update if changed.

Expected: success redirect to dashboard.

### B) Wrong password login
1. Enter wrong password and submit.

Expected:
- No forced save/update popup for failed auth.
- Security warning event is logged.
- Warning/breach card updates after `Check Breach Now`.

### Why
Validates attack-signal path without corrupting stored credentials.

## 6) Password vault tests
1. Add password manually from vault modal.
2. Edit entry (requires PIN step-up).
3. Delete entry (requires PIN step-up).

Expected: CRUD works and security controls enforced.

## 7) Autofill tests
1. Open login page with saved entry.
2. Click `Fill with CASPER`.

Expected: fields populated correctly.

## 8) OTP tests
1. Add OTP via otpauth URI.
2. Add OTP manually.
3. Use `✅` verify action with valid and invalid codes.
4. For HOTP, increment counter.

Expected: proper code generation and verification behavior.

## 9) Auth hardening tests
1. Lock vault.
2. Enter wrong PIN up to threshold.

Expected:
- Lockout active
- Auth Status shows countdown and attempts left

## 10) Decoy and breach tests
1. Confirm monitored decoy count in Security card.
2. Click `Show Decoys (Dev)` (PIN-gated) and note one decoy.
3. Use decoy on dummy login page.
4. Click `Check Breach Now`.
5. Open `View Breach Details`.

Expected:
- Breach alert increments
- Decoy details, service, and time visible
- Email alert path triggered

## 11) Security response guide test
1. Click `Security Response Guide`.
2. Verify guideline page opens with immediate and containment steps.

Expected: actionable incident workflow is available in-app.

## 12) Final acceptance checklist
1. Vault setup/unlock: pass
2. Recovery codes: pass
3. Save/update/autofill: pass
4. OTP add/verify: pass
5. Lockout/rate-limit: pass
6. Decoy registration and monitoring: pass
7. Wrong-password warning detection: pass
8. Breach details modal + response guide: pass
9. Email notifications: pass
