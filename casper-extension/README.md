# DetectVault Browser Extension

DetectVault is a browser extension that combines a secure password vault, OTP authenticator, and deception-based breach detection.

## Documentation Index
- User Guide: [/Users/mohan/casper_web_extension/casper-extension/USER_GUIDE.md](/Users/mohan/casper_web_extension/casper-extension/USER_GUIDE.md)
- Install Guide: [/Users/mohan/casper_web_extension/casper-extension/INSTALL.md](/Users/mohan/casper_web_extension/casper-extension/INSTALL.md)
- Full Feature Test Guide: [/Users/mohan/casper_web_extension/AUTHENTICATOR_FEATURE_TEST_GUIDE.md](/Users/mohan/casper_web_extension/AUTHENTICATOR_FEATURE_TEST_GUIDE.md)
- Reviewer Speaking Script: [/Users/mohan/casper_web_extension/REVIEWER_PRESENTATION_SCRIPT.md](/Users/mohan/casper_web_extension/REVIEWER_PRESENTATION_SCRIPT.md)
- Technical Status: [/Users/mohan/casper_web_extension/PROJECT_TECHNICAL_STATUS.md](/Users/mohan/casper_web_extension/PROJECT_TECHNICAL_STATUS.md)
- Dummy Fitness Site Demo: [/Users/mohan/casper_web_extension/dummy-site/README.md](/Users/mohan/casper_web_extension/dummy-site/README.md)

## Current Feature Set
- Encrypted vault with DetectVault secret-selection and derived key encryption
- Password save/update/autofill flows
- OTP authenticator support (TOTP/HOTP)
- OTP verify action with grace-window policy
- PIN step-up verification for sensitive actions
- Recovery codes generation and regeneration
- Unlock rate-limit and lockout controls
- Auth Status card (attempts left + lockout countdown)
- Decoy generation and honey server registration
- Breach details modal with event metadata
- Wrong-password warning handling from dummy login site
- Site Risk Summary (per-service breaches/warnings)
- Alert cleanup controls (`Clear Site Alerts`, `Clear All Alerts`)
- Welcome/test/breach email paths (EmailJS)

## Important Scope Note
- Direct detection from third-party production backends (for example Instagram servers) is out of scope for extension-only architecture.
- DetectVault demonstrates controlled deception monitoring through honey/dummy endpoints where telemetry is available.

## Quick Start
1. Load extension unpacked from `/Users/mohan/casper_web_extension/casper-extension`.
2. Create vault PIN and save recovery codes.
3. Configure honey/dummy server URL in Settings.
4. Add credentials and verify decoy monitoring in Security tab.
5. Use wrong-password and decoy tests on dummy site, then inspect Security tab updates.
