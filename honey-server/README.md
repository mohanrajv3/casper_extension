# CASPER Honey Server (Local)

This is the deception monitoring backend used by the extension.

## Endpoints
- `POST /decoy/register`
  - Body: `{ decoy_id, username, password_hash, service_name, user_id? }`
- `POST /decoy/check`
  - Body: `{ decoy_ids: string[], last_checked_at?: number }`
  - Response: `{ breach_detected, events[] }`
- `POST /auth/login` (attacker simulation target)
  - Body: `{ username, password, service_name? }`
- `GET /alerts?user_id=<id>&since=<ts>` (debug/manual checks)
- `GET /decoys?user_id=<id>` (debug)
- `GET /health`

## Run
```bash
cd /Users/mohan/casper_web_extension/honey-server
node server.js
```

Default URL: `http://127.0.0.1:8787`

## Optional API token
```bash
export HONEY_API_TOKEN="your-secret-token"
node server.js
```

If token is enabled, set the same token in extension settings (`Honey Server API Key`).

## Demo flow
1. Start server: `node honey-server/server.js`
2. In extension Settings, configure:
   - `Honey Server URL = http://127.0.0.1:8787`
   - `Enable honeytoken monitoring = true`
3. Add a password in vault (decoys are generated + registered).
4. Trigger attacker simulation:
```bash
node honey-server/attacker-script.js --username "<decoy_username>" --password "<decoy_password>" --service "<domain>"
```
5. In extension Security tab, click `Check Breach Now`.

## Storage
- File: `honey-server/data/store.json`
- Server stores only password hashes (`SHA-256 hex`), never plaintext decoy passwords.
