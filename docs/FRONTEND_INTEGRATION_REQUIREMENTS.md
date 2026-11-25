# Frontend Integration Requirements & Dependency Tracker

**Last updated:** 2026-11-25  
**Frontend branch:** `feat/frontend-foundation`  
**Policy:** No silent mocking. Every unconfigured or unavailable external dependency renders an explicit, actionable state in the UI and is tracked below.

## Integration Status Matrix

| Dependency | Required Information / Artifact | Responsible Party | Status | Affected Frontend Surfaces |
|---|---|---|---|---|
| **Target EVM Testnet** | Verified Aevum EVM testnet `VITE_CHAIN_ID`, `VITE_RPC_URL`, `VITE_EXPLORER_URL`, native token symbol/decimals | Smart Contract / Blockchain Lead | **Pending** | Wallet chain validation, network display, block explorer links |
| **Test Token (ERC-20)** | Verified `VITE_TOKEN_ADDRESS`, confirmed on-chain `decimals` and `symbol` | Smart Contract / Blockchain Lead | **Pending** | Wallet token balance, ERC-20 `approve` flow, Vault deposits |
| **Vault Smart Contract** | Deployed `VITE_VAULT_ADDRESS`, frozen Solidity ABI (functions, structs, events, custom errors), EIP-712 domain (`name`, `version`), ADR-006 confirmation | Smart Contract / Blockchain Lead | **Pending** | Overview balances, Vault deposit/withdraw, Mandate CRUD, on-chain payment execution & event log |
| **Agent & ML-DSA Key Registry** | Milestone 0 decision (on-chain commitment vs. verifier-side registry), registration proof flow, read/write ABI or REST endpoints for listing, rotation history, and revocation | Shared (Product/PQC + Contract Lead) | **Pending** | Agents & PQC Identity page, agent selector in Mandate creation, key status checks |
| **PQC Verifier API (Core)** | Frozen `docs/API.md` v1.0 (`protocolVersion` type, `nonce` type, `signature` encoding, canonical digest spec), running service at `VITE_PQC_SERVICE_BASE_URL`, CORS headers for browser origin | Product / Frontend / PQC Lead | **Draft v0.1 (Client Wired, Service Pending)** | Live `/v1/health` monitor, Payment Authorization Inspector (`POST /v1/payments/verify`) |
| **PQC Verifier API (Audit Log)** | Endpoint contract for off-chain verification history and rejected PQC security events (invalid signatures, tampered payloads, expired/replayed requests) | Product / Frontend / PQC Lead | **Pending Specification** | Overview security feed, Security & PQC Monitoring Layer 1 feed |
| **Payment Submission Flow (ADR-007)** | Final decision between owner-wallet contract submission (`wagmi` `writeContract`) vs. backend relayer endpoint | Shared (Product/PQC + Contract Lead) | **Open (ADR-007)** | Final execution step in Payment Authorization Inspector |
| **Cryptographic Benchmarks** | Measured ML-DSA-65 vs. ECDSA dataset (`docs/BENCHMARKS.md` or verified JSON endpoint/artifact) with library version, runtime, CPU, and sample count metadata | Product / Frontend / PQC Lead | **Pending** | Cryptographic Benchmarks page |
| **Wallet Connection** | Injected EIP-6963 browser wallets (MetaMask, Rabby, etc.) work with zero credentials; optional `VITE_WALLET_CONNECT_PROJECT_ID` if WalletConnect QR support is desired | Product / Frontend Lead | **Ready (Injected) / Optional (WalletConnect)** | Wallet connect modal & Settings |

## Frontend Environment Contract

Public browser-safe variables validated at startup in `frontend/src/config/env.ts` (never place private keys, verifier signing keys, or API secrets in `VITE_*` variables):

```env
VITE_CHAIN_ID=
VITE_RPC_URL=
VITE_TOKEN_ADDRESS=
VITE_VAULT_ADDRESS=
VITE_EXPLORER_URL=
VITE_PQC_SERVICE_BASE_URL=http://127.0.0.1:8000
VITE_WALLET_CONNECT_PROJECT_ID=
```

## Expected Service Contracts (Documented Boundaries)

### 1. PQC Verification Service (`frontend/src/services/pqcVerifier/client.ts`)
- **Implemented against `docs/API.md` v0.1 draft:**
  - `GET /v1/health` — liveness & readiness probe (also probes `/health` fallback only if documented; strict fail-closed parsing).
  - `POST /v1/payments/verify` — submits canonical `protocolVersion`, `request`, and `signature`, validates structured `verified` (with `requestId` and EIP-712 `attestation`) or `rejected` (with stable `code` and `message`) responses via Zod.
- **Pending v1.0 specification:**
  - `GET /v1/agents` & owner-authorized registration/rotation/revocation endpoints (if off-chain registry is selected).
  - `GET /v1/security/events` or `GET /v1/verifications` for historical verification outcomes.
  - `GET /v1/benchmarks` (or checked-in measured JSON file).

### 2. Vault Smart Contract Adapter (`frontend/src/services/contracts/vaultInterface.ts`)
- **Implemented:** Standard ERC-20 ABI (`balanceOf`, `decimals`, `symbol`, `allowance`, `approve`) via `viem`/`wagmi`.
- **Blocked pending ABI handoff:** Typed interface boundary defined for `deposit`, `withdraw`, `createMandate`, `updateMandate`, `revokeMandate`, `executePayment`, and audit events. Contract actions remain explicitly disabled until the verified ABI and `VITE_VAULT_ADDRESS` are supplied.
