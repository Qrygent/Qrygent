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
}

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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
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

export function createPqcHttpServer(
  verifier: PaymentVerifierService,
  options: HttpServerOptions,
) {
  const benchmarksPath =
    options.benchmarksPath ?? resolve(process.cwd(), 'benchmarks', 'latest.json');
  const rateLimiter = new SlidingWindowRateLimiter(
    options.rateLimitMaxRequests ?? 60,
    options.rateLimitWindowMs ?? 60_000,
  );

  return createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

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
      const clientIp = req.socket.remoteAddress ?? 'unknown';
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
            status: 'ok',
            service: 'qrygent-pqc-verifier',
            protocolVersion: SUPPORTED_PROTOCOL_VERSION,
            algorithm: ML_DSA_65_ALGORITHM,
            standard: ML_DSA_65_STANDARD,
            library: ML_DSA_65_LIBRARY,
            attestationSignerReady: Boolean(verifier.attestationSigner),
            verifierAddress: verifier.attestationSigner?.verifierAddress ?? null,
            expectedChainId: verifier.config.expectedChainId ?? null,
            expectedVaultAddress: verifier.config.expectedVaultAddress ?? null,
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
            agents: verifier.store.listAgents(),
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
        const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
        const events = verifier.store.listSecurityEvents(
          Number.isFinite(limitParam) ? limitParam : 50,
        );
        sendJson(res, 200, { events }, options.corsOrigin);
        return;
      }

      // GET /v1/benchmarks
      if (method === 'GET' && path === '/v1/benchmarks') {
        if (!existsSync(benchmarksPath)) {
          sendJson(
            res,
            404,
            {
              status: 'unavailable',
              code: 'BENCHMARKS_NOT_MEASURED',
              message: 'No measured benchmark dataset has been generated yet. Run npm run bench in pqc-service.',
            },
            options.corsOrigin,
          );
          return;
        }
        const data = JSON.parse(readFileSync(benchmarksPath, 'utf8'));
        sendJson(res, 200, data, options.corsOrigin);
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
          { status: 'rejected', code: 'MALFORMED_REQUEST', message: 'Request body exceeds 64 KB limit.' },
          options.corsOrigin,
        );
        return;
      }
      if (msg === 'INVALID_JSON' || msg === 'EMPTY_BODY') {
        sendJson(
          res,
          400,
          { status: 'rejected', code: 'MALFORMED_REQUEST', message: 'Request body must be valid JSON.' },
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
  });
}
