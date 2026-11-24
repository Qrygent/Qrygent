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

Key registration must be owner-authorized and tied to the on-chain or otherwise authoritative agent registry. Do not expose an endpoint that accepts an arbitrary public key and silently treats it as trusted. Define the registration proof and source of truth before implementing these endpoints.

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
