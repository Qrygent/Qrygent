import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Eip712AttestationSigner, verifyEip712Attestation } from '../crypto/eip712.js';
import { generateMldsa65KeyPair, signDigestMldsa65 } from '../crypto/mldsa.js';
import {
  buildOwnerKeyAuthMessage,
  computeCanonicalRequestDigest,
  SUPPORTED_PROTOCOL_VERSION,
  type CanonicalPaymentRequest,
} from '../protocol/canonical.js';
import { PaymentVerifierService } from '../service/verifier.js';
import { RegistryStore } from '../store/registry.js';

const NOW = 1_800_000_000;
const CHAIN_ID = '11155111';
const VAULT = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x3333333333333333333333333333333333333333';
const AGENT_ID = `0x${'aa'.repeat(32)}` as Hex;
const KEY_ID_1 = `0x${'11'.repeat(32)}` as Hex;
const KEY_ID_2 = `0x${'22'.repeat(32)}` as Hex;
const MANDATE_ID = `0x${'cc'.repeat(32)}` as Hex;

async function setupFixture() {
  const ownerAccount = privateKeyToAccount(generatePrivateKey());
  const verifierSigner = new Eip712AttestationSigner(generatePrivateKey(), 120);
  const store = new RegistryStore(null);
  const service = new PaymentVerifierService(store, verifierSigner, {
    expectedChainId: CHAIN_ID,
    expectedVaultAddress: VAULT,
  });

  const agentKey = generateMldsa65KeyPair();
  const authMsg = buildOwnerKeyAuthMessage({
    action: 'REGISTER_AGENT_KEY',
    owner: ownerAccount.address,
    agentId: AGENT_ID,
    keyId: KEY_ID_1,
    publicKeyFingerprint: agentKey.publicKeyFingerprint,
    timestamp: NOW,
  });
  const ownerSignature = await ownerAccount.signMessage({ message: authMsg });

  await service.registerAgentKey(
    {
      agentId: AGENT_ID,
      label: 'Treasury Simulator',
      owner: ownerAccount.address,
      keyId: KEY_ID_1,
      publicKey: agentKey.publicKeyHex,
      timestamp: NOW,
      ownerSignature,
    },
    NOW,
  );

  return { ownerAccount, verifierSigner, store, service, agentKey };
}

function buildRequest(overrides: Partial<CanonicalPaymentRequest> = {}): CanonicalPaymentRequest {
  return {
    chainId: CHAIN_ID,
    vault: VAULT,
    agentId: AGENT_ID,
    keyId: KEY_ID_1,
    mandateId: MANDATE_ID,
    token: TOKEN,
    recipient: RECIPIENT,
    amount: '250000000',
    nonce: `0x${'01'.repeat(32)}`,
    deadline: NOW + 300,
    ...overrides,
  };
}

describe('Qrygent ML-DSA-65 Verification & EIP-712 Attestation Security Suite', () => {
  it('accepts a valid ML-DSA-65 signed request and issues a recoverable EIP-712 attestation', async () => {
    const { service, agentKey, verifierSigner } = await setupFixture();
    const request = buildRequest();
    const digest = computeCanonicalRequestDigest(request, SUPPORTED_PROTOCOL_VERSION);
    const signature = signDigestMldsa65(digest, agentKey.secretKey);

    const outcome = await service.verifyPaymentRequest(
      { protocolVersion: SUPPORTED_PROTOCOL_VERSION, request, signature },
      NOW,
    );

    expect(outcome.httpStatus).toBe(200);
    if (outcome.body.status === 'verified') {
      expect(outcome.body.attestation.requestDigest).toBe(digest);
      expect(outcome.body.attestation.verifier).toBe(verifierSigner.verifierAddress);
      // Capped to short-lived verifier TTL (120s) even though request deadline was +300s
      expect(outcome.body.attestation.deadline).toBe(NOW + 120);

      const eip712Valid = await verifyEip712Attestation({
        chainId: BigInt(CHAIN_ID),
        vault: VAULT,
        attestation: outcome.body.attestation,
      });
      expect(eip712Valid).toBe(true);
    }
  });

  it('rejects a corrupted ML-DSA-65 signature with INVALID_SIGNATURE', async () => {
    const { service, agentKey } = await setupFixture();
    const request = buildRequest();
    const digest = computeCanonicalRequestDigest(request);
    const sigBytes = hexToBytes(signDigestMldsa65(digest, agentKey.secretKey));
    sigBytes[10] = (sigBytes[10] ?? 0) ^ 0xff;

    const outcome = await service.verifyPaymentRequest(
      { protocolVersion: '1', request, signature: bytesToHex(sigBytes) },
      NOW,
    );

    expect(outcome.httpStatus).toBe(401);
    expect(outcome.body.status).toBe('rejected');
    if (outcome.body.status === 'rejected') {
      expect(outcome.body.code).toBe('INVALID_SIGNATURE');
    }
  });

  it('rejects tampered recipient or tampered amount after signing', async () => {
    const { service, agentKey } = await setupFixture();
    const original = buildRequest();
    const digest = computeCanonicalRequestDigest(original);
    const signature = signDigestMldsa65(digest, agentKey.secretKey);

    const alteredAmount = await service.verifyPaymentRequest(
      { protocolVersion: '1', request: { ...original, amount: '999000000' }, signature },
      NOW,
    );
    expect(alteredAmount.body.status).toBe('rejected');
    if (alteredAmount.body.status === 'rejected') {
      expect(alteredAmount.body.code).toBe('INVALID_SIGNATURE');
    }

    const alteredRecipient = await service.verifyPaymentRequest(
      {
        protocolVersion: '1',
        request: { ...original, recipient: '0x9999999999999999999999999999999999999999' },
        signature,
      },
      NOW,
    );
    expect(alteredRecipient.body.status).toBe('rejected');
    if (alteredRecipient.body.status === 'rejected') {
      expect(alteredRecipient.body.code).toBe('INVALID_SIGNATURE');
    }
  });

  it('rejects replay attempts reusing the same nonce', async () => {
    const { service, agentKey } = await setupFixture();
    const request = buildRequest({ nonce: `0x${'77'.repeat(32)}` });
    const digest = computeCanonicalRequestDigest(request);
    const signature = signDigestMldsa65(digest, agentKey.secretKey);

    const first = await service.verifyPaymentRequest(
      { protocolVersion: '1', request, signature },
      NOW,
    );
    expect(first.httpStatus).toBe(200);

    const replay = await service.verifyPaymentRequest(
      { protocolVersion: '1', request, signature },
      NOW + 1,
    );
    expect(replay.httpStatus).toBe(409);
    if (replay.body.status === 'rejected') {
      expect(replay.body.code).toBe('NONCE_ALREADY_USED');
    }
  });

  it('rejects expired requests, wrong chain, and wrong vault', async () => {
    const { service, agentKey } = await setupFixture();
    const expiredReq = buildRequest({ deadline: NOW - 5 });
    const expiredSig = signDigestMldsa65(computeCanonicalRequestDigest(expiredReq), agentKey.secretKey);
    const expiredRes = await service.verifyPaymentRequest(
      { protocolVersion: '1', request: expiredReq, signature: expiredSig },
      NOW,
    );
    expect(expiredRes.body.status === 'rejected' && expiredRes.body.code).toBe('REQUEST_EXPIRED');

    const wrongChainReq = buildRequest({ chainId: '1' });
    const wrongChainSig = signDigestMldsa65(
      computeCanonicalRequestDigest(wrongChainReq),
      agentKey.secretKey,
    );
    const wrongChainRes = await service.verifyPaymentRequest(
      { protocolVersion: '1', request: wrongChainReq, signature: wrongChainSig },
      NOW,
    );
    expect(wrongChainRes.body.status === 'rejected' && wrongChainRes.body.code).toBe('WRONG_CHAIN');

    const wrongVaultReq = buildRequest({
      vault: '0x5555555555555555555555555555555555555555',
    });
    const wrongVaultSig = signDigestMldsa65(
      computeCanonicalRequestDigest(wrongVaultReq),
      agentKey.secretKey,
    );
    const wrongVaultRes = await service.verifyPaymentRequest(
      { protocolVersion: '1', request: wrongVaultReq, signature: wrongVaultSig },
      NOW,
    );
    expect(wrongVaultRes.body.status === 'rejected' && wrongVaultRes.body.code).toBe('WRONG_VAULT');
  });

  it('enforces owner-authenticated key rotation and immediate revocation', async () => {
    const { service, ownerAccount, agentKey } = await setupFixture();
    const attacker = privateKeyToAccount(generatePrivateKey());
    const newKey = generateMldsa65KeyPair();

    // Attacker cannot rotate owner's key
    const badMsg = buildOwnerKeyAuthMessage({
      action: 'ROTATE_AGENT_KEY',
      owner: ownerAccount.address,
      agentId: AGENT_ID,
      keyId: KEY_ID_2,
      publicKeyFingerprint: newKey.publicKeyFingerprint,
      timestamp: NOW,
    });
    const attackerSig = await attacker.signMessage({ message: badMsg });
    await expect(
      service.rotateAgentKey(
        AGENT_ID,
        {
          owner: ownerAccount.address,
          newKeyId: KEY_ID_2,
          newPublicKey: newKey.publicKeyHex,
          timestamp: NOW,
          ownerSignature: attackerSig,
        },
        NOW,
      ),
    ).rejects.toThrow(/Invalid owner wallet signature/i);

    // Owner rotates to KEY_ID_2
    const ownerRotateSig = await ownerAccount.signMessage({ message: badMsg });
    await service.rotateAgentKey(
      AGENT_ID,
      {
        owner: ownerAccount.address,
        newKeyId: KEY_ID_2,
        newPublicKey: newKey.publicKeyHex,
        timestamp: NOW,
        ownerSignature: ownerRotateSig,
      },
      NOW,
    );

    // Old KEY_ID_1 is rejected
    const oldReq = buildRequest({ keyId: KEY_ID_1, nonce: `0x${'09'.repeat(32)}` });
    const oldSig = signDigestMldsa65(computeCanonicalRequestDigest(oldReq), agentKey.secretKey);
    const oldRes = await service.verifyPaymentRequest(
      { protocolVersion: '1', request: oldReq, signature: oldSig },
      NOW,
    );
    expect(oldRes.body.status === 'rejected' && oldRes.body.code).toBe('REVOKED_KEY');

    // Owner revokes KEY_ID_2 -> immediately rejected
    const revokeMsg = buildOwnerKeyAuthMessage({
      action: 'REVOKE_AGENT_KEY',
      owner: ownerAccount.address,
      agentId: AGENT_ID,
      keyId: KEY_ID_2,
      publicKeyFingerprint: newKey.publicKeyFingerprint,
      timestamp: NOW,
    });
    const revokeSig = await ownerAccount.signMessage({ message: revokeMsg });
    await service.revokeAgentKey(
      AGENT_ID,
      {
        owner: ownerAccount.address,
        keyId: KEY_ID_2,
        reason: 'Key compromise drill',
        timestamp: NOW,
        ownerSignature: revokeSig,
      },
      NOW,
    );

    const revokedReq = buildRequest({ keyId: KEY_ID_2, nonce: `0x${'10'.repeat(32)}` });
    const revokedSig = signDigestMldsa65(computeCanonicalRequestDigest(revokedReq), newKey.secretKey);
    const revokedRes = await service.verifyPaymentRequest(
      { protocolVersion: '1', request: revokedReq, signature: revokedSig },
      NOW,
    );
    expect(revokedRes.httpStatus).toBe(403);
    expect(revokedRes.body.status === 'rejected' && revokedRes.body.code).toBe('REVOKED_KEY');
  });

  it('fails closed when verifier attestation signer key is missing', async () => {
    const ownerAccount = privateKeyToAccount(generatePrivateKey());
    const store = new RegistryStore(null);
    const service = new PaymentVerifierService(store, null);
    const agentKey = generateMldsa65KeyPair();

    const authMsg = buildOwnerKeyAuthMessage({
      action: 'REGISTER_AGENT_KEY',
      owner: ownerAccount.address,
      agentId: AGENT_ID,
      keyId: KEY_ID_1,
      publicKeyFingerprint: agentKey.publicKeyFingerprint,
      timestamp: NOW,
    });
    const ownerSignature = await ownerAccount.signMessage({ message: authMsg });
    await service.registerAgentKey(
      {
        agentId: AGENT_ID,
        label: 'No-Signer Test',
        owner: ownerAccount.address,
        keyId: KEY_ID_1,
        publicKey: agentKey.publicKeyHex,
        timestamp: NOW,
        ownerSignature,
      },
      NOW,
    );

    const req = buildRequest();
    const sig = signDigestMldsa65(computeCanonicalRequestDigest(req), agentKey.secretKey);
    const res = await service.verifyPaymentRequest(
      { protocolVersion: '1', request: req, signature: sig },
      NOW,
    );
    expect(res.httpStatus).toBe(503);
    expect(res.body.status === 'rejected' && res.body.code).toBe('VERIFIER_UNAVAILABLE');
  });
});
