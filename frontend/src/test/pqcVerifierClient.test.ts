import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentVerificationEnvelope } from '../domain/types';
import { PqcVerifierClient } from '../services/pqcVerifier/client';

const SAMPLE_ENVELOPE: PaymentVerificationEnvelope = {
  protocolVersion: '1',
  request: {
    chainId: '11155111',
    vault: '0x2222222222222222222222222222222222222222',
    agentId: `0x${'aa'.repeat(32)}`,
    keyId: `0x${'bb'.repeat(32)}`,
    mandateId: `0x${'cc'.repeat(32)}`,
    token: '0x1111111111111111111111111111111111111111',
    recipient: '0x3333333333333333333333333333333333333333',
    amount: '1000000',
    nonce: `0x${'dd'.repeat(32)}`,
    deadline: 1893456000,
  },
  signature: 'A'.repeat(64),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PqcVerifierClient fail-closed behavior', () => {
  it('returns unconfigured status when no base URL is set', async () => {
    const client = new PqcVerifierClient(null);
    const health = await client.checkHealth();
    expect(health.status).toBe('unconfigured');

    const verify = await client.verifyPaymentRequest(SAMPLE_ENVELOPE);
    expect(verify.status).toBe('unconfigured');
  });

  it('fails closed when verifier is unreachable (never falls back to mock)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const client = new PqcVerifierClient('http://127.0.0.1:8000');
    const result = await client.verifyPaymentRequest(SAMPLE_ENVELOPE);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('VERIFIER_UNAVAILABLE');
    }
  });

  it('rejects malformed verifier responses instead of assuming verified', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'verified', verified: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new PqcVerifierClient('http://127.0.0.1:8000');
    const result = await client.verifyPaymentRequest(SAMPLE_ENVELOPE);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });

  it('parses structured rejected responses accurately', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'rejected',
          code: 'INVALID_SIGNATURE',
          message: 'The ML-DSA-65 signature could not be verified.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const client = new PqcVerifierClient('http://127.0.0.1:8000');
    const result = await client.verifyPaymentRequest(SAMPLE_ENVELOPE);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.data.status).toBe('rejected');
      if (result.data.status === 'rejected') {
        expect(result.data.code).toBe('INVALID_SIGNATURE');
      }
    }
  });

  it('parses valid EIP-712 attestation responses accurately', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'verified',
          requestId: 'req_01J9TEST',
          attestation: {
            requestDigest: `0x${'12'.repeat(32)}`,
            agentId: `0x${'aa'.repeat(32)}`,
            mandateId: `0x${'cc'.repeat(32)}`,
            nonce: `0x${'dd'.repeat(32)}`,
            deadline: 1893456000,
            verifier: '0x4444444444444444444444444444444444444444',
            signature: `0x${'ef'.repeat(65)}`,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const client = new PqcVerifierClient('http://127.0.0.1:8000');
    const result = await client.verifyPaymentRequest(SAMPLE_ENVELOPE);
    expect(result.status).toBe('ready');
    if (result.status === 'ready' && result.data.status === 'verified') {
      expect(result.data.requestId).toBe('req_01J9TEST');
      expect(result.data.attestation.verifier).toBe(
        '0x4444444444444444444444444444444444444444',
      );
    }
  });

  it('fetches and validates real agent registry, security events, and measured benchmarks', async () => {
    const client = new PqcVerifierClient('http://127.0.0.1:8000');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ agents: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const agents = await client.listAgents();
    expect(agents.status).toBe('ready');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          events: [
            {
              id: 'evt_1',
              timestamp: 1800000000,
              layer: 'PQC_VERIFIER',
              code: 'INVALID_SIGNATURE',
              summary: 'Rejected tampered payload',
              severity: 'critical',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const events = await client.listSecurityEvents();
    expect(events.status).toBe('ready');
    if (events.status === 'ready') {
      expect(events.data[0]?.code).toBe('INVALID_SIGNATURE');
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'unavailable' }), { status: 404 }),
    );
    const bench = await client.fetchBenchmarks();
    expect(bench.status).toBe('unconfigured');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          agent: {
            agentId: `0x${'aa'.repeat(32)}`,
            label: 'Rotated Agent',
            owner: '0x4444444444444444444444444444444444444444',
            algorithm: 'ML-DSA-65',
            activeKeyId: `0x${'22'.repeat(32)}`,
            publicKeyFingerprint: 'sha256:abcd',
            keyStatus: 'active',
            registeredAt: 1800000000,
            rotationHistory: [],
            assignedMandateIds: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const rotated = await client.rotateAgentKey({
      agentId: `0x${'aa'.repeat(32)}`,
      owner: '0x4444444444444444444444444444444444444444',
      newKeyId: `0x${'22'.repeat(32)}`,
      newPublicKey: `0x${'11'.repeat(1952)}`,
      timestamp: 1800000000,
      ownerSignature: `0x${'ef'.repeat(65)}`,
    });
    expect(rotated.status).toBe('ready');
    if (rotated.status === 'ready') {
      expect(rotated.data.activeKeyId).toBe(`0x${'22'.repeat(32)}`);
    }
  });
});
