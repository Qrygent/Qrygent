import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { keccak256, toHex, verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  generateMldsa65KeyPair,
  ML_DSA_65_PUBLIC_KEY_BYTES,
  ML_DSA_65_SIGNATURE_BYTES,
  signDigestMldsa65,
  verifyDigestMldsa65,
} from '../crypto/mldsa.js';
import { hexToBytes } from 'viem';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(__dirname, '../..');
const repoRoot = resolve(serviceRoot, '..');

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mean(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

async function run() {
  const iterations = Number.parseInt(process.env.BENCH_ITERATIONS ?? '100', 10);
  const warmup = 10;

  const pkg = JSON.parse(readFileSync(resolve(serviceRoot, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const noblePkg = JSON.parse(
    readFileSync(
      resolve(serviceRoot, 'node_modules', '@noble', 'post-quantum', 'package.json'),
      'utf8',
    ),
  ) as { version: string };
  const viemPkg = JSON.parse(
    readFileSync(resolve(serviceRoot, 'node_modules', 'viem', 'package.json'), 'utf8'),
  ) as { version: string };

  const sampleDigest = keccak256(toHex('QRYGENT_BENCHMARK_CANONICAL_DIGEST_V1'));

  // Warmup ML-DSA-65
  for (let i = 0; i < warmup; i++) {
    const kp = generateMldsa65KeyPair();
    const sig = signDigestMldsa65(sampleDigest, kp.secretKey);
    verifyDigestMldsa65(sampleDigest, hexToBytes(sig), kp.publicKey);
  }

  // Measure ML-DSA-65
  const mldsaKeygen: number[] = [];
  const mldsaSign: number[] = [];
  const mldsaVerify: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const kp = generateMldsa65KeyPair();
    const t1 = performance.now();
    const sigHex = signDigestMldsa65(sampleDigest, kp.secretKey);
    const t2 = performance.now();
    const ok = verifyDigestMldsa65(sampleDigest, hexToBytes(sigHex), kp.publicKey);
    const t3 = performance.now();

    if (!ok) throw new Error('Benchmark sanity check failed: ML-DSA-65 verify returned false.');
    mldsaKeygen.push(t1 - t0);
    mldsaSign.push(t2 - t1);
    mldsaVerify.push(t3 - t2);
  }

  // Warmup ECDSA (secp256k1 via viem)
  for (let i = 0; i < warmup; i++) {
    const pk = generatePrivateKey();
    const acc = privateKeyToAccount(pk);
    const sig = await acc.signMessage({ message: { raw: sampleDigest } });
    await verifyMessage({ address: acc.address, message: { raw: sampleDigest }, signature: sig });
  }

  // Measure ECDSA (secp256k1)
  const ecdsaKeygen: number[] = [];
  const ecdsaSign: number[] = [];
  const ecdsaVerify: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const pk = generatePrivateKey();
    const acc = privateKeyToAccount(pk);
    const t1 = performance.now();
    const sig = await acc.signMessage({ message: { raw: sampleDigest } });
    const t2 = performance.now();
    const ok = await verifyMessage({
      address: acc.address,
      message: { raw: sampleDigest },
      signature: sig,
    });
    const t3 = performance.now();

    if (!ok) throw new Error('Benchmark sanity check failed: ECDSA verify returned false.');
    ecdsaKeygen.push(t1 - t0);
    ecdsaSign.push(t2 - t1);
    ecdsaVerify.push(t3 - t2);
  }

  const cpuModel = cpus()[0]?.model ?? 'Unknown CPU';
  const measuredAt = new Date().toISOString();

  const dataset = {
    measured: true as const,
    library: `@noble/post-quantum & viem`,
    libraryVersion: `@noble/post-quantum@${noblePkg.version}, viem@${viemPkg.version}`,
    runtime: `Node.js ${process.version} (${platform()}/${arch()})`,
    cpu: cpuModel,
    iterations,
    measuredAt,
    notes:
      'Pure TypeScript/JS single-threaded local measurements over canonical 32-byte keccak256 digest (mean ms reported; median in docs/BENCHMARKS.md). These measurements characterize off-chain verifier overhead and do not claim universal cryptographic speed or security superiority.',
    metrics: [
      {
        algorithm: 'ML-DSA-65 (NIST FIPS 204)',
        keygenMs: Number(mean(mldsaKeygen).toFixed(3)),
        signMs: Number(mean(mldsaSign).toFixed(3)),
        verifyMs: Number(mean(mldsaVerify).toFixed(3)),
        publicKeyBytes: ML_DSA_65_PUBLIC_KEY_BYTES,
        signatureBytes: ML_DSA_65_SIGNATURE_BYTES,
      },
      {
        algorithm: 'ECDSA secp256k1 (EIP-712 Bridge)',
        keygenMs: Number(mean(ecdsaKeygen).toFixed(3)),
        signMs: Number(mean(ecdsaSign).toFixed(3)),
        verifyMs: Number(mean(ecdsaVerify).toFixed(3)),
        publicKeyBytes: 33,
        signatureBytes: 65,
      },
    ],
  };

  const outJsonPath = resolve(serviceRoot, 'benchmarks', 'latest.json');
  mkdirSync(dirname(outJsonPath), { recursive: true });
  writeFileSync(outJsonPath, JSON.stringify(dataset, null, 2), 'utf8');

  const md = `# Qrygent Cryptographic Benchmarks (Measured)

**Measured at:** ${measuredAt}  
**Runtime:** ${dataset.runtime}  
**CPU:** ${dataset.cpu}  
**Libraries:** \`@noble/post-quantum@${noblePkg.version}\` (ML-DSA-65, NIST FIPS 204) · \`viem@${viemPkg.version}\` (ECDSA secp256k1) · declared range \`${pkg.dependencies['@noble/post-quantum']}\`  
**Iterations:** ${iterations} measured runs after ${warmup} warmup runs (single-threaded, signing a 32-byte canonical keccak256 payment digest)

## Measured Results

| Algorithm | Keygen Mean (ms) | Keygen Median (ms) | Sign Mean (ms) | Sign Median (ms) | Verify Mean (ms) | Verify Median (ms) | Public Key Size | Signature Size |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **ML-DSA-65 (NIST FIPS 204)** | ${mean(mldsaKeygen).toFixed(3)} | ${median(mldsaKeygen).toFixed(3)} | ${mean(mldsaSign).toFixed(3)} | ${median(mldsaSign).toFixed(3)} | ${mean(mldsaVerify).toFixed(3)} | ${median(mldsaVerify).toFixed(3)} | 1,952 bytes | 3,309 bytes |
| **ECDSA secp256k1 (EVM Bridge)** | ${mean(ecdsaKeygen).toFixed(3)} | ${median(ecdsaKeygen).toFixed(3)} | ${mean(ecdsaSign).toFixed(3)} | ${median(ecdsaSign).toFixed(3)} | ${mean(ecdsaVerify).toFixed(3)} | ${median(ecdsaVerify).toFixed(3)} | 33 bytes (compressed) | 65 bytes |

## Interpretation & Limitations

- These figures are **measured locally** using pure JS/TS implementations (\`@noble/post-quantum\` and \`viem\`) and will vary across hardware, runtimes, and native C/Rust implementations (e.g., \`liboqs\`).
- ML-DSA-65 public keys (1,952 bytes) and signatures (3,309 bytes) are substantially larger than ECDSA secp256k1 keys (33 bytes) and signatures (65 bytes), which is a primary engineering reason the Qrygent MVP performs ML-DSA-65 verification off-chain and bridges to EVM via a compact 65-byte ECDSA EIP-712 attestation.
- Per \`docs/SECURITY.md\` §2, these measurements characterize off-chain latency and payload sizes only—they do **not** prove universal cryptographic superiority or end-to-end quantum resistance.

## Reproducing

\`\`\`bash
npm --prefix pqc-service run bench
\`\`\`

Artifact output: \`pqc-service/benchmarks/latest.json\` (served live via \`GET /v1/benchmarks\`).
`;

  writeFileSync(resolve(repoRoot, 'docs', 'BENCHMARKS.md'), md, 'utf8');
  console.log(`Benchmarks written to ${outJsonPath} and docs/BENCHMARKS.md`);
  console.log(JSON.stringify(dataset.metrics, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
