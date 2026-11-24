# Contributing to Qrygent

Thanks for contributing.

## Branching

- `main` is the stable integration branch.
- Create branches from the latest `main`.
- Suggested names:
  - `feat/frontend-wallet-connect`
  - `feat/vault-mandates`
  - `feat/mldsa-verifier`
  - `fix/replay-protection`
  - `docs/architecture-update`

## Pull requests

Every PR should include:
1. Summary of the change.
2. Why the change is needed.
3. Tests run and their results.
4. Screenshots for visible UI changes.
5. ABI/API/protocol changes and migration notes.
6. Security implications or new trust assumptions.

Do not merge a PR that changes shared protocol fields without approval from both integration owners.

## Commit messages

Use concise imperative messages, for example:
- `feat: add mandate creation flow`
- `fix: reject reused payment nonce`
- `test: cover expired mandate execution`
- `docs: clarify verifier trust model`

## Security

- Never commit secrets or private keys.
- Do not implement cryptographic primitives from scratch.
- Do not log private key material or full sensitive payloads.
- Report suspected vulnerabilities privately to the project maintainers rather than publishing exploit details in an issue.

## Local configuration

Commit `.env.example` with placeholders only. Keep actual `.env` files untracked.
