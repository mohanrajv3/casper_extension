# CASPER Simple Feature Guide (Popup + Vault)

This is a quick practical guide for demo use.

## 1) Popup (small extension window)
- `Unlock`: Enter PIN and unlock vault.
- `Autofill`: Fills current page login form if credential exists.
- `Add Password`: Save a new credential for current site.
- `Generate`: Generates a strong password and copies it.
- `Open Vault`: Opens full dashboard.
- `Settings`: Opens full dashboard directly to `Settings`.
- `Lock`: Locks vault immediately.

## 2) Vault sidebar sections
- `Passwords`: View, search, add, edit, delete credentials.
- `Passkeys` (Authenticator): Add/manage TOTP/HOTP accounts.
- `Secure Notes`: Placeholder section in this demo build.
- `Generator`: Create strong passwords with length/options.
- `Security`: Breach dashboard, alerts, incident tools.
- `Settings`: Security policy, autofill/sync, deception config, email.

## 3) Password actions
- `Add Password`: Requires URL + username + password.
- `Edit Password`: PIN step-up verification required.
- `Delete Password`: PIN step-up verification required.
- `Copy`: Copies username/password safely when clicked.

## 4) Recovery Codes (what and why)
- Recovery codes are backup unlock codes for emergency access.
- Generated during initial setup.
- Stored as hashes (not plaintext) in vault data.
- Use them when PIN is forgotten or lockout recovery is needed.
- `View Recovery Codes`: PIN verification required.
- `Regenerate Recovery Codes`: Invalidates previous codes.
- Best practice: store offline (paper or encrypted offline file).

## 5) Generator
- Use in popup (`Generate`) or full `Generator` section.
- Configure length, uppercase/lowercase/numbers/symbols.
- Copy generated output and use for account signup/reset.

## 6) Security dashboard buttons
- `Change PIN`: Re-keys vault to new PIN.
- `Trigger Breach Test`: Sends breach test signal/email.
- `Check Breach Now`: Manual immediate decoy check pull.
- `View Breach Details`: Shows service/time/IP/source entries.
- `Show Decoys (Dev)`: Demo-only plaintext decoy view (PIN-gated).
- `Clear Site Alerts`: Clears alerts for one service.
- `Clear All Alerts`: Clears all historical alerts.
- `Security Response Guide`: Opens incident response page.
- `View Security Logs`: Shows latest local security events.

## 7) Settings options (full dashboard)
### Security
- Auto-lock duration
- Max unlock attempts
- Lockout duration
- OTP default validity and grace windows
- Recovery code controls

### Autofill
- Enable/disable automatic filling.
- Enable/disable save prompts.

### Sync
- Toggle cloud sync behavior.

### Deception Monitoring
- Enable monitoring
- Honey server URL + API key
- Decoy count per credential
- Poll interval

### Email Alerts
- Alert recipient email
- Send test email

## 8) Demo-safe truth for reviewers
- Third-party backend detection (Instagram server internals) is out of scope.
- CASPER detection claim is valid for monitored endpoints (dummy/honey server path).
- Wrong-password events and decoy events are surfaced in Security dashboard.

## 9) Quick smoke test sequence
1. Unlock from popup.
2. Open `Settings` from popup (should open full vault settings page).
3. Add one password in vault.
4. Edit then delete it (PIN prompt must be masked).
5. View recovery codes (PIN prompt must be masked).
6. Open `Security` and run `Check Breach Now`.
7. Open `Generator` and copy generated password.
