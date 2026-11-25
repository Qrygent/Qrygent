import { getAddress, hexToBytes, type Address, type Hex } from 'viem';
import { envConfig } from '../../config/env';
import type {
  AgentRecord,
  BenchmarkDataset,
  PaymentVerificationEnvelope,
  SecurityEvent,
  ServiceResult,
  VerificationResponse,
  VerifierHealthStatus,
} from '../../domain/types';
import {
  agentRecordSchema,
  agentsListResponseSchema,
  benchmarkDatasetSchema,
  paymentVerificationEnvelopeSchema,
  securityEventsResponseSchema,
  verificationResponseSchema,
} from './schemas';

const DEFAULT_TIMEOUT_MS = 8000;
const ML_DSA_65_PUBLIC_KEY_BYTES = 1952;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type OwnerKeyAction = 'REGISTER_AGENT_KEY' | 'ROTATE_AGENT_KEY' | 'REVOKE_AGENT_KEY';

export function buildOwnerKeyAuthMessage(params: {
  action: OwnerKeyAction;
  owner: Address;
  agentId: Hex;
  keyId: Hex;
  publicKeyFingerprint: string;
  timestamp: number;
}): string {
  return [
    'Qrygent Vault — Owner ML-DSA-65 Key Authorization',
    `Action: ${params.action}`,
    `Owner: ${getAddress(params.owner)}`,
    `AgentId: ${params.agentId.toLowerCase()}`,
    `KeyId: ${params.keyId.toLowerCase()}`,
    `Fingerprint: ${params.publicKeyFingerprint}`,
    `Timestamp: ${params.timestamp}`,
  ].join('\n');
}

/**
 * Decodes an ML-DSA-65 public key (0x-hex or strict base64) and computes its SHA-256 fingerprint
 * in the browser using Web Crypto API. Enforces exact 1,952-byte FIPS 204 length.
 */
export async function computePublicKeyFingerprintBrowser(encodedPublicKey: string): Promise<string> {
  const trimmed = encodedPublicKey.trim();
  let bytes: Uint8Array;

  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    if ((trimmed.length - 2) % 2 !== 0) {
      throw new Error('Public key hex string must have an even number of characters.');
    }
    bytes = hexToBytes(trimmed as Hex);
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
    const bin = atob(trimmed);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
  } else {
    throw new Error('Public key must be valid 0x-hex or strict base64.');
  }

  if (bytes.length !== ML_DSA_65_PUBLIC_KEY_BYTES) {
    throw new Error(
      `ML-DSA-65 public key must be exactly ${ML_DSA_65_PUBLIC_KEY_BYTES} bytes (received ${bytes.length} bytes).`,
    );
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', copy.buffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hashHex}`;
}

export interface RegisterAgentKeyInput {
  agentId: Hex;
  label: string;
  owner: Address;
  keyId: Hex;
  publicKey: string;
  timestamp: number;
  ownerSignature: Hex;
}

export interface RotateAgentKeyInput {
  agentId: Hex;
  owner: Address;
  newKeyId: Hex;
  newPublicKey: string;
  timestamp: number;
  ownerSignature: Hex;
}

export interface RevokeAgentKeyInput {
  agentId: Hex;
  owner: Address;
  keyId: Hex;
  reason?: string;
  timestamp: number;
  ownerSignature: Hex;
}

/**
 * Real HTTP client for the Qrygent PQC Verification Service (docs/API.md).
 * Fail-closed: never falls back to mock data on network failure, timeout, or schema mismatch.
 */
export class PqcVerifierClient {
  private readonly baseUrl: string | null;

  constructor(baseUrl: string | null = envConfig.pqcServiceBaseUrl) {
    this.baseUrl = baseUrl;
  }

  get configuredUrl(): string | null {
    return this.baseUrl;
  }

  private isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  private endpoint(path: string): string {
    return `${this.baseUrl ?? ''}${path}`;
  }

  async checkHealth(): Promise<VerifierHealthStatus> {
    const checkedAt = new Date().toISOString();
    if (!this.isConfigured()) {
      return {
        reachable: false,
        status: 'unconfigured',
        checkedAt,
        message:
          'Set VITE_PQC_SERVICE_BASE_URL (use "/" for same-origin Vercel or http://127.0.0.1:8000 locally) to monitor verifier health.',
      };
    }

    const start = performance.now();
    try {
      const response = await fetchWithTimeout(this.endpoint('/v1/health'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const latencyMs = Math.round(performance.now() - start);
      let body: Record<string, unknown> | undefined;
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        // Non-JSON health body is still informative via HTTP status
      }

      if (response.ok) {
        return {
          reachable: true,
          status: 'healthy',
          httpStatus: response.status,
          latencyMs,
          checkedAt,
          details: body,
        };
      }

      return {
        reachable: true,
        status: 'degraded',
        httpStatus: response.status,
        latencyMs,
        checkedAt,
        message: `Verifier responded with HTTP ${response.status}.`,
        details: body,
      };
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      return {
        reachable: false,
        status: 'unreachable',
        checkedAt,
        message: isTimeout
          ? `Health check timed out after ${DEFAULT_TIMEOUT_MS}ms (${this.baseUrl}/v1/health).`
          : `Unable to reach PQC verifier at ${this.baseUrl}/v1/health. Start pqc-service (npm --prefix pqc-service run start).`,
      };
    }
  }

  async verifyPaymentRequest(
    envelope: PaymentVerificationEnvelope,
  ): Promise<ServiceResult<VerificationResponse>> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        reason: 'PQC verifier base URL is not configured.',
        missing: ['VITE_PQC_SERVICE_BASE_URL'],
        owner: 'Product / Frontend / PQC Lead',
      };
    }

    const reqValidation = paymentVerificationEnvelopeSchema.safeParse(envelope);
    if (!reqValidation.success) {
      return {
        status: 'error',
        code: 'MALFORMED_REQUEST',
        message: reqValidation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }

    try {
      const response = await fetchWithTimeout(this.endpoint('/v1/payments/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(reqValidation.data),
      });

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return {
          status: 'error',
          code: 'VERIFIER_UNAVAILABLE',
          httpStatus: response.status,
          message: `Verifier returned non-JSON response (HTTP ${response.status}). Failing closed.`,
        };
      }

      const parsed = verificationResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          status: 'error',
          code: 'INTERNAL_ERROR',
          httpStatus: response.status,
          message:
            'Verifier response failed schema validation against docs/API.md. Refusing to treat unverified payload as valid.',
        };
      }

      return { status: 'ready', data: parsed.data };
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: isTimeout
          ? `Verification request timed out after ${DEFAULT_TIMEOUT_MS}ms.`
          : `Network error contacting ${this.baseUrl}/v1/payments/verify. Ensure pqc-service is running.`,
      };
    }
  }

  async listAgents(): Promise<ServiceResult<AgentRecord[]>> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        reason: 'Set VITE_PQC_SERVICE_BASE_URL to load registered ML-DSA-65 agent identities.',
        missing: ['VITE_PQC_SERVICE_BASE_URL'],
        owner: 'Product / Frontend / PQC Lead',
      };
    }

    try {
      const response = await fetchWithTimeout(this.endpoint('/v1/agents'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return {
          status: 'error',
          httpStatus: response.status,
          message: `PQC verifier returned HTTP ${response.status} for GET /v1/agents.`,
        };
      }
      const parsed = agentsListResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return {
          status: 'error',
          message: 'Agent registry response failed schema validation.',
        };
      }
      return { status: 'ready', data: parsed.data.agents };
    } catch {
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: `Unable to reach ${this.endpoint('/v1/agents')}. Start pqc-service to inspect registered agents.`,
      };
    }
  }

  async registerAgentKey(input: RegisterAgentKeyInput): Promise<ServiceResult<AgentRecord>> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        reason: 'PQC verifier base URL is not configured.',
        missing: ['VITE_PQC_SERVICE_BASE_URL'],
        owner: 'Product / Frontend / PQC Lead',
      };
    }

    try {
      const response = await fetchWithTimeout(this.endpoint('/v1/agents/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input),
      });
      const json = (await response.json()) as { agent?: unknown; message?: string; code?: string };
      if (!response.ok) {
        return {
          status: 'error',
          httpStatus: response.status,
          code: json.code,
          message: json.message ?? `Key registration failed (HTTP ${response.status}).`,
        };
      }
      const parsed = agentRecordSchema.safeParse(json.agent);
      if (!parsed.success) {
        return { status: 'error', message: 'Invalid agent payload returned from verifier.' };
      }
      return { status: 'ready', data: parsed.data };
    } catch {
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: `Unable to reach ${this.endpoint('/v1/agents/register')}.`,
      };
    }
  }

  async rotateAgentKey(input: RotateAgentKeyInput): Promise<ServiceResult<AgentRecord>> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        reason: 'PQC verifier base URL is not configured.',
        missing: ['VITE_PQC_SERVICE_BASE_URL'],
        owner: 'Product / Frontend / PQC Lead',
      };
    }

    try {
      const response = await fetchWithTimeout(
        this.endpoint(`/v1/agents/${input.agentId.toLowerCase()}/rotate`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            owner: input.owner,
            newKeyId: input.newKeyId,
            newPublicKey: input.newPublicKey,
            timestamp: input.timestamp,
            ownerSignature: input.ownerSignature,
          }),
        },
      );
      const json = (await response.json()) as { agent?: unknown; message?: string; code?: string };
      if (!response.ok) {
        return {
          status: 'error',
          httpStatus: response.status,
          code: json.code,
          message: json.message ?? `Key rotation failed (HTTP ${response.status}).`,
        };
      }
      const parsed = agentRecordSchema.safeParse(json.agent);
      if (!parsed.success) {
        return { status: 'error', message: 'Invalid agent payload returned from verifier.' };
      }
      return { status: 'ready', data: parsed.data };
    } catch {
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: `Unable to reach ${this.endpoint(`/v1/agents/${input.agentId}/rotate`)}.`,
      };
    }
  }

  async revokeAgentKey(input: RevokeAgentKeyInput): Promise<ServiceResult<AgentRecord>> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        reason: 'PQC verifier base URL is not configured.',
        missing: ['VITE_PQC_SERVICE_BASE_URL'],
        owner: 'Product / Frontend / PQC Lead',
      };
    }

    try {
      const response = await fetchWithTimeout(
        this.endpoint(`/v1/agents/${input.agentId.toLowerCase()}/revoke`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            owner: input.owner,
            keyId: input.keyId,
            reason: input.reason,
            timestamp: input.timestamp,
            ownerSignature: input.ownerSignature,
          }),
        },
      );
      const json = (await response.json()) as { agent?: unknown; message?: string; code?: string };
      if (!response.ok) {
        return {
          status: 'error',
          httpStatus: response.status,
          code: json.code,
          message: json.message ?? `Key revocation failed (HTTP ${response.status}).`,
        };
      }
      const parsed = agentRecordSchema.safeParse(json.agent);
      if (!parsed.success) {
        return { status: 'error', message: 'Invalid agent payload returned from verifier.' };
      }
      return { status: 'ready', data: parsed.data };
    } catch {
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: `Unable to reach ${this.endpoint(`/v1/agents/${input.agentId}/revoke`)}.`,
      };
    }
  }

  async listSecurityEvents(): Promise<ServiceResult<SecurityEvent[]>> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        reason: 'Set VITE_PQC_SERVICE_BASE_URL to stream off-chain PQC security events.',
        missing: ['VITE_PQC_SERVICE_BASE_URL'],
        owner: 'Product / Frontend / PQC Lead',
      };
    }

    try {
      const response = await fetchWithTimeout(this.endpoint('/v1/security/events'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return {
          status: 'error',
          httpStatus: response.status,
          message: `Security audit endpoint returned HTTP ${response.status}.`,
        };
      }
      const parsed = securityEventsResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return { status: 'error', message: 'Security events response failed schema validation.' };
      }
      return { status: 'ready', data: parsed.data.events };
    } catch {
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: `Unable to reach ${this.endpoint('/v1/security/events')}. Start pqc-service to stream live verification rejections.`,
      };
    }
  }

  async fetchBenchmarks(): Promise<ServiceResult<BenchmarkDataset>> {
    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        reason:
          'Set VITE_PQC_SERVICE_BASE_URL (or upload pqc-service/benchmarks/latest.json) to load measured ML-DSA-65 benchmark telemetry.',
        missing: ['VITE_PQC_SERVICE_BASE_URL'],
        owner: 'Product / Frontend / PQC Lead',
      };
    }

    try {
      const response = await fetchWithTimeout(this.endpoint('/v1/benchmarks'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 404) {
        return {
          status: 'unconfigured',
          reason: 'No measured benchmark dataset has been generated on pqc-service yet.',
          missing: ['Run npm --prefix pqc-service run bench'],
          owner: 'Product / Frontend / PQC Lead',
        };
      }
      if (!response.ok) {
        return {
          status: 'error',
          httpStatus: response.status,
          message: `Benchmarks endpoint returned HTTP ${response.status}.`,
        };
      }
      const parsed = benchmarkDatasetSchema.safeParse(await response.json());
      if (!parsed.success) {
        return { status: 'error', message: 'Benchmark response failed schema validation.' };
      }
      return { status: 'ready', data: parsed.data };
    } catch {
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: `Unable to reach ${this.endpoint('/v1/benchmarks')}. Start pqc-service or upload pqc-service/benchmarks/latest.json locally.`,
      };
    }
  }
}

export const pqcVerifierClient = new PqcVerifierClient();
