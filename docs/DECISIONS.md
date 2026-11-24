# Architecture Decision Records (ADRs)

Record material decisions here. Do not leave important decisions only in chat.

## ADR-001 — Product boundary

**Status:** Proposed  
**Decision:** Qrygent is the project/brand. Qrygent Vault is the first product: a post-quantum authorization layer for autonomous payments.  
**Reason:** Differentiate from generic agent wallets and payment workflow tools by focusing on authenticated payment intent plus independently enforced permissions.

## ADR-002 — Hybrid PQC verification

**Status:** Proposed  
**Decision:** ML-DSA-65 is verified off-chain. A restricted ECDSA verifier key issues an EIP-712 attestation that the EVM contract validates.  
**Reason:** The target EVM environment is not assumed to support native ML-DSA verification.  
**Trade-off:** This introduces verifier trust. It must be disclosed, minimized and tested.

## ADR-003 — Verifier authority

**Status:** Proposed  
**Decision:** Start with one authorized verifier signer for the MVP, with owner-controlled rotation/revocation if feasible.  
**Reason:** A single signer is simpler for a two-person team and a short hackathon timeline.  
**Constraint:** The verifier signer must not withdraw funds, alter mandates or bypass on-chain policy.

## ADR-004 — Agent key custody

**Status:** Open  
**Options:** local agent process/key file; browser-managed key; backend-managed key service.  
**Recommendation:** local agent process with private key outside the repository and outside browser localStorage.  
**Decision owner:** Product/PQC Lead, reviewed jointly.

## ADR-005 — Agent execution model

**Status:** Open  
**Options:** deterministic CLI/script simulator; LLM-powered agent; external agent framework.  
**Recommendation:** deterministic script simulator. The challenge is authorization security, not model quality.

## ADR-006 — Contract architecture

**Status:** Open  
**Options:** one vault contract with internal mandate logic; separate vault and mandate contracts; account-abstraction architecture.  
**Recommendation:** one primary vault contract for MVP unless contract lead identifies a compelling reason to split. Avoid ERC-4337 scope expansion.

## ADR-007 — Payment submission

**Status:** Open  
**Options:** owner wallet submits transaction; restricted relayer submits transaction.  
**Recommendation:** use owner-wallet submission first if it supports the demo. Add a relayer only if required by the product flow.

## ADR-008 — Public repository

**Status:** Proposed  
**Decision:** Public repository with Apache-2.0 license, subject to team agreement and dependency license review.  
**Constraint:** Never commit private keys, credentials, personal data or secrets.
