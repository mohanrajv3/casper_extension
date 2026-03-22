# DetectVault Comparison Notes (For Reviewer Q&A)

## 1) OTP + Passkey Unification: DetectVault vs 1Password

### What DetectVault does
- Single extension surface for:
  - Password vault
  - OTP authenticator (TOTP/HOTP)
  - Passkey metadata + monitoring integration
- Security dashboard correlates auth signals with breach/warning telemetry.
- Good for project/demo focus where auth + deception response are shown together.

### What 1Password does better (production maturity)
- Stronger ecosystem maturity and cross-platform polish.
- Broader native passkey lifecycle coverage and enterprise admin controls.
- More extensive production hardening, device trust integrations, and support operations.

### Key positioning statement
- `1Password` is a mature commercial password/passkey platform.
- `DetectVault` focuses on **unified auth + deception detection research workflow** in one extension UI.

## 2) Breach Detection: DetectVault vs Canary Tokens

### Similarity
- Both rely on deception/honey artifacts to create **high-signal alerts** when touched/used.

### DetectVault approach
- Decoys are linked to vault entries and monitored via controlled endpoints.
- Alerts are shown in-product with:
  - Per-site risk summary
  - Breach/warning timelines
  - Response guide workflow
- Integrates directly with stored credential context (site + account in vault).

### Canary Tokens approach
- General-purpose decoy artifacts (URLs/files/strings/emails) for broad tripwire coverage.
- Very useful for infrastructure/document/data exfiltration signals.
- Not inherently coupled to vault credential lifecycle unless custom integration is built.

### Key positioning statement
- `Canary Tokens` = broad standalone tripwire system.
- `DetectVault` = **vault-native deception telemetry** tied to credential/passkey operations and user response flow.

## Reviewer-safe claim language
- DetectVault demonstrates real-time detection on **monitored endpoints under project control**.
- It does **not** claim direct instrumentation of third-party production login backends.
