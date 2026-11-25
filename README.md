# Qrygent

**Post-quantum authorization infrastructure for autonomous payments.**

Qrygent explores how autonomous agents can initiate payments using cryptographically authenticated instructions while smart contracts independently enforce financial permissions.

> **Hackathon MVP:** Qrygent Vault — a programmable payment vault with off-chain ML-DSA-65 verification and on-chain enforcement of payment mandates.

## Why Qrygent?

Autonomous agents need bounded access to money. A spending limit alone does not establish that a payment instruction came from the intended agent, has not been modified, or has not been replayed.

Qrygent combines:

- **Post-quantum authentication:** agent payment instructions are signed with ML-DSA-65.
- **Independent financial controls:** smart contracts enforce approved recipients, per-payment limits, aggregate budgets, expiry and revocation.
- **Replay resistance:** payment requests are bound to a unique nonce and deployment context.
- **Auditable execution:** deposits, mandate changes, rejected requests and successful payments can be inspected.

## Important security disclosure

The MVP does **not** perform native ML-DSA verification inside the EVM contract.

1. An agent signs a canonical payment request using ML-DSA-65.
2. An off-chain verifier checks the signature, registered public key, request freshness and mandate binding.
3. A restricted verifier key signs an EIP-712 authorization attestation.
4. The smart contract validates that ECDSA attestation and independently enforces the mandate and vault rules before transferring tokens.

This is a **hybrid authorization design**, not a trustless on-chain post-quantum verifier and not a claim that the entire system is quantum-proof. The verifier/attestation key is a trust assumption and must be tightly scoped, monitored and revocable.

## Repository layout

```text
qrygent/
├── frontend/                 # React + TypeScript application
├── contracts/                # Solidity + Foundry
├── pqc-service/              # ML-DSA verification service
├── docs/                     # Product, architecture, API and security docs
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Current status

- **`frontend/`**: React + TypeScript + Tailwind CSS + `wagmi`/`viem` application scaffolded on `feat/frontend-foundation`. See [`frontend/README.md`](frontend/README.md) and [`docs/FRONTEND_INTEGRATION_REQUIREMENTS.md`](docs/FRONTEND_INTEGRATION_REQUIREMENTS.md) for active integration boundaries and pending contract/API dependencies.
- **`contracts/` & `pqc-service/`**: Pending implementation; deployed addresses and supported network configuration must be updated only after they are tested and verified.

## Environment configuration

Copy [`.env.example`](.env.example) to `.env` (untracked) and populate verified public values only:

```env
VITE_CHAIN_ID=
VITE_RPC_URL=
VITE_EXPLORER_URL=
VITE_TOKEN_ADDRESS=
VITE_VAULT_ADDRESS=
VITE_PQC_SERVICE_BASE_URL=http://127.0.0.1:8000
PQC_SERVICE_BASE_URL=http://127.0.0.1:8000
VITE_WALLET_CONNECT_PROJECT_ID=
```

> **Important:** Any `VITE_*` variable is exposed in public frontend bundles. Never place private keys, verifier signing keys, wallet seed phrases, or API secrets in frontend environment variables. The frontend validates all public `VITE_*` variables at startup and surfaces actionable diagnostics under **Settings** without silently mocking missing services.

## Getting started

The implementation directories are initially placeholders. Before running services:

1. Read [`docs/PRD.md`](docs/PRD.md).
2. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
3. Agree and version the payload and attestation schemas in [`docs/API.md`](docs/API.md).
4. Review [`docs/SECURITY.md`](docs/SECURITY.md) and the open decisions in [`docs/DECISIONS.md`](docs/DECISIONS.md).
5. Follow [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Development principles

- Never implement cryptographic primitives ourselves. Use maintained, vetted libraries.
- Never commit private keys, seed phrases, API tokens, `.env` files or production credentials.
- Never trust frontend validation as an enforcement boundary.
- The contract must independently enforce all financial constraints.
- Fail closed when verification, key lookup, freshness checks or attestation validation fail.
- Keep testnet addresses and chain configuration in an explicit, verified deployment configuration. Do not assume example values are correct.
- Label simulations and testnet assets clearly. Test tokens have no represented real-world value.

## Team

| Area | Owner |
|---|---|
| Product, frontend and PQC | Product / Frontend / PQC Lead |
| Solidity, vault and chain integration | Smart Contract / Blockchain Lead |
| Architecture, protocol, integration and security review | Shared |

See [`docs/WORKPLAN.md`](docs/WORKPLAN.md) for deliverables and milestones.

## License

Licensed under the Apache License, Version 2.0. See [`LICENSE`](LICENSE).
