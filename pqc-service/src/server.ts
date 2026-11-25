import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Hex } from 'viem';
import {
  ML_DSA_65_ALGORITHM,
  ML_DSA_65_LIBRARY,
  ML_DSA_65_STANDARD,
} from './crypto/mldsa.js';
import { SUPPORTED_PROTOCOL_VERSION } from './protocol/canonical.js';
import type { PaymentVerifierService } from './service/verifier.js';

const MAX_BODY_BYTES = 65_536; // 64 KB hard limit (ML-DSA-65 envelope is ~8 KB)

export interface HttpServerOptions {
  corsOrigin: string;
  benchmarksPath?: string;
  /** Sliding-window rate limit for POST mutation/verification endpoints (default: 60 req / 60s per IP) */
  rateLimitMaxRequests?: number;
  rateLimitWindowMs?: number;
  /** When true on Vercel serverless without persistent Upstash Redis, stateful endpoints fail closed (HTTP 503). */
  requirePersistentStorage?: boolean;
}

type MaybePreParsedRequest = IncomingMessage & { body?: unknown };

class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(ip: string, nowMs = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const cutoff = nowMs - this.windowMs;
    const recent = (this.hits.get(ip) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= this.maxRequests) {
      const oldest = recent[0] ?? nowMs;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000));
      this.hits.set(ip, recent);
      return { allowed: false, retryAfterSec };
    }
    recent.push(nowMs);
    this.hits.set(ip, recent);
    return { allowed: true, retryAfterSec: 0 };
  }
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  corsOrigin: string,
) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req: MaybePreParsedRequest): Promise<unknown> {
  // Support Vercel Serverless Functions where req.body may already be parsed
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      if (!req.body.trim()) throw new Error('EMPTY_BODY');
      try {
        return JSON.parse(req.body);
      } catch {
        throw new Error('INVALID_JSON');
      }
    }
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_BODY_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
      const raw = req.body.toString('utf8');
      if (!raw.trim()) throw new Error('EMPTY_BODY');
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error('INVALID_JSON');
      }
    }
    if (typeof req.body === 'object' && req.body !== null) {
      const serialized = JSON.stringify(req.body);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      return req.body;
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    throw new Error('EMPTY_BODY');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

/**
 * Normalizes both direct `/v1/...` paths and Vercel rewritten `/api/v1?route=...` paths.
 */
export function resolveNormalizedV1Path(rawUrl: string | undefined): {
  path: string;
  searchParams: URLSearchParams;
} {
  const url = new URL(rawUrl ?? '/', 'http://localhost');
  const routeParam = url.searchParams.get('route');
  if (routeParam !== null) {
    const cleaned = routeParam.replace(/^\/+/, '');
    return { path: `/v1/${cleaned}`, searchParams: url.searchParams };
  }
  if (url.pathname.startsWith('/api/v1/')) {
    return { path: url.pathname.replace(/^\/api/, ''), searchParams: url.searchParams };
  }
  return { path: url.pathname, searchParams: url.searchParams };
}

export function createPqcRequestHandler(
  verifier: PaymentVerifierService,
  options: HttpServerOptions,
) {
  const benchmarksPath =
    options.benchmarksPath ?? resolve(process.cwd(), 'benchmarks', 'latest.json');
  const rateLimiter = new SlidingWindowRateLimiter(
    options.rateLimitMaxRequests ?? 60,
    options.rateLimitWindowMs ?? 60_000,
  );
  const storageBlocked = Boolean(
    options.requirePersistentStorage && verifier.store.storageMode === 'memory',
  );

  return async (req: MaybePreParsedRequest, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const { path, searchParams } = resolveNormalizedV1Path(req.url);

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': options.corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      });
      res.end();
      return;
    }

    if (method === 'POST') {
      const forwarded = req.headers['x-forwarded-for'];
      const clientIp =
        (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) ??
        req.socket?.remoteAddress ??
        'unknown';
      const limit = rateLimiter.check(clientIp);
      if (!limit.allowed) {
        res.writeHead(429, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': options.corsOrigin,
          'Retry-After': String(limit.retryAfterSec),
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            status: 'rejected',
            code: 'RATE_LIMITED',
            message: `Too many requests. Retry after ${limit.retryAfterSec}s.`,
          }),
        );
        return;
      }
    }

    try {
      // GET /v1/health
      if (method === 'GET' && path === '/v1/health') {
        sendJson(
          res,
          200,
          {
            status: storageBlocked ? 'degraded' : 'ok',
            service: 'qrygent-pqc-verifier',
            protocolVersion: SUPPORTED_PROTOCOL_VERSION,
            algorithm: ML_DSA_65_ALGORITHM,
            standard: ML_DSA_65_STANDARD,
            library: ML_DSA_65_LIBRARY,
            storageMode: storageBlocked ? 'unconfigured_serverless' : verifier.store.storageMode,
            storageReady: !storageBlocked,
            attestationSignerReady: Boolean(verifier.attestationSigner),
            verifierAddress: verifier.attestationSigner?.verifierAddress ?? null,
            expectedChainId: verifier.config.expectedChainId ?? null,
            expectedVaultAddress: verifier.config.expectedVaultAddress ?? null,
          },
          options.corsOrigin,
        );
        return;
      }

      // GET /v1/benchmarks (read-only static artifact; works even before Redis is provisioned)
      if (method === 'GET' && path === '/v1/benchmarks') {
        if (!existsSync(benchmarksPath)) {
          sendJson(
            res,
            404,
            {
              status: 'unavailable',
              code: 'BENCHMARKS_NOT_MEASURED',
              message:
                'No measured benchmark dataset has been generated yet. Run npm run bench in pqc-service.',
            },
            options.corsOrigin,
          );
          return;
        }
        const data = JSON.parse(readFileSync(benchmarksPath, 'utf8'));
        sendJson(res, 200, data, options.corsOrigin);
        return;
      }

      // Fail closed on stateful routes when running serverless without Upstash Redis
      if (storageBlocked) {
        sendJson(
          res,
          503,
          {
            status: 'rejected',
            code: 'VERIFIER_UNAVAILABLE',
            message:
              'Persistent serverless storage is not configured. Attach Upstash Redis in Vercel (UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN) to enable key registry, audit logs, and replay-safe verification.',
          },
          options.corsOrigin,
        );
        return;
      }

      // POST /v1/payments/verify
      if (method === 'POST' && path === '/v1/payments/verify') {
        const body = await readJsonBody(req);
        const outcome = await verifier.verifyPaymentRequest(body);
        sendJson(res, outcome.httpStatus, outcome.body, options.corsOrigin);
        return;
      }

      // GET /v1/agents
      if (method === 'GET' && path === '/v1/agents') {
        sendJson(
          res,
          200,
          {
            agents: await verifier.store.listAgents(),
          },
          options.corsOrigin,
        );
        return;
      }

      // POST /v1/agents/register
      if (method === 'POST' && path === '/v1/agents/register') {
        const body = await readJsonBody(req);
        const result = await verifier.registerAgentKey(body);
        sendJson(res, 201, result, options.corsOrigin);
        return;
      }

      // POST /v1/agents/:agentId/rotate
      const rotateMatch = /^\/v1\/agents\/(0x[0-9a-fA-F]{64})\/rotate$/.exec(path);
      if (method === 'POST' && rotateMatch) {
        const body = await readJsonBody(req);
        const result = await verifier.rotateAgentKey(rotateMatch[1]!.toLowerCase() as Hex, body);
        sendJson(res, 200, result, options.corsOrigin);
        return;
      }

      // POST /v1/agents/:agentId/revoke
      const revokeMatch = /^\/v1\/agents\/(0x[0-9a-fA-F]{64})\/revoke$/.exec(path);
      if (method === 'POST' && revokeMatch) {
        const body = await readJsonBody(req);
        const result = await verifier.revokeAgentKey(revokeMatch[1]!.toLowerCase() as Hex, body);
        sendJson(res, 200, result, options.corsOrigin);
        return;
      }

      // GET /v1/security/events
      if (method === 'GET' && path === '/v1/security/events') {
        const limitParam = Number.parseInt(searchParams.get('limit') ?? '50', 10);
        const events = await verifier.store.listSecurityEvents(
          Number.isFinite(limitParam) ? limitParam : 50,
        );
        sendJson(res, 200, { events }, options.corsOrigin);
        return;
      }

      sendJson(
        res,
        404,
        { status: 'rejected', code: 'NOT_FOUND', message: `Unknown route ${method} ${path}` },
        options.corsOrigin,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed.';
      if (msg === 'PAYLOAD_TOO_LARGE') {
        sendJson(
          res,
          413,
          {
            status: 'rejected',
            code: 'MALFORMED_REQUEST',
            message: 'Request body exceeds 64 KB limit.',
          },
          options.corsOrigin,
        );
        return;
      }
      if (msg === 'INVALID_JSON' || msg === 'EMPTY_BODY') {
        sendJson(
          res,
          400,
          {
            status: 'rejected',
            code: 'MALFORMED_REQUEST',
            message: 'Request body must be valid JSON.',
          },
          options.corsOrigin,
        );
        return;
      }
      sendJson(
        res,
        400,
        {
          status: 'rejected',
          code: 'MALFORMED_REQUEST',
          message: msg,
        },
        options.corsOrigin,
      );
    }
  };
}

export function createPqcHttpServer(
  verifier: PaymentVerifierService,
  options: HttpServerOptions,
) {
  return createServer(createPqcRequestHandler(verifier, options));
}
