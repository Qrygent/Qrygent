# Protocol and API Specification

**Status:** Draft v0.1 — must be reviewed and versioned before implementation.

This document defines the shared data contract between the agent signer, PQC verifier, relayer and Solidity contract. Do not independently rename fields or change units across components.

## 1. Canonical payment request

The signed request must be deterministic. The team must choose and document one canonical encoding strategy before implementation. Recommended approach: a versioned typed structure with fixed-width EVM fields and explicit byte encoding for agent/key identifiers.

Logical fields:

| Field | Type | Meaning |
|---|---|---|
| `protocolVersion` | string/uint | Protocol schema version |
| `chainId` | uint256 | Target chain |
| `vault` | address | Exact vault contract |
| `agentId` | bytes32 | Stable agent identifier |
| `keyId` | bytes32 | Registered key/version identifier |
| `mandateId` | bytes32 | On-chain mandate |
| `token` | address | Token contract |
| `recipient` | address | Payment recipient |
| `amount` | uint256 | Token base units, never floating point |
| `nonce` | bytes32 or uint256 | Unique request identifier |
| `deadline` | uint256 | Unix timestamp after which request is invalid |

The exact field types must match the Solidity struct and EIP-712 schema. Once frozen, changes require a protocol version bump and coordinated updates.

## 2. Serialization rules

- Use integer base units for token amounts. Never sign decimal display strings or JavaScript floating-point values.
- Use checksummed/normalized EVM addresses before encoding.
- Use a fixed schema and deterministic encoding. Do not rely on ordinary JSON key order.
- Bind `chainId` and `vault` to prevent cross-chain or cross-contract replay.
- Bind the mandate and agent/key identifiers.
- Include a unique nonce and deadline.
- Include a protocol version/domain separator.
- Reject unknown versions and malformed fields.
- The exact bytes/digest signed by ML-DSA must be reproducible in independent test vectors.

## 3. ML-DSA signature envelope

Illustrative JSON transport envelope (not the canonical signed bytes):

```json
{
  "protocolVersion": "1",
  "request": {
    "chainId": "REPLACE_WITH_VERIFIED_CHAIN_ID",
    "vault": "0x...",
    "agentId": "0x...",
    "keyId": "0x...",
    "mandateId": "0x...",
    "token": "0x...",
    "recipient": "0x...",
    "amount": "1000000",
    "nonce": "0x...",
    "deadline": 0
  },
  "signature": "base64-or-hex-encoded-ML-DSA-65-signature"
}
```

The example is illustrative only. Do not copy placeholder values into production code. Choose one signature encoding (base64 or hex) and enforce size/format validation.

## 4. Verifier API

Base path: `/v1`

### `POST /payments/verify`

Purpose: verify an agent-signed payment request and return an EIP-712 attestation only if all off-chain checks pass.

Request:
```json
{
  "protocolVersion": "1",
  "request": {
    "chainId": "stringified uint256",
    "vault": "0x...",
    "agentId": "0x...",
    "keyId": "0x...",
    "mandateId": "0x...",
    "token": "0x...",
    "recipient": "0x...",
    "amount": "stringified uint256",
    "nonce": "0x...",
    "deadline": 0
  },
  "signature": "encoded ML-DSA-65 signature"
}
```

Successful response:
```json
{
  "status": "verified",
  "requestId": "opaque unique identifier",
  "attestation": {
    "requestDigest": "0x...",
    "agentId": "0x...",
    "mandateId": "0x...",
    "nonce": "0x...",
    "deadline": 0,
    "verifier": "0x...",
    "signature": "0x..."
  }
}
```

Failure response:
```json
{
  "status": "rejected",
  "code": "INVALID_SIGNATURE",
  "message": "The payment request signature could not be verified."
}
```

Do not leak secret key material, internal stack traces or unnecessary implementation details in errors.

### `GET /health`

Returns service liveness. It must not disclose secrets or sensitive configuration.

### Key registration and rotation

Key registration, rotation, and revocation are owner-authorized via EVM wallet EIP-191 personal signatures (`verifyMessage`) over a deterministic authorization payload binding `Action`, `Owner`, `AgentId`, `KeyId`, `Fingerprint`, and `Timestamp`:

- `GET /v1/agents` — returns registered agents, active `ML-DSA-65` public-key fingerprints, statuses, and key rotation/revocation history (never returns private keys).
- `POST /v1/agents/register` — verifies exact 1,952-byte ML-DSA-65 public key length and owner wallet EIP-191 signature before storing the public key.
- `POST /v1/agents/:agentId/rotate` — owner-signed rotation to a new `keyId` + 1,952-byte ML-DSA-65 public key; immediately retires the previous key.
- `POST /v1/agents/:agentId/revoke` — owner-signed immediate revocation; subsequent payment verification attempts with that key fail closed with `REVOKED_KEY`.

### Security audit log & measured benchmarks

- `GET /v1/security/events` — returns recorded off-chain PQC verification outcomes, rejections (`INVALID_SIGNATURE`, `NONCE_ALREADY_USED`, `REVOKED_KEY`, `REQUEST_EXPIRED`, etc.), and key-lifecycle events.
- `GET /v1/benchmarks` — serves measured ML-DSA-65 vs. ECDSA benchmark telemetry from `pqc-service/benchmarks/latest.json` (returns HTTP 404 when no benchmark run exists).

### Reference canonical digest & EIP-712 typed data (implemented in `pqc-service`)

- **Canonical payment request digest (Solidity-compatible `abi.encode`):**
  `keccak256(abi.encode(keccak256("QRYGENT_PAYMENT_REQUEST_V1"), uint256(1), chainId, vault, agentId, keyId, mandateId, token, recipient, amount, nonce, deadline))`
- **EIP-712 Domain:** `{ name: "QrygentVault", version: "1", chainId, verifyingContract: vault }`
- **EIP-712 Primary Type (`PaymentAttestation`):**
  `PaymentAttestation(bytes32 requestDigest,bytes32 agentId,bytes32 mandateId,bytes32 nonce,uint256 deadline)`
- **Signature & key encoding:** `0x`-prefixed hex (preferred) or strict base64, enforcing exact NIST FIPS 204 lengths (`1,952` bytes public key, `3,309` bytes signature).

> **Handoff note for Smart Contract Lead:** Both the canonical ABI digest and `PaymentAttestation` EIP-712 struct above are implemented and tested in `pqc-service/src/protocol/canonical.ts` and `pqc-service/src/crypto/eip712.ts` and await joint sign-off before Solidity contract freeze.

## 5. Attestation requirements

The EIP-712 attestation must bind enough information for the contract to prove it refers to the exact payment request. At minimum, the attested digest must commit to every canonical request field, including chain, vault, agent, key, mandate, token, recipient, amount, nonce and deadline.

The contract must:
- recover the authorized verifier signer;
- check the EIP-712 domain (chain and verifying contract);
- check attestation deadline;
- reject reused nonce/request digest;
- independently enforce mandate state and all spending constraints.

Do not accept a generic `verified=true` boolean from the backend.

## 6. Error codes

Recommended stable codes:
- `MALFORMED_REQUEST`
- `UNSUPPORTED_PROTOCOL_VERSION`
- `UNKNOWN_AGENT`
- `UNKNOWN_KEY`
- `REVOKED_KEY`
- `INVALID_SIGNATURE`
- `MANDATE_NOT_FOUND`
- `MANDATE_REVOKED`
- `MANDATE_EXPIRED`
- `RECIPIENT_NOT_ALLOWED`
- `PAYMENT_LIMIT_EXCEEDED`
- `BUDGET_EXCEEDED`
- `REQUEST_EXPIRED`
- `NONCE_ALREADY_USED`
- `WRONG_CHAIN`
- `WRONG_VAULT`
- `VERIFIER_UNAVAILABLE`
- `INTERNAL_ERROR`

Backend checks are helpful for early rejection and user feedback. The contract remains the final authority for financial constraints.
