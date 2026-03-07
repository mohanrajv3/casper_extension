# CASPER Browser Extension

CASPER is a browser extension password vault + authenticator (TOTP/HOTP) with breach-alert email hooks.

## Documentation
- User Guide: [USER_GUIDE.md](/Users/mohan/casper_web_extension/casper-extension/USER_GUIDE.md)
- Install Guide: [INSTALL.md](/Users/mohan/casper_web_extension/casper-extension/INSTALL.md)
- Technical Status / Architecture / Progress: [PROJECT_TECHNICAL_STATUS.md](/Users/mohan/casper_web_extension/PROJECT_TECHNICAL_STATUS.md)

## Features
- Encrypted vault protected by CASPER flow (PIN + secret selection + derived key)
- Password storage and autofill
- Save-password prompt on login form submit
- Authenticator accounts (otpauth URI or manual Base32)
- Security step-up verification (re-enter PIN) for edit/delete actions
- EmailJS welcome and breach alert emails
- Breach test button from Security screen

## Email behavior
EmailJS service/template/public keys are configured in code. Users only provide an alert email.

- Welcome email: sent on vault create (if alert email provided) and on first credential save using an email username
- Breach email: sent on detected breach events and manual breach test

## Project Structure
- `background/`: runtime core (CASPER crypto, sync, messaging)
- `content/`: autofill + page security events
- `popup/`: setup/unlock/quick actions
- `vault/`: full vault/authenticator/security/settings UI

## Notes
- If `chrome.storage.sync` quota is exceeded, CASPER falls back to `chrome.storage.local` automatically.
- Keep your PIN secret; PIN is required for unlock and sensitive operations.
