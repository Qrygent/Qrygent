import {
  getAddress,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { CanonicalPaymentRequest } from '../protocol/canonical.js';

export const EIP712_DOMAIN_NAME = 'QrygentVault' as const;
export const EIP712_DOMAIN_VERSION = '1' as const;

export const EIP712_ATTESTATION_TYPES = {
  PaymentAttestation: [
    { name: 'requestDigest', type: 'bytes32' },
    { name: 'agentId', type: 'bytes32' },
    { name: 'mandateId', type: 'bytes32' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface Eip712Attestation {
  requestDigest: Hex;
  agentId: Hex;
  mandateId: Hex;
  nonce: Hex;
  deadline: number;
  verifier: Address;
  signature: Hex;
}

export function buildEip712Domain(chainId: bigint, vault: Address) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: getAddress(vault),
  } as const;
}

/**
 * Restricted ECDSA EIP-712 attestation signer.
 * Trust boundary: bridges verified off-chain ML-DSA-65 intent into an EVM-verifiable attestation.
 * Never logs or exposes its private key.
 */
export class Eip712AttestationSigner {
  private readonly account: PrivateKeyAccount;
  readonly verifierAddress: Address;
  readonly maxTtlSeconds: number;

  constructor(privateKeyHex: Hex, maxTtlSeconds = 120) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
      throw new Error('VERIFIER_ATTESTATION_PRIVATE_KEY must be a 32-byte 0x-prefixed hex key.');
    }
    this.account = privateKeyToAccount(privateKeyHex);
    this.verifierAddress = this.account.address;
    this.maxTtlSeconds = maxTtlSeconds;
  }

  async signAttestation(
    request: CanonicalPaymentRequest,
    requestDigest: Hex,
    nowUnixSeconds = Math.floor(Date.now() / 1000),
  ): Promise<Eip712Attestation> {
    const cappedDeadline = Math.min(request.deadline, nowUnixSeconds + this.maxTtlSeconds);
    const domain = buildEip712Domain(BigInt(request.chainId), request.vault);
    const message = {
      requestDigest,
      agentId: request.agentId,
      mandateId: request.mandateId,
      nonce: request.nonce,
      deadline: BigInt(cappedDeadline),
    };

    const signature = await this.account.signTypedData({
      domain,
      types: EIP712_ATTESTATION_TYPES,
      primaryType: 'PaymentAttestation',
      message,
    });

    return {
      requestDigest,
      agentId: request.agentId,
      mandateId: request.mandateId,
      nonce: request.nonce,
      deadline: cappedDeadline,
      verifier: this.verifierAddress,
      signature,
    };
  }
}

export async function verifyEip712Attestation(params: {
  chainId: bigint;
  vault: Address;
  attestation: Eip712Attestation;
}): Promise<boolean> {
  const domain = buildEip712Domain(params.chainId, params.vault);
  return verifyTypedData({
    address: params.attestation.verifier,
    domain,
    types: EIP712_ATTESTATION_TYPES,
    primaryType: 'PaymentAttestation',
    message: {
      requestDigest: params.attestation.requestDigest,
      agentId: params.attestation.agentId,
      mandateId: params.attestation.mandateId,
      nonce: params.attestation.nonce,
      deadline: BigInt(params.attestation.deadline),
    },
    signature: params.attestation.signature,
  });
}
