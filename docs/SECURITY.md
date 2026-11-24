# Security Model and Threat Register

**Status:** MVP threat model — living document  
**Date:** 2026-11-24

## 1. Security claims we can make

If implemented and tested as specified, Qrygent can demonstrate:
- ML-DSA-65 authentication of agent payment instructions off-chain;
- request binding to agent, mandate, token, recipient, amount, nonce, chain and vault;
- on-chain enforcement of configured financial permissions;
- replay rejection at the contract;
- owner-controlled mandate and key lifecycle.

## 2. Claims we must not make

Do not claim:
- ML-DSA is verified natively on-chain in this MVP;
- the design is trustless end-to-end;
- the whole application is quantum-proof;
- the verifier cannot be compromised;
- a testnet demonstration proves production security;
- a benchmark proves cryptographic superiority or security.

## 3. Trust assumptions

- The owner wallet and its signing environment are not compromised.
- The agent's ML-DSA private key is protected.
- The verifier software and its ECDSA attestation key are controlled.
- The configured chain, vault and token contracts are the intended deployments.
- The cryptographic library behaves according to its documented implementation.
- The owner correctly configures recipients, caps, budgets and expiry.

## 4. Threat register

| Threat | Example | Required mitigation |
|---|---|---|
| Agent key theft | Attacker signs payments as agent | Local secret custody, rotation, revocation, test-only keys |
| Verifier key compromise | Attacker forges attestations | Minimal authority, short deadlines, rotation/revocation, monitoring; contract still enforces mandates |
| Payload tampering | Recipient or amount changed after signing | Canonical digest binds all fields; contract checks attested digest |
| Replay | Same valid request submitted twice | Unique nonce/digest consumed on-chain |
| Cross-chain replay | Request copied to another chain | Bind chain ID and EIP-712 domain |
| Cross-contract replay | Attestation used against another vault | Bind verifying contract/vault |
| Unauthorized recipient | Agent pays attacker address | On-chain recipient allowlist |
| Budget bypass | Many payments exceed total budget | On-chain aggregate accounting |
| Revoked mandate use | Old request submitted after revocation | Contract checks current mandate status at execution |
| Expired request | Old signed request submitted | Request and attestation deadlines |
| Reentrancy/token callback | Malicious token re-enters execution | Reentrancy protection, checks-effects-interactions, token allowlist |
| Integer/decimal error | Amount mis-scaled | Base units, verified token decimals, integer-only amounts |
| Public repo secret leak | Private key committed | `.gitignore`, secret scanning, test keys only, rotate leaked credentials |
| API abuse/DoS | Verifier spammed | Rate limits, payload bounds, timeouts, monitoring |
| Key substitution | Attacker replaces registered public key | Owner-authorized registration/rotation and authoritative registry |

## 5. Smart contract security requirements

- Restrict deposits/withdrawals and mandate mutation to the owner or explicitly authorized roles.
- The verifier must not have withdrawal or mandate-administration privileges.
- Use audited standard libraries where practical.
- Apply reentrancy protection to external token transfers.
- Validate token and recipient addresses against policy.
- Consume nonce and update accounting safely.
- Check current mandate state at execution, not only during off-chain verification.
- Use EIP-712 domain separation and strict typed data.
- Test boundary conditions: zero, exact cap, cap + 1, exact budget, budget + 1, expiry boundary.
- Do not use `tx.origin` for authorization.
- Avoid arbitrary external calls and delegatecall in the MVP.

## 6. PQC implementation requirements

- Use a maintained implementation of ML-DSA-65 aligned with NIST FIPS 204.
- Do not write custom lattice math, signature encoding or cryptographic primitives.
- Record library name, version, build configuration and algorithm parameter set.
- Validate key and signature lengths/encodings.
- Include positive and negative test vectors.
- Keep private keys out of API requests, browser storage, logs and repository history.
- Do not silently downgrade to a classical agent signature if PQC verification fails.

## 7. Incident response for the demo

If a secret is committed or exposed:
1. Stop using the key immediately.
2. Revoke/rotate the relevant test key or verifier signer.
3. Remove the secret from active configuration and rotate any dependent credentials.
4. Treat Git history as exposed; deleting the file in a later commit is not enough.
5. Record the incident and corrective action.

## 8. Security test scenarios

- valid signature / valid mandate;
- invalid signature;
- signature over altered recipient;
- signature over altered amount;
- wrong chain or vault;
- unknown or revoked agent key;
- unapproved recipient;
- per-payment limit exceeded;
- aggregate budget exceeded;
- expired request;
- expired mandate;
- revoked mandate;
- duplicate nonce;
- duplicate attestation;
- unauthorized verifier;
- verifier signer rotation;
- insufficient vault balance;
- malicious/reverting token behavior where practical.
