# DetectVault Graphs For Report

## Graph 1: Core Operations Latency (Mean, ms)

```mermaid
xychart-beta
  title "DetectVault Core Ops (Mean Latency)"
  x-axis ["Key Derivation","Encrypt 10","Encrypt 100","Encrypt 300","Decrypt 300","OTP Generate"]
  y-axis "Milliseconds" 0 --> 20
  bar [17.11,0.05,0.07,0.15,0.19,0.03]
```

## Graph 2: Honey Server API Latency (Warm-state Mean, ms)

```mermaid
xychart-beta
  title "Honey Server API Latency (Warm-state Mean)"
  x-axis ["GET /health","GET /decoys"]
  y-axis "Milliseconds" 0 --> 600
  bar [282.31,291.82]
```

## Graph 3: Honey API Percentiles (P50 vs P95)

```mermaid
xychart-beta
  title "Honey API Percentiles"
  x-axis ["/health P50","/health P95","/decoys P50","/decoys P95","/decoy/check P50","/decoy/check P95","/auth/login P50","/auth/login P95"]
  y-axis "Milliseconds" 0 --> 600
  bar [262.24,539.18,302.35,409.60,306.11,409.08,284.76,359.91]
```

## Graph 4: OTP + Passkey Unification (DetectVault vs 1Password)

(Score scale: 1 to 5; capability-fit scoring)

```mermaid
xychart-beta
  title "DetectVault vs 1Password"
  x-axis ["Unified Surface","Deception Integration","Passkey Maturity","Enterprise Admin","Research Observability"]
  y-axis "Score" 0 --> 5
  bar [5,5,3,2,5]
  line [5,2,5,5,2]
```

Legend: `bar` = DetectVault, `line` = 1Password

## Graph 5: Breach Detection (DetectVault vs Canary Tokens)

(Score scale: 1 to 5; capability-fit scoring)

```mermaid
xychart-beta
  title "DetectVault vs Canary Tokens"
  x-axis ["Vault Context Coupling","Broad Tripwire Coverage","In-product Response","Standalone Deployment","Controlled Demo Suitability"]
  y-axis "Score" 0 --> 5
  bar [5,3,5,2,5]
  line [2,5,2,5,4]
```

Legend: `bar` = DetectVault, `line` = Canary Tokens
