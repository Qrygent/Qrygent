# Product Requirements Document (PRD)

**Product:** Qrygent Vault  
**Project:** Qrygent  
**Status:** MVP specification — proposed baseline  
**Last updated:** 2026-11-24

## 1. Product summary

Qrygent Vault is a programmable payment vault for autonomous agents. A vault owner deposits test stablecoins and creates a mandate that gives a registered agent narrowly scoped authority to request payments. Each payment instruction is authenticated with ML-DSA-65 off-chain. A verifier issues a short-lived EIP-712 attestation only after successful verification. The smart contract validates the attestation and independently enforces the mandate before transferring funds.

## 2. Problem

Autonomous agents may need to pay merchants, APIs or other services. Giving an agent unrestricted wallet access creates avoidable risks:

- spending beyond the owner's intended budget;
- paying an unapproved recipient;
- acting after permission expires or is revoked;
- replaying a previously valid payment request;
- executing a modified request;
- relying on a conventional agent signature without a post-quantum migration path.

A normal spending cap addresses only part of the problem. Qrygent aims to bind payment intent to a registered cryptographic identity and enforce the owner's financial policy at execution time.

## 3. Target users

- Owners who fund and control an agent's payment authority.
- Developers building autonomous agents that need bounded payment capabilities.
- Builders integrating agent-payment security into wallets or payment applications.

## 4. Product positioning

**Qrygent is a post-quantum authorization layer for autonomous payments.**

MVP product name: **Qrygent Vault**.

The product should not be positioned as a generic agent wallet, a complete payment processor, a native on-chain ML-DSA verifier, or a fully quantum-proof system.

## 5. Goals

1. Demonstrate one complete, auditable agent payment from a funded vault.
2. Authenticate the agent's payment instruction with ML-DSA-65.
3. Enforce mandate rules in the smart contract, not only in the backend or UI.
4. Reject tampered, invalid, expired, revoked, replayed and out-of-policy requests.
5. Make the hybrid trust model understandable to judges and developers.
6. Provide a usable dashboard for vaults, mandates, payment history and verification outcomes.

## 6. Non-goals for the MVP

- Native ML-DSA verification in Solidity/EVM.
- Mainnet deployment or real-money custody.
- A production-grade autonomous LLM agent.
- Multi-verifier threshold signatures.
- ERC-4337 account abstraction unless required by a verified integration need.
- Cross-chain payments.
- A generalized payment processor or merchant network.
- Claims of quantum-proof end-to-end security.

## 7. Primary user journey

1. Owner connects a wallet.
2. Owner sees the supported test network and test token.
3. Owner deposits test tokens into the vault.
4. Owner registers an agent public key and creates a mandate.
5. Mandate defines token, approved recipient(s), maximum amount per payment, aggregate spending budget and expiry.
6. Agent constructs a canonical payment request and signs it with its ML-DSA-65 private key.
7. Verifier checks signature, public-key registration, mandate binding, request freshness and chain/contract context.
8. Verifier issues a short-lived EIP-712 attestation.
9. Relayer or user submits the request and attestation to the vault contract.
10. Contract checks attestation validity and independently checks mandate state, recipient, token, amount, expiry, nonce, remaining budget and vault balance.
11. Contract transfers tokens and emits a payment event.
12. Dashboard displays the outcome and relevant transaction/verification details.

## 8. Functional requirements

### FR-01 — Wallet connection
- User can connect and disconnect a supported EVM wallet.
- UI clearly displays the active chain.
- Unsupported chain state must prevent deposit and execution actions.

### FR-02 — Vault funding
- Owner can deposit supported test tokens.
- Owner can withdraw funds subject to the contract's owner-only rules.
- UI displays token balance and vault balance using the token's verified decimals.
- Failed transactions display a useful error without claiming success.

### FR-03 — Agent registration
- Owner can register an agent identifier and its ML-DSA public key (or a commitment/reference if the chosen storage design requires it).
- Registration binds the public key to the agent identity and owner.
- Key rotation and revocation must be explicit and auditable.
- Public-key encoding, size and storage approach must be specified before implementation.

### FR-04 — Mandate management
A mandate must define at minimum:
- unique mandate ID;
- owner and agent identity;
- token address;
- one or more approved recipient addresses;
- maximum amount per payment;
- aggregate budget;
- spent/reserved amount accounting;
- expiry timestamp;
- active/revoked state.

Owner can create, update and revoke a mandate. Revocation must take effect on-chain.

### FR-05 — Signed payment request
The canonical signed message must bind:
- protocol/domain version;
- chain ID;
- vault contract address;
- agent ID and registered key version/identifier;
- mandate ID;
- token address;
- recipient;
- amount in base units;
- unique nonce;
- request expiry/deadline.

The exact serialization and digest construction must be versioned. Do not sign ad-hoc JSON whose field ordering or number representation can vary.

### FR-06 — Verification
The verifier must:
- load the registered public key from an authoritative registry;
- verify ML-DSA-65 signature using a maintained implementation;
- validate the canonical payload and protocol version;
- check that the request is fresh and not previously accepted;
- check key status and mandate binding;
- fail closed on malformed input, unavailable dependencies or verification errors;
- return a structured result and issue an attestation only when all checks pass.

### FR-07 — On-chain execution
The contract must independently validate:
- authorized verifier/attestation signer;
- EIP-712 domain and typed data;
- attestation deadline;
- nonce/replay state;
- active mandate and non-expiry;
- agent and mandate binding;
- token and recipient allowlist;
- per-payment maximum;
- remaining aggregate budget;
- vault token balance.

The contract must update replay and budget accounting safely before/around external token interaction using checks-effects-interactions and reentrancy protection.

### FR-08 — Dashboard and audit trail
Display:
- connected wallet and chain;
- vault token balance;
- registered agents and key status;
- mandates and remaining budget;
- payment requests and outcomes;
- transaction hashes for on-chain outcomes;
- verification/rejection reason where safe to disclose;
- security events such as key rotation, revocation and replay rejection.

Never display private keys or secret material.

## 9. Non-functional requirements

- **Security:** fail closed; validate on-chain; use vetted libraries; protect secrets.
- **Reliability:** clear timeout/error handling; idempotent request handling.
- **Observability:** structured logs with correlation/payment IDs, without logging private keys or sensitive secrets.
- **Usability:** clear pending/success/failed states and human-readable rejection reasons.
- **Reproducibility:** tests and benchmark procedure documented with library/runtime versions.
- **Transparency:** clearly disclose off-chain verification and attestation trust assumptions.

## 10. MVP acceptance criteria

The MVP is not complete until all are demonstrated:

- [ ] Owner connects wallet on the verified target testnet.
- [ ] Owner deposits test token into vault.
- [ ] Owner creates a mandate with recipient, per-payment cap, aggregate budget and expiry.
- [ ] Agent signs a canonical payment request with ML-DSA-65.
- [ ] Verifier accepts a valid request and rejects an invalid signature.
- [ ] A valid attestation is accepted by the contract.
- [ ] Valid payment transfers the expected amount and updates budget accounting.
- [ ] Contract rejects an unapproved recipient.
- [ ] Contract rejects an amount above the per-payment cap.
- [ ] Contract rejects a request exceeding remaining aggregate budget.
- [ ] Contract rejects expired or revoked mandates.
- [ ] Contract rejects replayed nonces/attestations.
- [ ] Tampering with any signed field causes verification or execution failure.
- [ ] README explains architecture, limitations, setup and demo.
- [ ] Demo uses testnet assets only and clearly says so.

## 11. Success metrics for the demo

- One successful end-to-end payment.
- At least five deterministic negative test cases.
- Clear proof that the contract independently enforces financial constraints.
- Reproducible signature verification and benchmark measurements.
- No unsupported claim that ML-DSA is verified natively on-chain.
