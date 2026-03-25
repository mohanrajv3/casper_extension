# DetectVault Performance Graphs (Report-ready)

## 1) Core Operations Latency (Mean, ms)

```mermaid
xychart-beta
  title "DetectVault Core Ops (Mean Latency)"
  x-axis ["Key Derivation","Encrypt 10","Encrypt 100","Encrypt 300","Decrypt 300","OTP Generate"]
  y-axis "Milliseconds" 0 --> 20
  bar [17.11,0.05,0.07,0.15,0.19,0.03]
```

## 2) Honey Server API Latency (Warm-state Mean, ms)

```mermaid
xychart-beta
  title "Honey Server API Latency (Warm-state Mean)"
  x-axis ["GET /health","GET /decoys"]
  y-axis "Milliseconds" 0 --> 600
  bar [282.31,291.82]
```

## 3) Honey Server API Distribution (P50 vs P95, ms)

```mermaid
xychart-beta
  title "Honey API Percentiles"
  x-axis ["/health P50","/health P95","/decoys P50","/decoys P95","/decoy/check P50","/decoy/check P95","/auth/login P50","/auth/login P95"]
  y-axis "Milliseconds" 0 --> 600
  bar [262.24,539.18,302.35,409.60,306.11,409.08,284.76,359.91]
```

## 4) OTP+Passkey Unification Comparison Scores

(Scale: 1 to 5; capability-fit scoring)

```mermaid
xychart-beta
  title "DetectVault vs 1Password (Capability-fit Scores)"
  x-axis ["Unified Surface","Deception Integration","Passkey Maturity","Enterprise Admin","Research Observability"]
  y-axis "Score" 0 --> 5
  bar [5,5,3,2,5]
  line [5,2,5,5,2]
```

Legend: `bar` = DetectVault, `line` = 1Password

## 5) Breach Detection Comparison Scores

(Scale: 1 to 5; capability-fit scoring)

```mermaid
xychart-beta
  title "DetectVault vs Canary Tokens (Capability-fit Scores)"
  x-axis ["Vault Context Coupling","Broad Tripwire Coverage","In-product Response","Standalone Deployment","Controlled Demo Suitability"]
  y-axis "Score" 0 --> 5
  bar [5,3,5,2,5]
  line [2,5,2,5,4]
```

Legend: `bar` = DetectVault, `line` = Canary Tokens

## 6) Optional CSV for external plotting (Excel/Sheets)

```csv
metric,mean_ms,p50_ms,p95_ms
key_derivation,17.11,16.42,23.81
encrypt_10_entries,0.05,0.02,0.06
encrypt_100_entries,0.07,0.06,0.12
encrypt_300_entries,0.15,0.14,0.24
decrypt_300_entries,0.19,0.18,0.30
otp_generate,0.03,0.02,0.05
health_warm,282.31,262.24,539.18
decoys_warm,291.82,302.35,409.60
decoy_check,307.17,306.11,409.08
auth_login,279.69,284.76,359.91
```
