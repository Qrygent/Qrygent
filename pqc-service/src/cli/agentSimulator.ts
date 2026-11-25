import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { bytesToHex, getAddress, hexToBytes, type Hex } from 'viem';
import {
  generateMldsa65KeyPair,
  ML_DSA_65_ALGORITHM,
  signDigestMldsa65,
} from '../crypto/mldsa.js';
import {
  computeCanonicalRequestDigest,
  SUPPORTED_PROTOCOL_VERSION,
  type CanonicalPaymentRequest,
} from '../protocol/canonical.js';

interface LocalAgentKeyFile {
  warning: string;
  algorithm: typeof ML_DSA_65_ALGORITHM;
  agentId: Hex;
  keyId: Hex;
  publicKeyHex: Hex;
  publicKeyFingerprint: string;
  secretKeyHex: Hex;
  createdAt: string;
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function printUsage() {
  console.log(`Qrygent Deterministic Agent Signer CLI (ML-DSA-65 / NIST FIPS 204)

Commands:
  keygen --out <path> [--agent-id 0x...] [--key-id 0x...]
      Generate a local test-only ML-DSA-65 keypair outside Git (.qrygent-local/)
      and print ONLY public registration metadata (never prints private key).

  sign --keyfile <path> --chain-id <uint> --vault <0xAddr> --mandate-id <0xBytes32>
       --token <0xAddr> --recipient <0xAddr> --amount <uint256BaseUnits>
       [--ttl <seconds>] [--nonce <0xBytes32>]
       [--tamper-amount <uint256>] [--tamper-recipient <0xAddr>] [--corrupt-signature]
      Sign a canonical payment request with the local ML-DSA-65 private key and print
      the JSON envelope for POST /v1/payments/verify.
`);
}

function main() {
  const [, , command, ...args] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'keygen') {
    const outPath = resolve(
      process.cwd(),
      parseFlag(args, '--out') ?? '../.qrygent-local/agent-01.mldsa-key.json',
    );
    const agentId = (parseFlag(args, '--agent-id') ?? bytesToHex(randomBytes(32))) as Hex;
    const keyId = (parseFlag(args, '--key-id') ?? bytesToHex(randomBytes(32))) as Hex;

    const kp = generateMldsa65KeyPair();
    const record: LocalAgentKeyFile = {
      warning: 'TESTNET AGENT PRIVATE KEY — NEVER COMMIT TO GIT OR PASTE IN BROWSER',
      algorithm: ML_DSA_65_ALGORITHM,
      agentId,
      keyId,
      publicKeyHex: kp.publicKeyHex,
      publicKeyFingerprint: kp.publicKeyFingerprint,
      secretKeyHex: bytesToHex(kp.secretKey),
      createdAt: new Date().toISOString(),
    };

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600 });

    // Print PUBLIC metadata only
    console.log(
      JSON.stringify(
        {
          savedKeyFile: outPath,
          algorithm: record.algorithm,
          agentId: record.agentId,
          keyId: record.keyId,
          publicKeyFingerprint: record.publicKeyFingerprint,
          publicKeyHex: record.publicKeyHex,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === 'sign') {
    const keyfilePath = resolve(
      process.cwd(),
      parseFlag(args, '--keyfile') ?? '../.qrygent-local/agent-01.mldsa-key.json',
    );
    const keyData = JSON.parse(readFileSync(keyfilePath, 'utf8')) as LocalAgentKeyFile;

    const chainId = parseFlag(args, '--chain-id') ?? '11155111';
    const vault = getAddress(
      parseFlag(args, '--vault') ?? '0x2222222222222222222222222222222222222222',
    );
    const mandateId = (parseFlag(args, '--mandate-id') ?? `0x${'11'.repeat(32)}`) as Hex;
    const token = getAddress(
      parseFlag(args, '--token') ?? '0x1111111111111111111111111111111111111111',
    );
    const recipient = getAddress(
      parseFlag(args, '--recipient') ?? '0x3333333333333333333333333333333333333333',
    );
    const amount = parseFlag(args, '--amount') ?? '1000000';
    const ttl = Number.parseInt(parseFlag(args, '--ttl') ?? '300', 10);
    const nonce = (parseFlag(args, '--nonce') ?? bytesToHex(randomBytes(32))) as Hex;
    const deadline = Math.floor(Date.now() / 1000) + ttl;

    const request: CanonicalPaymentRequest = {
      chainId,
      vault,
      agentId: keyData.agentId,
      keyId: keyData.keyId,
      mandateId,
      token,
      recipient,
      amount,
      nonce,
      deadline,
    };

    const digest = computeCanonicalRequestDigest(request, SUPPORTED_PROTOCOL_VERSION);
    let signature = signDigestMldsa65(digest, hexToBytes(keyData.secretKeyHex));

    // Deterministic negative-test tampering flags
    const tamperedRequest = { ...request };
    const tamperAmount = parseFlag(args, '--tamper-amount');
    if (tamperAmount) tamperedRequest.amount = tamperAmount;

    const tamperRecipient = parseFlag(args, '--tamper-recipient');
    if (tamperRecipient) tamperedRequest.recipient = getAddress(tamperRecipient);

    if (args.includes('--corrupt-signature')) {
      const sigBytes = hexToBytes(signature);
      sigBytes[0] = (sigBytes[0] ?? 0) ^ 0xff;
      signature = bytesToHex(sigBytes);
    }

    console.log(
      JSON.stringify(
        {
          protocolVersion: SUPPORTED_PROTOCOL_VERSION,
          request: tamperedRequest,
          signature,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

main();
