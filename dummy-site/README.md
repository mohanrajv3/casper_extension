# CASPER Dummy Fitness Website + Detection Backend

This folder provides a controlled multi-page website for final review demos.

## Website pages
- `/` Home
- `/register` Create account
- `/login` Login page
- `/workouts` Content page
- `/dashboard` Post-login demo page

## APIs
### Public
- `POST /auth/register`
- `POST /auth/login`
- `GET /health`

### Protected (Bearer token if enabled)
- `POST /decoy/register`
- `POST /decoy/check`
- `GET /alerts`
- `GET /decoys`

## Run
```bash
cd /Users/mohan/casper_web_extension/dummy-site
node server.js
```
Default URL: `http://127.0.0.1:8790`

Optional token:
```bash
export HONEY_API_TOKEN="your-token"
node server.js
```

## Demo sequence
1. Configure extension Honey URL = `http://127.0.0.1:8790`.
2. Open `/register`, create account.
3. Confirm CASPER save prompt appears.
4. Open `/login`:
- test valid login
- test wrong password (warning event path)
- test decoy credentials (breach path)
5. In extension Security:
- `Check Breach Now`
- `View Breach Details`
- `Security Response Guide`

## Notes
- This is the recommended reviewer demo environment.
- Third-party backend auth detection is not the scope of extension-only architecture.
