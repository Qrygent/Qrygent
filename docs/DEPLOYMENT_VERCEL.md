# Deploying Qrygent on Vercel (All-in-One: Frontend + Serverless PQC Verifier + Upstash Redis)

Qrygent deploys from the repository root as a single Vercel project serving:
- **React + Vite Frontend** (`frontend/dist`) at `https://<your-app>.vercel.app/*`
- **ML-DSA-65 PQC Verifier API** (`api/v1.ts` wrapping `pqc-service/`) at `https://<your-app>.vercel.app/v1/*` (same origin — zero CORS errors)
- **Measured Benchmarks** (`pqc-service/benchmarks/latest.json`) bundled automatically via `vercel.json`
- **Persistent Key Registry, Replay Nonces & Audit Logs** via **Upstash Redis** (free tier via Vercel Marketplace)

## 1. Import Repository into Vercel

1. Push/merge your branch (`feat/mldsa-verifier` or `main` after PR merge).
2. In Vercel, click **Add New → Project** and import `Qrygent/Qrygent`.
3. Keep **Root Directory** as `./` (repository root). Vercel automatically reads [`vercel.json`](../vercel.json).

## 2. Attach Free Upstash Redis (Required for Persistent Serverless State)

1. Inside your Vercel project, go to **Storage → Browse Marketplace → Upstash Redis → Add Integration** (Free tier).
2. Connect it to your Qrygent project. Vercel automatically injects:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

> **Fail-closed safety:** If Upstash Redis is not attached on Vercel, `GET /v1/health` reports `storageReady: false` (`unconfigured_serverless`) and stateful endpoints (`/v1/agents`, `/v1/payments/verify`, `/v1/security/events`) return HTTP `503 VERIFIER_UNAVAILABLE` rather than silently losing registered keys or nonces on cold starts.

## 3. Configure Environment Variables in Vercel

Add these in **Project Settings → Environment Variables**:

### Public Frontend Variables (`VITE_*` — safe for browser bundle)
```env
VITE_PQC_SERVICE_BASE_URL=/
VITE_CHAIN_ID=44005
VITE_RPC_URL=https://rpc-test.qday.info
VITE_EXPLORER_URL=https://explorer-test.qday.info
VITE_TOKEN_ADDRESS=0x456569838f1d43009A91ebA4263147Afd7233483
VITE_VAULT_ADDRESS=
```
*(Leave `VITE_VAULT_ADDRESS` blank until `QrygentVault.sol` is deployed — the UI honestly shows unconfigured contract states without mocking.)*

### Server-Side PQC Verifier Variables *(NEVER prefix with `VITE_`)*
```env
VERIFIER_ATTESTATION_PRIVATE_KEY=0x<dedicated-testnet-only-verifier-private-key>
EXPECTED_CHAIN_ID=44005
EXPECTED_VAULT_ADDRESS=
MAX_ATTESTATION_TTL_SECONDS=120
CORS_ORIGIN=https://<your-app>.vercel.app
```

> **Security:** Never reuse a personal wallet key for `VERIFIER_ATTESTATION_PRIVATE_KEY`. Use a dedicated, testnet-only key scoped solely to signing EIP-712 `PaymentAttestation` payloads.

## 4. Deploy & Verify

1. Trigger **Deploy**.
2. Verify live endpoints after deployment:
   - `https://<your-app>.vercel.app/v1/health` → expect `"status": "ok"`, `"storageMode": "upstash_redis"`, `"storageReady": true`, `"attestationSignerReady": true`.
   - `https://<your-app>.vercel.app/v1/benchmarks` → expect measured ML-DSA-65 vs. ECDSA JSON.
   - `https://<your-app>.vercel.app/settings` → verify startup `VITE_*` diagnostics show `Same-origin (/v1)` and live verifier latency.
