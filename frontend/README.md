# Qrygent Vault — Frontend

React + TypeScript + Tailwind CSS + `wagmi` / `viem` control and observability interface for **Qrygent Vault**.

## Architecture & Honest Integration Policy

- **No silent mocking:** Unconfigured chain settings, missing Vault ABIs, and unreachable PQC verifier services render explicit, actionable integration states rather than fabricated balances or fake verification results.
- **Zero browser private keys:** Agent ML-DSA-65 private keys are never generated, accepted, stored, or logged in the frontend.
- **Hybrid trust disclosure:** The UI explicitly distinguishes off-chain ML-DSA-65 payment-intent verification, the ECDSA EIP-712 verifier attestation bridge, and independent on-chain Solidity mandate enforcement.

## Environment Configuration

Copy the root [`.env.example`](../.env.example) to `.env` (or `.env.local`) and populate only verified public values:

```env
VITE_CHAIN_ID=
VITE_RPC_URL=
VITE_EXPLORER_URL=
VITE_TOKEN_ADDRESS=
VITE_VAULT_ADDRESS=
VITE_PQC_SERVICE_BASE_URL=http://127.0.0.1:8000
VITE_WALLET_CONNECT_PROJECT_ID=
```

> **Security:** Never put private keys, verifier signing keys, or API secrets in `VITE_*` variables. All `VITE_*` values are embedded into the public browser bundle.

## Commands

```bash
npm install
npm run dev        # Start local Vite dev server
npm run typecheck  # Strict TypeScript check
npm run test       # Run Vitest unit & integration suite
npm run build      # Production build
```

See [`docs/FRONTEND_INTEGRATION_REQUIREMENTS.md`](../docs/FRONTEND_INTEGRATION_REQUIREMENTS.md) for current integration status and pending contract/API dependencies.
