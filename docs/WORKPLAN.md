# Team Workplan and Delivery Agreement

**Planning baseline:** 2026-11-24 to 2026-12-11  
**Team size:** 2 builders

## 1. Ownership

### Product / Frontend / PQC Lead
Accountable for:
- product scope and user journeys;
- PRD, architecture and protocol documentation coordination;
- React + TypeScript + Tailwind frontend;
- wallet connection and contract read/write integration;
- ML-DSA library evaluation and implementation;
- agent-side key generation/signing and PQC verifier service;
- verifier API and attestation integration with contract lead;
- PQC benchmark methodology and demo narrative.

### Smart Contract / Blockchain Lead
Accountable for:
- Solidity vault and mandate design;
- token integration and testnet configuration verification;
- EIP-712 verifier attestation validation;
- nonce/replay protection and on-chain budget accounting;
- contract tests and deployment;
- ABI/address handoff and contract integration support.

### Shared ownership
- architecture and threat-model decisions;
- exact request/attestation schema;
- integration and end-to-end tests;
- code review and release readiness;
- demo script, README and submission.

Do not assume either person's expertise outside their stated role. If backend/relayer work is not covered by either builder, use the simplest possible user-submitted transaction flow for the MVP rather than introducing an unnecessary service.

## 2. Milestones

### Milestone 0 — Architecture lock (Nov 24–25)
- [ ] Confirm target testnet and verify chain/token details from official sources.
- [ ] Choose agent key custody approach.
- [ ] Choose whether agent registration/public-key commitment is on-chain.
- [ ] Freeze canonical payment request fields and encoding.
- [ ] Freeze EIP-712 attestation fields and typed-data domain.
- [ ] Agree contract function signatures and events.
- [ ] Agree verifier API request/response schema.
- [ ] Record decisions in `docs/DECISIONS.md`.

**Exit condition:** both builders can independently describe the same payment flow and data structures.

### Milestone 1 — Independent vertical slices (Nov 26–29)
Frontend/PQC:
- [ ] React app scaffold and design system.
- [ ] Wallet connect and chain display.
- [ ] ML-DSA library proof-of-concept: keygen, sign, verify.
- [ ] Agent simulator command-line flow.
- [ ] Verifier API skeleton and schema validation.

Contracts:
- [ ] Foundry project scaffold.
- [ ] Vault deposit/withdraw.
- [ ] Mandate create/update/revoke.
- [ ] Attestation struct and EIP-712 verification.
- [ ] Nonce and budget enforcement tests.

**Exit condition:** each component has local tests and can be demonstrated independently.

### Milestone 2 — First integration (Nov 30–Dec 2)
- [ ] One canonical request fixture shared across agent, verifier and Solidity tests.
- [ ] Verifier accepts valid ML-DSA signature.
- [ ] Verifier returns attestation matching the frozen schema.
- [ ] Contract accepts valid attestation and executes test payment.
- [ ] Frontend displays vault and mandate state.

**Exit condition:** one end-to-end payment works before UI polish.

### Milestone 3 — Security and failure paths (Dec 3–5)
- [ ] Invalid signature rejected.
- [ ] Tampered amount/recipient rejected.
- [ ] Unapproved recipient rejected on-chain.
- [ ] Per-payment and aggregate budget boundaries tested.
- [ ] Expired/revoked mandate rejected.
- [ ] Replay rejected.
- [ ] Verifier signer access and rotation tested.
- [ ] Security limitations documented.

**Exit condition:** negative tests pass and demo failures are deterministic.

### Milestone 4 — Demo quality (Dec 6–8)
- [ ] Dashboard shows agents, mandates, vault balance and payment activity.
- [ ] Clear pending/success/rejected states.
- [ ] PQC benchmark run is reproducible and accurately described.
- [ ] README setup instructions tested by a clean clone.
- [ ] Demo script rehearsed.

### Milestone 5 — Freeze and submit (Dec 9–11)
- [ ] No unreviewed changes on `main`.
- [ ] Fresh-clone build and test pass.
- [ ] Testnet addresses and transaction links verified.
- [ ] Screenshots/video/demo environment prepared.
- [ ] Submission wording matches actual implementation.
- [ ] Known limitations disclosed.
- [ ] Final release tag created.

## 3. First 48 hours — concrete tasks

### Product / Frontend / PQC Lead
1. Create frontend scaffold and commit setup instructions.
2. Evaluate at least one maintained ML-DSA-65 implementation in the intended runtime.
3. Produce a small proof-of-concept: keypair → canonical message → sign → verify → tamper → reject.
4. Draft and circulate the exact API schema.
5. Build a basic dashboard shell with wallet/chain state.

### Smart Contract / Blockchain Lead
1. Create Foundry scaffold and test configuration.
2. Verify test token and chain configuration against official documentation/explorer.
3. Draft the vault/mandate storage model.
4. Implement and test deposit/withdraw.
5. Draft EIP-712 attestation struct, domain and verifier authorization model.
6. Identify contract functions/events required by frontend.

## 4. Working agreement

- Work on feature branches; do not push directly to `main`.
- Use pull requests, even for a two-person team.
- Keep PRs focused and reasonably small.
- Every PR must state what changed, how it was tested and any integration impact.
- Run relevant tests before requesting review.
- Review the other person's PR promptly.
- Post a short daily update: **Done / Next / Blocked**.
- Raise blockers early; do not silently change shared interfaces.
- Update docs when protocol, ABI, API or deployment assumptions change.

## 5. Definition of done

A task is done only when:
- implementation is committed;
- relevant tests pass;
- interface changes are documented;
- secrets are not included;
- the change is reviewed and merged;
- the integration owner can consume it.
