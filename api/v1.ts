import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { Eip712AttestationSigner } from '../pqc-service/src/crypto/eip712.js';
import { createPqcRequestHandler } from '../pqc-service/src/server.js';
import { PaymentVerifierService } from '../pqc-service/src/service/verifier.js';
import { RegistryStore, type IRegistryStore } from '../pqc-service/src/store/registry.js';
import { UpstashRedisRegistryStore } from '../pqc-service/src/store/upstashStore.js';

let cachedHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | null = null;

function getVercelPqcHandler() {
  if (cachedHandler) return cachedHandler;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const store: IRegistryStore =
    upstashUrl && upstashToken
      ? new UpstashRedisRegistryStore(upstashUrl, upstashToken)
      : new RegistryStore(null);

  const maxTtl = Number.parseInt(process.env.MAX_ATTESTATION_TTL_SECONDS ?? '120', 10);
  const rawVerifierKey = process.env.VERIFIER_ATTESTATION_PRIVATE_KEY?.trim();
  const attestationSigner = rawVerifierKey
    ? new Eip712AttestationSigner(rawVerifierKey as Hex, maxTtl)
    : null;

  const rawVault = process.env.EXPECTED_VAULT_ADDRESS?.trim();
  const expectedVaultAddress: Address | null =
    rawVault && isAddress(rawVault) ? getAddress(rawVault) : null;

  const verifier = new PaymentVerifierService(store, attestationSigner, {
    expectedChainId: process.env.EXPECTED_CHAIN_ID?.trim() || null,
    expectedVaultAddress,
  });

  const benchmarksPath = resolve(process.cwd(), 'pqc-service', 'benchmarks', 'latest.json');
  const corsOrigin = process.env.CORS_ORIGIN?.trim() || '*';

  cachedHandler = createPqcRequestHandler(verifier, {
    corsOrigin,
    benchmarksPath,
    // Fail closed on stateful routes on Vercel if Upstash Redis is not attached
    requirePersistentStorage: process.env.VERCEL === '1' || process.env.REQUIRE_PERSISTENT_STORAGE === '1',
  });

  return cachedHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const requestHandler = getVercelPqcHandler();
  await requestHandler(req, res);
}
