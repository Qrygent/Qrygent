# Qrygent Cryptographic Benchmarks (Measured)

**Measured at:** 2026-11-25T03:53:40.517Z  
**Runtime:** Node.js v24.12.0 (win32/x64)  
**CPU:** AMD Athlon Silver 3050U with Radeon Graphics     
**Libraries:** `@noble/post-quantum@0.4.1` (ML-DSA-65, NIST FIPS 204) · `viem@2.58.6` (ECDSA secp256k1) · declared range `^0.4.1`  
**Iterations:** 100 measured runs after 10 warmup runs (single-threaded, signing a 32-byte canonical keccak256 payment digest)

## Measured Results

| Algorithm | Keygen Mean (ms) | Keygen Median (ms) | Sign Mean (ms) | Sign Median (ms) | Verify Mean (ms) | Verify Median (ms) | Public Key Size | Signature Size |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **ML-DSA-65 (NIST FIPS 204)** | 4.632 | 3.134 | 18.222 | 13.555 | 6.278 | 3.016 | 1,952 bytes | 3,309 bytes |
| **ECDSA secp256k1 (EVM Bridge)** | 2.549 | 0.614 | 2.579 | 0.729 | 10.406 | 4.456 | 33 bytes (compressed) | 65 bytes |

## Interpretation & Limitations

- These figures are **measured locally** using pure JS/TS implementations (`@noble/post-quantum` and `viem`) and will vary across hardware, runtimes, and native C/Rust implementations (e.g., `liboqs`).
- ML-DSA-65 public keys (1,952 bytes) and signatures (3,309 bytes) are substantially larger than ECDSA secp256k1 keys (33 bytes) and signatures (65 bytes), which is a primary engineering reason the Qrygent MVP performs ML-DSA-65 verification off-chain and bridges to EVM via a compact 65-byte ECDSA EIP-712 attestation.
- Per `docs/SECURITY.md` §2, these measurements characterize off-chain latency and payload sizes only—they do **not** prove universal cryptographic superiority or end-to-end quantum resistance.

## Reproducing

```bash
npm --prefix pqc-service run bench
```

Artifact output: `pqc-service/benchmarks/latest.json` (served live via `GET /v1/benchmarks`).
