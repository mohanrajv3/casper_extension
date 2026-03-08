# CASPER Honey Server (Local)

This is the standalone deception monitoring backend.

## Recommendation
For reviewer demo with realistic UX, prefer:
- [/Users/mohan/casper_web_extension/dummy-site/README.md](/Users/mohan/casper_web_extension/dummy-site/README.md)

Use this honey server when you want a minimal API-only backend.

## Endpoints
- `POST /decoy/register`
- `POST /decoy/check`
- `POST /auth/login`
- `GET /alerts`
- `GET /decoys`
- `GET /health`
- `GET /`

## Run
```bash
cd /Users/mohan/casper_web_extension/honey-server
node server.js
```

Default URL: `http://127.0.0.1:8787`

## Optional token
```bash
export HONEY_API_TOKEN="your-secret-token"
node server.js
```

If token is enabled, set same value in extension `Honey Server API Key`.

## Notes
- Stores only password hashes for decoys.
- Designed for controlled detection workflows, not third-party backend integration.
