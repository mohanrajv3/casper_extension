# Trust Me Bro (with Casper)

Deception-based password vault extension with breach detection.

This project extends a browser password vault with **Casper-style decoy detection**:
- real credentials are stored for normal use
- decoy credentials are generated and registered to a honey server
- attacker usage of decoys triggers alerts
- extension surfaces alerts, risk score, and emergency controls

## What This Project Means

Traditional vaults focus on prevention (encrypt and store).  
This project adds **post-compromise detection**:
- if stolen credential material is misused, decoy hits create a strong breach signal
- user can move to containment quickly using one-click compromised mode

## Main Features

- Secure vault UX (browser extension workflow)
- Deception/honey credential flow
- Local or remote honey detection server
- Manual + auto breach checks
- One-click `Simulate Attack` demo button
- Risk Scoring Engine (score, severity, factors)
- Tamper-evident security logs (hash-chained events)
- One-click `Compromised Mode` (disable autofill + high alert state)
- Dark-mode readability fixes

## Repository Layout

- `casper-extension/` : main MV3 extension
- `honey-server/` : local detection backend for decoy registration and alerts
- `casper-safari-extension/` : safari-oriented prototype artifacts

## Architecture (High Level)

1. User adds real credential in extension.
2. Extension generates decoys and marks them separately.
3. Decoys are registered to honey server (`/decoy/register`).
4. Normal user login uses real credential only.
5. Attacker tries stolen data and may hit decoys (`/auth/login`).
6. Server records alert and exposes it via `/alerts`.
7. Extension checks alerts and updates security state/risk score.

## Requirements

- Node.js 18+ (recommended)
- Chromium-based browser (Chrome/Edge/Brave)

## Run Honey Server

```powershell
cd "E:\Aditya\Sem 8\casper_extension-main\casper_extension-main\honey-server"
node server.js
```

Default URL: `http://127.0.0.1:8787`

### Optional API token

```powershell
$env:HONEY_API_TOKEN="your-secret-token"
node server.js
```

If token is set here, set the same token in extension settings.

## Load Extension (Unpacked)

1. Open browser extensions page (`chrome://extensions` or `edge://extensions`)
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select:
   `E:\Aditya\Sem 8\casper_extension-main\casper_extension-main\casper-extension`

## Extension Settings (Recommended)

In Vault -> Settings -> Deception / Honey Server:
- `Honey Server Base URL`: `http://127.0.0.1:8787`
- `Honey Server API Token`: blank (or same token as server)
- `Enable Deception`: ON
- `Decoys per credential`: `2` or `3`
- `Auto-check honey alerts after unlock`: ON

## Step-by-Step Demo for Review Panel

### A. Normal Setup
1. Start honey server.
2. Open extension vault.
3. Add a real credential for a demo site.
4. Click `Register Pending Decoys`.
5. Click `Check Breach Now` -> should show no breach.

### B. One-Click Attack Demo
1. In security/deception section click `Simulate Attack`.
2. Click `Check Breach Now`.
3. Show reviewers:
   - breach detected state
   - risk score increased
   - new security event in logs

### C. Emergency Response Demo
1. Click `Activate Compromised Mode`.
2. Show that autofill/save prompts are disabled and security status changes.

## Manual Attacker Simulation (Optional)

```powershell
cd "E:\Aditya\Sem 8\casper_extension-main\casper_extension-main\honey-server"
node attacker-script.js --username "<decoy_username>" --password "<decoy_password>" --service "<domain>"
```

Then in extension click `Check Breach Now`.

## Honey Server API

- `POST /decoy/register`
- `GET /alerts?user_id=<id>&since=<optional_timestamp>`
- `POST /auth/login`
- `GET /decoys?user_id=<id>`
- `GET /health`

## Security Notes

- Server stores decoy password hashes, not plaintext decoy passwords.
- Prototype is for research/demo; production needs TLS, hardened auth, monitoring, backup policy, and access controls.

## Known Prototype Limitations

- Detection depends on attacker touching decoys.
- Basic backend policy logic (not enterprise SIEM integrated).
- Local demo deployment is not full production hardening.

## Troubleshooting

- If alerts are not appearing:
  - verify server is running at expected URL
  - ensure token mismatch is not happening
  - re-run `Register Pending Decoys`
- If UI text is hard to read:
  - reload extension after pulling latest branch (dark-mode fixes included)
- If push permissions fail:
  - ensure GitHub collaborator access is accepted for the active account

## Branch

Current working branch used for updates:
- `codex/casper-extension-final-review-v2`
