import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { Eip712AttestationSigner } from '../crypto/eip712.js';
import { generateMldsa65KeyPair, signDigestMldsa65 } from '../crypto/mldsa.js';
import {
  buildOwnerKeyAuthMessage,
  computeCanonicalRequestDigest,
  SUPPORTED_PROTOCOL_VERSION,
} from '../protocol/canonical.js';
import { createPqcHttpServer } from '../server.js';
import { PaymentVerifierService } from '../service/verifier.js';
import { RegistryStore } from '../store/registry.js';

describe('PQC HTTP API end-to-end integration', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const store = new RegistryStore(null);
    const signer = new Eip712AttestationSigner(generatePrivateKey(), 120);
    const verifier = new PaymentVerifierService(store, signer);
    server = createPqcHttpServer(verifier, { corsOrigin: 'http://localhost:5173' });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('serves /v1/health, registers agent key with owner sig, verifies ML-DSA-65 payment, and logs security events', async () => {
    const healthRes = await fetch(`${baseUrl}/v1/health`);
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as { algorithm: string; attestationSignerReady: boolean };
    expect(health.algorithm).toBe('ML-DSA-65');
    expect(health.attestationSignerReady).toBe(true);

    const owner = privateKeyToAccount(generatePrivateKey());
    const agentKey = generateMldsa65KeyPair();
    const agentId = `0x${'ab'.repeat(32)}` as Hex;
    const keyId = `0x${'cd'.repeat(32)}` as Hex;
    const now = Math.floor(Date.now() / 1000);

    const authMsg = buildOwnerKeyAuthMessage({
      action: 'REGISTER_AGENT_KEY',
      owner: owner.address,
      agentId,
      keyId,
      publicKeyFingerprint: agentKey.publicKeyFingerprint,
      timestamp: now,
    });
    const ownerSignature = await owner.signMessage({ message: authMsg });

    const regRes = await fetch(`${baseUrl}/v1/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        label: 'HTTP E2E Agent',
        owner: owner.address,
        keyId,
        publicKey: agentKey.publicKeyHex,
        timestamp: now,
        ownerSignature,
      }),
    });
    expect(regRes.status).toBe(201);

    const listRes = await fetch(`${baseUrl}/v1/agents`);
    const listBody = (await listRes.json()) as { agents: Array<{ agentId: string; label: string }> };
    expect(listBody.agents).toHaveLength(1);
    expect(listBody.agents[0]?.label).toBe('HTTP E2E Agent');

    const request = {
      chainId: '11155111',
      vault: '0x2222222222222222222222222222222222222222' as const,
      agentId,
      keyId,
      mandateId: `0x${'ef'.repeat(32)}` as Hex,
      token: '0x1111111111111111111111111111111111111111' as const,
      recipient: '0x3333333333333333333333333333333333333333' as const,
      amount: '50000000',
      nonce: `0x${'99'.repeat(32)}` as Hex,
      deadline: now + 300,
    };
    const digest = computeCanonicalRequestDigest(request, SUPPORTED_PROTOCOL_VERSION);
    const signature = signDigestMldsa65(digest, agentKey.secretKey);

    const verifyRes = await fetch(`${baseUrl}/v1/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: SUPPORTED_PROTOCOL_VERSION, request, signature }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as {
      status: string;
      verification: {
        algorithm: string;
        publicKeyFingerprint: string;
        verifiedAt: string;
        integrityStatus: string;
      };
      attestation: { requestDigest: string };
    };
    expect(verifyBody.status).toBe('verified');
    expect(verifyBody.verification.algorithm).toBe('ML-DSA-65');
    expect(verifyBody.verification.publicKeyFingerprint).toBe(agentKey.publicKeyFingerprint);
    expect(verifyBody.verification.integrityStatus).toBe('intact');
    expect(verifyBody.attestation.requestDigest).toBe(digest);

    const eventsRes = await fetch(`${baseUrl}/v1/security/events`);
    const eventsBody = (await eventsRes.json()) as { events: Array<{ code: string }> };
    expect(eventsBody.events.some((e) => e.code === 'PAYMENT_ATTESTED')).toBe(true);
    expect(eventsBody.events.some((e) => e.code === 'KEY_REGISTERED')).toBe(true);
  });

  it('enforces per-IP POST rate limiting with HTTP 429 RATE_LIMITED', async () => {
    const store = new RegistryStore(null);
    const signer = new Eip712AttestationSigner(generatePrivateKey(), 120);
    const verifier = new PaymentVerifierService(store, signer);
    const limitedServer = createPqcHttpServer(verifier, {
      corsOrigin: 'http://localhost:5173',
      rateLimitMaxRequests: 2,
      rateLimitWindowMs: 60_000,
    });

    await new Promise<void>((resolve) => {
      limitedServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = limitedServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}/v1/payments/verify`;

    try {
      const r1 = await fetch(url, { method: 'POST', body: '{}' });
      const r2 = await fetch(url, { method: 'POST', body: '{}' });
      const r3 = await fetch(url, { method: 'POST', body: '{}' });

      expect(r1.status).toBe(400);
      expect(r2.status).toBe(400);
      expect(r3.status).toBe(429);
      const body = (await r3.json()) as { code: string };
      expect(body.code).toBe('RATE_LIMITED');
    } finally {
      await new Promise<void>((resolve, reject) => {
        limitedServer.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
