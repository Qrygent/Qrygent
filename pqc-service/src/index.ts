import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { Eip712AttestationSigner } from './crypto/eip712.js';
import { createPqcHttpServer } from './server.js';
import { PaymentVerifierService } from './service/verifier.js';
import { RegistryStore } from './store/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(__dirname, '..');

function loadLocalEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadLocalEnvFile(resolve(serviceRoot, '.env'));

const port = Number.parseInt(process.env.PORT ?? '8000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const maxTtl = Number.parseInt(process.env.MAX_ATTESTATION_TTL_SECONDS ?? '120', 10);
const storePath = resolve(serviceRoot, process.env.REGISTRY_STORE_PATH ?? './data/registry-store.json');
const benchmarksPath = resolve(serviceRoot, 'benchmarks', 'latest.json');

let attestationSigner: Eip712AttestationSigner | null = null;
const rawVerifierKey = process.env.VERIFIER_ATTESTATION_PRIVATE_KEY?.trim();
if (rawVerifierKey) {
  attestationSigner = new Eip712AttestationSigner(rawVerifierKey as Hex, maxTtl);
} else {
  console.warn(
    '[qrygent-pqc-service] VERIFIER_ATTESTATION_PRIVATE_KEY is unset. Health, registry, and benchmarks run normally, while /v1/payments/verify will fail closed with VERIFIER_UNAVAILABLE until a test verifier key is configured in pqc-service/.env.',
  );
}

let expectedVaultAddress: Address | null = null;
if (process.env.EXPECTED_VAULT_ADDRESS?.trim()) {
  if (!isAddress(process.env.EXPECTED_VAULT_ADDRESS.trim())) {
    throw new Error('EXPECTED_VAULT_ADDRESS is not a valid EVM address.');
  }
  expectedVaultAddress = getAddress(process.env.EXPECTED_VAULT_ADDRESS.trim());
}

const store = new RegistryStore(storePath);
const verifier = new PaymentVerifierService(store, attestationSigner, {
  expectedChainId: process.env.EXPECTED_CHAIN_ID?.trim() || null,
  expectedVaultAddress,
});

const server = createPqcHttpServer(verifier, { corsOrigin, benchmarksPath });

server.listen(port, host, () => {
  console.log(
    `[qrygent-pqc-service] Listening on http://${host}:${port} (CORS: ${corsOrigin}, attestationSignerReady: ${Boolean(attestationSigner)})`,
  );
});
