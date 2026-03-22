# DetectVault User Guide (Latest)

## What DetectVault provides
1. Password vault
2. OTP authenticator (TOTP/HOTP)
3. Autofill + save/update prompts
4. Decoy-based breach detection
5. Auth hardening (PIN step-up, lockout, recovery codes)
6. Email alerts and security logs

## Daily workflow
1. Unlock vault with PIN.
2. On login pages, use `Fill with DetectVault`.
3. On successful register/login (dummy site) DetectVault prompts to save/update credentials.
4. Manage passwords in Vault -> Passwords.
5. Manage OTP accounts in Vault -> Passkeys.

## Security dashboard usage
Open Vault -> Security:
1. Breach Detection card: shows active alerts.
2. Vault Status: password count, sync time, failed unlock count.
3. Auth Status: attempts left + lockout timer.
4. Trap Keys card: monitored decoy counts.

Buttons:
1. `Check Breach Now` -> manual on-demand fetch for new decoy events.
2. `View Breach Details` -> detailed event list (time, service, decoy, IP).
3. `Security Response Guide` -> incident response checklist.
4. `Show Decoys (Dev)` -> PIN-gated demo-only plaintext decoy viewer.
5. `Clear Site Alerts` / `Clear All Alerts` -> PIN-gated historical alert cleanup.
6. Site Risk Summary -> per-service breakdown (credentials, decoys, breaches, warnings, last event).

## Settings overview
### Security
- Auto-lock duration
- Max unlock attempts
- Lockout duration
- OTP default validity (30/60 sec)
- OTP grace windows
- Recovery codes view/regenerate

### Deception Monitoring
- Enable monitoring
- Honey server URL
- API token
- Decoys per credential
- Poll interval

### Email
- Alert email
- Send test email

## OTP usage
1. Add from `otpauth://` URI or manual input.
2. Copy code with one click.
3. Use `✅` button to verify OTP correctness.
4. HOTP accounts can increment counter.

## Recovery codes
1. Generated at vault setup.
2. Can be regenerated from Settings (PIN verification required).
3. Store offline securely.

## Important behavior notes
1. `No new breach events` can still appear while old alerts remain in dashboard.
2. Wrong-password attempts on dummy login create warning alerts immediately (no manual check required).
3. Security dashboard auto-refreshes while Security tab is open (~4 seconds).
4. Warning mail is site-scoped (one send per site until site alerts are cleared).
5. For extension updates, reload site tab if context invalidation warning appears.
6. `Check Breach Now` is still useful to pull fresh decoy events from backend instantly.
7. Use `Clear Site Alerts` after password rotation to reset that site's warning mail gate.
