# CASPER Extension User Guide

## 1) What CASPER does
CASPER is a browser extension that combines:
- Password vault
- Authenticator (TOTP/HOTP)
- Autofill
- Deception-based breach detection (decoys + honey server)
- Email alerts (welcome + breach)

## 2) Install and open
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select folder: `/Users/mohan/casper_web_extension/casper-extension`.
5. Pin the extension icon.

## 3) First-time setup
1. Open extension popup.
2. Create a PIN (4-6 digits).
3. Add alert email (recommended).
4. Unlock vault.

## 4) Configure honey server (Render)
1. Open full vault page -> `Settings`.
2. Under `Deception Monitoring`:
- Enable honeytoken monitoring
- Honey Server URL: `https://casper-extension.onrender.com`
- Honey Server API Key: your `HONEY_API_TOKEN`
- Decoys per credential: `3` (recommended)
- Poll interval: `60 seconds`
3. Click save.

## 5) Configure email alerts
In `Settings`:
- Set `Alert Email` to your email.
- Click `Send Test Email`.
- Check inbox + spam.

## 6) Daily use flow
1. Visit login page.
2. Click `Fill with CASPER` to autofill.
3. When entering new credentials, CASPER prompts to save.
4. Confirm save.

## 7) Edit/delete protection
When editing or deleting saved passwords, CASPER asks for PIN re-verification before applying changes.

## 8) Authenticator use
1. Open `Passkeys` section.
2. Add account using otpauth URI or manual secret.
3. CASPER displays current TOTP/HOTP code.

## 9) Breach detection behavior
When a password is saved:
1. CASPER stores real credential.
2. CASPER generates decoys.
3. CASPER registers decoys on honey server.
4. If decoy is used, honey server logs event.
5. CASPER `Check Breach Now` shows alert and sends breach email.

`No breach detected` means no new decoy-trigger event since last check.

## 10) Common issues
### A) "Extension context invalidated"
Cause: extension updated/reloaded while tab is still old context.  
Fix: reload the website tab once and retry autofill.

### B) `Unauthorized` from honey server
Cause: token missing/wrong.  
Fix: set the exact same token in:
- Render env: `HONEY_API_TOKEN`
- Extension setting: `Honey Server API Key`

### C) Breach test says complete but no mail
Open `Security -> View Security Logs`.  
Look for `mail_failed` and check error text.

## 11) Verification checklist
1. Health endpoint works: `https://casper-extension.onrender.com/health`.
2. Test email reaches inbox.
3. Add password creates monitored decoys.
4. `Trigger Breach Test` shows breach and mail result.
5. Security dashboard updates breach status consistently.
