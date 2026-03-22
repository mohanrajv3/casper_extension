# DetectVault Final Review Demo Script (With Speaking Content)

## 1) Opening (30 sec)
Speak:
"Good morning. Our project is DetectVault: a browser extension that combines a password vault, OTP authenticator, and deception-based breach detection. The unique part is that we do not only store credentials securely, we also generate detectable signals when decoy data is misused."

## 2) Problem framing (30 sec)
Speak:
"Traditional vaults protect secrets but may not provide clear evidence when leaked data is probed. DetectVault adds monitored decoys and alert telemetry to detect suspicious activity in a controlled auth environment."

## 3) Architecture slide explanation (45 sec)
Speak:
"We have three layers:
1. Extension for vault, OTP, and UI.
2. DetectVault decoy logic in background service worker.
3. Controlled backend (dummy fitness website) that records decoy and wrong-password events."

## 4) Demo flow (show + speak)

### Demo A: Setup and onboarding
Action:
1. Open popup.
2. Create PIN.
3. Show recovery codes.

Speak:
"During setup, DetectVault initializes encrypted vault state and generates recovery codes for incident handling."

### Demo B: Register page + save prompt
Action:
1. Open `http://127.0.0.1:8790/register`.
2. Create account.
3. Confirm DetectVault save prompt.

Speak:
"We intentionally prompt save only after successful auth actions on the demo site."

### Demo C: Login and autofill
Action:
1. Go to `/login`.
2. Use `Fill with DetectVault`.
3. Sign in and show dashboard.

Speak:
"This demonstrates low-friction login using stored encrypted credentials."

### Demo D: Wrong-password detection
Action:
1. Use wrong password on login page.
2. Keep Security tab open and wait for auto-refresh.
3. Open Site Risk Summary row for `dummy-auth.local`.

Speak:
"Wrong-password attempts are captured as warning-grade events, surfaced automatically, and mapped to the affected site in the risk summary."

### Demo E: Decoy breach detection
Action:
1. Click `Show Decoys (Dev)` and note one decoy credential.
2. Try that decoy on `/login`.
3. Click `Check Breach Now` (fast manual pull) if auto-refresh has not updated yet.
4. Open `View Breach Details`.

Speak:
"This is the main DetectVault signal: decoy usage creates measurable breach evidence with timestamp, service, and source metadata."

### Demo F: OTP authenticator
Action:
1. Add TOTP account.
2. Show rotating code and verify using `✅`.

Speak:
"DetectVault also functions as an authenticator with policy controls for OTP period and grace windows."

### Demo G: Lockout controls
Action:
1. Show Auth Status card.
2. Demonstrate attempts-left and lockout timer behavior.

Speak:
"This protects against brute-force PIN attempts in extension context."

### Demo H: Incident response
Action:
1. Click `Security Response Guide`.

Speak:
"We included in-product incident steps so users know exactly what to do after warnings or breach alerts."

## 5) Key reviewer clarifications
Speak:
"Detection on third-party production backends like Instagram is outside extension-only scope. Our claim is controlled real-time detection on monitored endpoints, which is fully demonstrated here."

## 6) Comparison answers (from likely reviewer questions)

### Q1: "How is your OTP + passkey unification different from 1Password?"
Speak:
"1Password is a production-grade commercial platform with broader ecosystem maturity. Our DetectVault focus is different: we unify password vault, OTP authenticator, passkey tracking, and deception telemetry in one academic-security workflow. The key differentiator is integration with breach-warning signals and response flow, not trying to replace 1Password’s enterprise product depth."

### Q2: "How is your breach detection different from canary tokens?"
Speak:
"Canary tokens are general-purpose tripwires. DetectVault uses vault-linked decoys tied to specific credential and passkey contexts, then maps events directly into site-level risk summaries and user response actions inside the extension. So canary tokens are broad standalone decoys, while DetectVault is vault-native deception monitoring."

## 7) Closing (20 sec)
Speak:
"DetectVault delivers a practical authenticator-plus-vault with deception-enhanced security telemetry. The project demonstrates secure storage, usable MFA, attack signal generation, and actionable incident response in one integrated extension."
