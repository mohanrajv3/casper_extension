# DetectVault Performance Evaluation (Experimental)

Run date: 2026-03-25  
Environment: macOS arm64, Node v25.2.1

## 1) Experimental Setup

### Measured (actual experiments)
- Local cryptographic pipeline from `casper-extension/background/casper-core.js`
- Local OTP code generation (TOTP)
- Remote deployed honey server latency on Render:
  - `https://casper-extension.onrender.com`

### Not experimentally benchmarked (comparative matrix only)
- 1Password (commercial black-box product)
- Canary Tokens (external service model)

For those two, tables below are **feature-fit comparisons**, not latency benchmarks.

---

## 2) DetectVault Core Performance (Measured)

### 2.1 Crypto + OTP timing (milliseconds)

| Operation | N | Mean (ms) | P50 (ms) | P95 (ms) | Max (ms) |
|---|---:|---:|---:|---:|---:|
| Key derivation (PIN+secret -> AES key) | 20 | 17.11 | 16.42 | 23.81 | 23.81 |
| Vault encrypt (10 entries) | 40 | 0.05 | 0.02 | 0.06 | 1.03 |
| Vault encrypt (100 entries) | 30 | 0.07 | 0.06 | 0.12 | 0.20 |
| Vault encrypt (300 entries) | 20 | 0.15 | 0.14 | 0.24 | 0.24 |
| Vault decrypt (300 entries) | 20 | 0.19 | 0.18 | 0.30 | 0.30 |
| OTP generation (TOTP) | 80 | 0.03 | 0.02 | 0.05 | 0.52 |

### 2.2 Against project targets

| Target | Requirement | Measured | Status |
|---|---:|---:|---|
| Key derivation | < 100 ms | 17.11 ms mean | PASS |
| Vault encryption | < 200 ms | 0.15 ms (300 entries) | PASS |
| Vault decryption | < 200 ms | 0.19 ms (300 entries) | PASS |
| OTP generation UX impact | near-instant | 0.03 ms mean | PASS |

---

## 3) Honey Server / Detection API Performance (Measured)

### 3.1 Remote latency on deployed server (ms)

| Endpoint | N | Mean (ms) | P50 (ms) | P95 (ms) | Max (ms) |
|---|---:|---:|---:|---:|---:|
| `GET /health` (includes cold sample run) | 25 | 1149.63 | 301.56 | 703.16 | 21456.59 |
| `GET /decoys` | 20 | 286.69 | 297.65 | 429.26 | 429.26 |
| `POST /decoy/check` | 20 | 307.17 | 306.11 | 409.08 | 409.08 |
| `POST /auth/login` | 20 | 279.69 | 284.76 | 359.91 | 359.91 |

### 3.2 Warm-state (cold-start removed) for report fairness

| Endpoint | N | Mean (ms) | P50 (ms) | P95 (ms) | Max (ms) |
|---|---:|---:|---:|---:|---:|
| `GET /health` (warm) | 20 | 282.31 | 262.24 | 539.18 | 539.18 |
| `GET /decoys` (warm) | 20 | 291.82 | 302.35 | 409.60 | 409.60 |

Observation: The very high max in initial `/health` reflects Render cold-start behavior; steady-state is ~250–400 ms class.

---

## 4) Comparison Table for Reviewer Q&A (Report-ready)

## 4.1 OTP + Passkey Unification: DetectVault vs 1Password

Scoring scale: 1 (low) to 5 (high).  
**These are capability-fit scores, not measured runtime benchmarks.**

| Dimension | DetectVault | 1Password | Notes |
|---|---:|---:|---|
| Single-surface vault + OTP + passkey | 5 | 5 | Both unify user auth artifacts in one product surface. |
| Native deception telemetry integration | 5 | 2 | DetectVault directly links decoys to vault workflows; 1Password is not deception-first. |
| Passkey lifecycle maturity (production breadth) | 3 | 5 | 1Password has stronger product maturity and ecosystem coverage. |
| Enterprise administration depth | 2 | 5 | 1Password is enterprise-grade with mature admin/policy tooling. |
| Research/demo observability for breach workflows | 5 | 2 | DetectVault emphasizes observable security-signal flow for controlled demos. |

## 4.2 Breach Detection: DetectVault vs Canary Tokens

Scoring scale: 1 (low) to 5 (high).  
**Capability-fit scoring, not latency benchmarking.**

| Dimension | DetectVault | Canary Tokens | Notes |
|---|---:|---:|---|
| Vault-native credential/passkey context coupling | 5 | 2 | DetectVault events map directly to vault entries/site risk cards. |
| General-purpose broad tripwire coverage | 3 | 5 | Canary Tokens are designed for broad external tripwires. |
| In-product response workflow integration | 5 | 2 | DetectVault includes dashboard, logs, and response guide in extension UI. |
| Ease of standalone deployment for generic assets | 2 | 5 | Canary Tokens are lightweight and service-focused for generic decoys. |
| Controlled monitored-endpoint demo suitability | 5 | 4 | Both can be shown in controlled environments; DetectVault is vault-centric. |

---

## 5) Reviewer-safe Claim Language

- DetectVault demonstrates real-time detection on **monitored endpoints under project control**.
- DetectVault does **not** claim direct instrumentation of third-party production login backends.

---

## 6) Reproducibility Commands

### Crypto/OTP benchmark
```bash
node /Users/mohan/casper_web_extension/perf_crypto_only.mjs
```

### Remote API benchmark (deployed honey server)
```bash
node /Users/mohan/casper_web_extension/perf_api_remote.mjs
```
