# Frontend Integration Requirements & Dependency Tracker

**Last updated:** 2026-11-25  
**Branches:** `feat/frontend-foundation` (pushed) · `feat/mldsa-verifier` (PQC service + live frontend PQC wiring)  
**Policy:** No silent mocking. Every unconfigured or unavailable external dependency renders an explicit, actionable state in the UI and is tracked below.

## Integration Status Matrix

| Dependency | Required Information / Artifact | Responsible Party | Status | Affected Frontend Surfaces |
|---|---|---|---|---|
| **PQC Verifier API (Core)** | Implemented in `pqc-service/` (`@noble/post-quantum` NIST FIPS 204 `ml_dsa65` + `viem` ECDSA EIP-712 signer): `GET /v1/health`, `POST /v1/payments/verify` | Product / Frontend / PQC Lead | **Ready (Implemented & Wired)** | Live `/v1/health` monitor, Payment Authorization Inspector |
| **Agent & ML-DSA Key Registry** | Implemented in `pqc-service/` with owner EIP-191 wallet signature authentication: `GET /v1/agents`, `POST /v1/agents/register`, `POST /v1/agents/:agentId/rotate`, `POST /v1/agents/:agentId/revoke` | Product / Frontend / PQC Lead (joint contract review if on-chain mirror added) | **Ready (Implemented & Wired)** | Agents & PQC Identity page (live listing, rotation history, owner-signed register/revoke) |
| **PQC Verifier Security Audit Log** | Implemented in `pqc-service/`: `GET /v1/security/events` recording real rejections & key lifecycle events | Product / Frontend / PQC Lead | **Ready (Implemented & Wired)** | Overview recent security events, Security & PQC Monitoring Layer 1 feed |
| **Cryptographic Benchmarks** | Real measured benchmark runner (`npm --prefix pqc-service run bench`), `docs/BENCHMARKS.md`, `pqc-service/benchmarks/latest.json`, and `GET /v1/benchmarks` | Product / Frontend / PQC Lead | **Ready (Measured & Wired)** | Cryptographic Benchmarks page (live API + local JSON loader) |
| **Agent Signer CLI Simulator** | Implemented in `pqc-service/src/cli/agentSimulator.ts` (local untracked `.qrygent-local/` key custody + deterministic tamper flags) | Product / Frontend / PQC Lead | **Ready** | Generates real ML-DSA-65 signed payment envelopes for `/payments` |
| **Wallet Connection** | Injected EIP-6963 browser wallets (MetaMask, Rabby, etc.) via `wagmi` + `useSignMessage` for owner key auth | Product / Frontend Lead | **Ready (Injected) / Optional (WalletConnect)** | AppShell wallet connect, Settings, Owner EIP-191 key signing |
| **Target EVM Testnet** | Verified Aevum EVM testnet `VITE_CHAIN_ID`, `VITE_RPC_URL`, `VITE_EXPLORER_URL`, native token symbol/decimals | Smart Contract / Blockchain Lead | **Pending** | Wallet chain validation, network display, block explorer links |
| **Test Token (ERC-20)** | Verified `VITE_TOKEN_ADDRESS`, confirmed on-chain `decimals` and `symbol` | Smart Contract / Blockchain Lead | **Pending** | Wallet token balance, ERC-20 `approve` flow, Vault deposits |
| **Vault Smart Contract** | Deployed `VITE_VAULT_ADDRESS`, frozen Solidity ABI (functions, structs, events, custom errors), confirmation of EIP-712 `PaymentAttestation` struct & ADR-006 | Smart Contract / Blockchain Lead | **Pending** | Overview balances, Vault deposit/withdraw, Mandate CRUD, on-chain payment execution & Layer 2 security events |
| **Payment Submission Flow (ADR-007)** | Final decision between owner-wallet contract submission (`wagmi` `writeContract`) vs. backend relayer endpoint | Shared (Product/PQC + Contract Lead) | **Open (ADR-007)** | Final execution step in Payment Authorization Inspector |

## Frontend Environment Contract

Public browser-safe variables validated at startup in `frontend/src/config/env.ts`:

```env
VITE_CHAIN_ID=
VITE_RPC_URL=
VITE_TOKEN_ADDRESS=
VITE_VAULT_ADDRESS=
VITE_EXPLORER_URL=
VITE_PQC_SERVICE_BASE_URL=http://127.0.0.1:8000
VITE_WALLET_CONNECT_PROJECT_ID=
```

## PQC Service Server-Side Environment Contract (`pqc-service/.env.example`)

Server-side only — NEVER expose `VERIFIER_ATTESTATION_PRIVATE_KEY` in frontend env vars or Git:

```env
PORT=8000
HOST=127.0.0.1
CORS_ORIGIN=http://localhost:5173
VERIFIER_ATTESTATION_PRIVATE_KEY=
EXPECTED_CHAIN_ID=
EXPECTED_VAULT_ADDRESS=
MAX_ATTESTATION_TTL_SECONDS=120
REGISTRY_STORE_PATH=./data/registry-store.json
```
