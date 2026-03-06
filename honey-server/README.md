# CASPER Local Honey Server

This server provides the endpoints your extension uses for decoy registration and breach detection.

## Endpoints
- `POST /decoy/register`
- `GET /alerts?user_id=<id>&since=<timestamp_optional>`
- `POST /auth/login` (attacker simulation target)
- `GET /decoys?user_id=<id>` (debug)
- `GET /health`

## Run
```powershell
cd "E:\Aditya\Sem 8\casper_extension-main\casper_extension-main\honey-server"
node server.js
```

By default it runs at `http://127.0.0.1:8787`.

## Optional auth token
If you want auth between extension and server:
```powershell
$env:HONEY_API_TOKEN="your-secret-token"
node server.js
```
Then set the same token in extension settings under `Honey Server API Token`.

## Extension settings to use
- `Honey Server Base URL`: `http://127.0.0.1:8787`
- `Auto-check honey alerts after unlock`: enabled (recommended)
- `Decoys per credential`: `2` or `3`

## Demo flow
1. Run server (`node server.js`).
2. In extension settings, save honey server URL.
3. Add a password in vault.
4. Click `Register Pending Decoys`.
5. Trigger a decoy login using attacker script:
```powershell
cd "E:\Aditya\Sem 8\casper_extension-main\casper_extension-main\honey-server"
node attacker-script.js --username "<decoy_username>" --password "<decoy_password>" --service "<domain>"
```
6. In extension Security tab, click `Check Breach Now`.

## Data storage
Data is stored in:
- `honey-server/data/store.json`

No plaintext decoy passwords are persisted server-side; only `password_hash` is stored.
