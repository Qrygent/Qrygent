# Architecture

**Status:** Proposed MVP baseline  
**Date:** 2026-11-24

## 1. System overview

```text
┌─────────────────────┐
│ React + TypeScript  │
│ Owner dashboard     │
└──────────┬──────────┘
           │ wallet actions / read data
           ▼
┌─────────────────────┐       signed request       ┌─────────────────────┐
│ Agent simulator     │ ──────────────────────────► │ PQC verification    │
│ ML-DSA key custody  │                              │ service             │
└─────────────────────┘                              └──────────┬──────────┘
                                                               │
                                                  EIP-712 attestation
                                                               │
                                                               ▼
┌─────────────────────┐     execute request        ┌─────────────────────┐
│ Relayer / submitter │ ──────────────────────────► │ Solidity vault      │
└─────────────────────┘                              │ mandate enforcement│
                                                     └──────────┬──────────┘
                                                                │
                                                                ▼
                                                     ┌─────────────────────┐
                                                     │ Aevum EVM testnet   │
                                                     │ test token          │
                                                     └─────────────────────┘
```

The frontend is a control and observability surface. It is not a security boundary. The agent signs payment intent. The PQC service verifies that signature and issues a bounded attestation. The contract enforces money movement rules.

## 2. Trust boundaries

1. **Owner wallet:** controls deposits, withdrawals and mandate lifecycle.
2. **Agent runtime:** holds an ML-DSA private key and can request payments within a mandate.
3. **PQC verifier:** validates agent signatures and signs EIP-712 attestations.
4. **Relayer/submitter:** transports a request and attestation to the chain; it must not be able to change signed fields.
5. **Smart contract:** final enforcement boundary for mandate rules and token transfers.
6. **Token contract/network:** external dependencies whose addresses and behavior must be verified.

## 3. Cryptographic roles

### Agent signature — ML-DSA-65
Authenticates the canonical payment instruction using the registered agent public key. ML-DSA is a post-quantum digital signature scheme standardized in NIST FIPS 204. It is not a quantum-computing algorithm.

### Verifier attestation — EIP-712 / ECDSA
The EVM contract validates an attestation signed by an authorized verifier key. This bridges off-chain ML-DSA verification to an EVM contract that does not natively verify ML-DSA in this MVP.

The verifier key is a meaningful trust assumption. A compromised verifier key may forge attestations. The contract must still enforce all financial mandate rules, and verifier authority must be limited to attesting payment requests—not withdrawing funds or changing mandates.

## 4. Payment sequence

```text
Owner          Agent          PQC verifier       Relayer         Vault contract
  |              |                  |                |                 |
  |-- create mandate on-chain ---------------------------------------->|
  |              |                  |                |                 |
  |              |-- construct canonical request     |                 |
  |              |-- ML-DSA sign    |                |                 |
  |              |-- request + signature ----------->|                 |
  |              |                  |-- verify key/signature/freshness  |
  |              |                  |-- issue EIP-712 attestation       |
  |              |                  |---------------->|                 |
  |              |                  |                |-- execute ------>|
  |              |                  |                |                 |-- verify ECDSA
  |              |                  |                |                 |-- enforce mandate
  |              |                  |                |                 |-- transfer token
  |              |                  |                |<-- tx result ----|
```

The diagram is logical; exact call topology can change after the team selects whether the agent calls the verifier directly or through an application API. Private keys must remain with the agent signer and must never be sent to the verifier.

## 5. Contract design

For the MVP, prefer one primary vault contract with clear internal separation rather than several contracts that increase deployment and integration work.

Responsibilities:
- owner-controlled deposit and withdrawal;
- agent/key registration reference and key status, if on-chain registry is selected;
- mandate creation, update and revocation;
- verifier signer authorization/rotation;
- EIP-712 attestation validation;
- nonce/replay protection;
- payment execution and budget accounting;
- events for auditability.

Security controls to evaluate and test:
- OpenZeppelin `SafeERC20` or equivalent safe token transfer handling;
- reentrancy protection;
- checks-effects-interactions;
- strict access control;
- bounded verifier authority;
- explicit integer/base-unit handling;
- safe signature recovery and EIP-712 domain separation;
- no arbitrary token or recipient execution outside mandate rules.

Exact Solidity interfaces and storage layout must be agreed with the contract lead before frontend integration.

## 6. Verifier design

The verifier service should be stateless where practical, with authoritative key/mandate state read from a defined source. Do not let the verifier invent a separate policy from the contract.

Minimum operations:
- register or resolve an agent public key through an owner-authorized flow;
- verify a signed payment request;
- check freshness and key status;
- produce a short-lived EIP-712 attestation only on success;
- expose health/readiness information.

A database may be used for operational metadata and request tracking, but contract state remains authoritative for financial permission at execution time.

## 7. Key custody

MVP recommendation:
- generate the agent ML-DSA keypair in a local agent process or controlled local key tool;
- store the private key outside the repository in a local, permission-restricted file or secure secret store;
- keep public key material and key identifiers separate from private material;
- do not put private keys in browser localStorage, frontend bundles, logs, Git history or API requests;
- use test-only keys for the demo;
- document how keys are rotated and revoked.

If the chosen library does not support the required runtime reliably, stop and evaluate another maintained implementation before building around it.

## 8. Relayer decision

The relayer may be:
- a backend service that submits transactions using a restricted funded account; or
- the owner/user wallet submitting the transaction during the demo.

Choose the simplest path that supports the demo. The relayer must not be trusted to alter the request. The contract validates the signed attestation and all policy constraints.

## 9. Deployment configuration

Do not hardcode chain IDs, RPC URLs, token addresses, decimals, verifier addresses or deployed contract addresses until checked against current official documentation and the live testnet explorer.

Keep environment-specific configuration in documented environment variables/config files. Commit only `.env.example` with placeholder values.
