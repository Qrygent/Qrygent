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
  paymentVerificationEnvelopeSchema,
  verificationResponseSchema,
} from './schemas';

const DEFAULT_TIMEOUT_MS = 8000;

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

  /**
   * Probes GET /v1/health on the configured PQC verifier.
   */
  async checkHealth(): Promise<VerifierHealthStatus> {
    const checkedAt = new Date().toISOString();
    if (!this.baseUrl) {
      return {
        reachable: false,
        status: 'unconfigured',
        checkedAt,
        message: 'Set VITE_PQC_SERVICE_BASE_URL in your local .env file to monitor verifier health.',
      };
    }

    const start = performance.now();
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/v1/health`, {
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
          : `Unable to reach PQC verifier at ${this.baseUrl}/v1/health. Ensure pqc-service is running and CORS allows this origin.`,
      };
    }
  }

  /**
   * Submits a canonical ML-DSA-65 signed payment envelope to POST /v1/payments/verify.
   * Validates both outgoing request and incoming response with Zod (fail closed).
   */
  async verifyPaymentRequest(
    envelope: PaymentVerificationEnvelope,
  ): Promise<ServiceResult<VerificationResponse>> {
    if (!this.baseUrl) {
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
      const response = await fetchWithTimeout(`${this.baseUrl}/v1/payments/verify`, {
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

      return {
        status: 'ready',
        data: parsed.data,
      };
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      return {
        status: 'error',
        code: 'VERIFIER_UNAVAILABLE',
        message: isTimeout
          ? `Verification request timed out after ${DEFAULT_TIMEOUT_MS}ms.`
          : `Network error contacting ${this.baseUrl}/v1/payments/verify. Ensure the PQC verification service is running.`,
      };
    }
  }

  /**
   * Pending Milestone 0 / API v1.0 specification (docs/API.md §4: Key registration and rotation).
   */
  async listAgents(): Promise<ServiceResult<AgentRecord[]>> {
    return {
      status: 'unconfigured',
      reason:
        'Agent & ML-DSA-65 public-key registry source (on-chain commitment vs. verifier API) and read/write schema are not yet frozen in docs/API.md.',
      missing: [
        'Milestone 0 registry architecture decision',
        'Authoritative agent key list / registration API or Contract ABI',
      ],
      owner: 'Shared (Product/PQC Lead + Smart Contract Lead)',
    };
  }

  /**
   * Pending API v1.0 specification for historical off-chain security events.
   */
  async listSecurityEvents(): Promise<ServiceResult<SecurityEvent[]>> {
    return {
      status: 'unconfigured',
      reason:
        'The PQC verification service does not yet specify an audit-log endpoint for historical off-chain rejections.',
      missing: ['GET /v1/security/events (or equivalent) schema in docs/API.md', 'Running pqc-service'],
      owner: 'Product / Frontend / PQC Lead',
    };
  }

  /**
   * Pending measured benchmark dataset (docs/BENCHMARKS.md does not exist yet).
   */
  async fetchBenchmarks(): Promise<ServiceResult<BenchmarkDataset>> {
    return {
      status: 'unconfigured',
      reason:
        'No measured ML-DSA-65 benchmark dataset has been supplied yet (docs/BENCHMARKS.md is not yet present in the repository).',
      missing: ['Measured ML-DSA-65 benchmark run with library/version/runtime metadata'],
      owner: 'Product / Frontend / PQC Lead',
    };
  }
}

export const pqcVerifierClient = new PqcVerifierClient();
