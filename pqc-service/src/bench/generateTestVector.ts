import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAbiParameters, hashTypedData, type Hex } from 'viem';
import {
  buildEip712Domain,
  EIP712_ATTESTATION_TYPES,
} from '../crypto/eip712.js';
import {
  computeCanonicalRequestDigest,
  PAYMENT_REQUEST_DOMAIN_TAG,
  SUPPORTED_PROTOCOL_VERSION,
  type CanonicalPaymentRequest,
} from '../protocol/canonical.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

/**
 * Generates a zero-secret, deterministic canonical payment request + EIP-712 typed-data
 * test vector so the Solidity contract (Foundry) and PQC verifier can verify byte-for-byte
 * hashing parity independently.
 */
function main() {
  const request: CanonicalPaymentRequest = {
    chainId: '11155111',
    vault: '0x2222222222222222222222222222222222222222',
    agentId: `0x${'aa'.repeat(32)}` as Hex,
    keyId: `0x${'11'.repeat(32)}` as Hex,
    mandateId: `0x${'cc'.repeat(32)}` as Hex,
    token: '0x1111111111111111111111111111111111111111',
    recipient: '0x3333333333333333333333333333333333333333',
    amount: '250000000',
    nonce: `0x${'01'.repeat(32)}` as Hex,
    deadline: 1800000300,
  };

  const abiEncodedRequest = encodeAbiParameters(
    [
      { name: 'domainTag', type: 'bytes32' },
      { name: 'protocolVersion', type: 'uint256' },
      { name: 'chainId', type: 'uint256' },
      { name: 'vault', type: 'address' },
      { name: 'agentId', type: 'bytes32' },
      { name: 'keyId', type: 'bytes32' },
      { name: 'mandateId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'deadline', type: 'uint256' },
    ],
    [
      PAYMENT_REQUEST_DOMAIN_TAG,
      BigInt(SUPPORTED_PROTOCOL_VERSION),
      BigInt(request.chainId),
      request.vault,
      request.agentId,
      request.keyId,
      request.mandateId,
      request.token,
      request.recipient,
      BigInt(request.amount),
      request.nonce,
      BigInt(request.deadline),
    ],
  );

  const requestDigest = computeCanonicalRequestDigest(request, SUPPORTED_PROTOCOL_VERSION);
  const attestationDeadline = 1800000120;
  const domain = buildEip712Domain(BigInt(request.chainId), request.vault);
  const eip712Digest = hashTypedData({
    domain,
    types: EIP712_ATTESTATION_TYPES,
    primaryType: 'PaymentAttestation',
    message: {
      requestDigest,
      agentId: request.agentId,
      mandateId: request.mandateId,
      nonce: request.nonce,
      deadline: BigInt(attestationDeadline),
    },
  });

  const vector = {
    description:
      'Deterministic, zero-secret canonical encoding and EIP-712 test vector shared between pqc-service and Solidity Foundry tests. Placeholder addresses/chainId are for hashing parity only—not a live deployment.',
    protocolVersion: SUPPORTED_PROTOCOL_VERSION,
    domainTagLabel: 'QRYGENT_PAYMENT_REQUEST_V1',
    domainTag: PAYMENT_REQUEST_DOMAIN_TAG,
    canonicalRequest: request,
    abiEncodedRequest,
    expectedRequestDigest: requestDigest,
    eip712: {
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId.toString(),
        verifyingContract: domain.verifyingContract,
      },
      primaryType: 'PaymentAttestation',
      typeString:
        'PaymentAttestation(bytes32 requestDigest,bytes32 agentId,bytes32 mandateId,bytes32 nonce,uint256 deadline)',
      message: {
        requestDigest,
        agentId: request.agentId,
        mandateId: request.mandateId,
        nonce: request.nonce,
        deadline: attestationDeadline,
      },
      expectedEip712Digest: eip712Digest,
    },
  };

  const outPath = resolve(repoRoot, 'docs', 'CANONICAL_TEST_VECTOR.json');
  writeFileSync(outPath, JSON.stringify(vector, null, 2) + '\n', 'utf8');
  console.log(`Canonical test vector written to ${outPath}`);
}

main();
