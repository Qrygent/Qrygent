# Qrygent PQC Verification Service & Agent Simulator

Off-chain **ML-DSA-65 (NIST FIPS 204)** signature verification service, EIP-712 ECDSA attestation signer, deterministic agent CLI simulator, and reproducible PQC benchmark harness for **Qrygent Vault**.

## Security Disclosure

- **Hybrid architecture:** Agent payment instructions are signed off-chain with **ML-DSA-65** (`@noble/post-quantum`). This service verifies the signature, key status, request freshness, and domain binding before signing a short-lived **ECDSA EIP-712** attestation for the EVM vault contract.
- **No custom cryptography:** Uses `@noble/post-quantum` (`ml_dsa65`, FIPS 204) and `viem` (EIP-712 / EIP-191 / ABI encoding).
- **Zero private key custody for agents:** Agent ML-DSA-65 private keys are generated and kept strictly in local, untracked key files outside the repository and are never sent to the verifier or browser.
- **Owner-authenticated key registry:** Registering, rotating, or revoking an agent's ML-DSA-65 public key requires a verified EVM wallet EIP-191 signature from the agent's owner.

## Commands

```bash
npm install
npm run test          # Run positive & negative security test suite (Vitest)
npm run bench         # Run reproducible ML-DSA-65 vs ECDSA benchmarks -> docs/BENCHMARKS.md
npm run dev           # Start local HTTP verifier API on http://127.0.0.1:8000
npm run agent:cli -- --help  # Local ML-DSA-65 keygen & deterministic signing simulator
```
