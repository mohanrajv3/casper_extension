# Install DetectVault Extension

## 1) Load extension (Chrome/Edge)
1. Open `chrome://extensions` or `edge://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select folder: `/Users/mohan/casper_web_extension/casper-extension`.
5. Pin the extension.

## 2) First setup
1. Open popup.
2. Create PIN (4-6 digits).
3. Add alert email.
4. Save recovery codes shown after initialization.

## 3) Configure monitoring backend
Choose one:
1. Render honey server (hosted)
2. Local dummy fitness site backend (recommended for review demo)

For local dummy backend:
```bash
cd /Users/mohan/casper_web_extension/dummy-site
node server.js
```
Use URL: `http://127.0.0.1:8790`

## 4) Configure DetectVault settings
In Vault -> Settings:
1. Enable honeytoken monitoring.
2. Set `Honey Server URL`.
3. Set `Honey Server API Key` if token enabled.
4. Set decoy count and poll interval.
5. Set lockout + OTP policy values.

## 5) Verify installation
1. Add one password.
2. Check Security shows monitored decoys.
3. Send test email.
4. Trigger breach test.
5. Open `View Breach Details`.
