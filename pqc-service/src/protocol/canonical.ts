import { z } from 'zod';
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';

export const SUPPORTED_PROTOCOL_VERSION = '1';

/**
 * Deterministic domain separator tag matching Solidity:
 * keccak256("QRYGENT_PAYMENT_REQUEST_V1")
 */
export const PAYMENT_REQUEST_DOMAIN_TAG: Hex = keccak256(toHex('QRYGENT_PAYMENT_REQUEST_V1'));

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, { message: 'Must be a 32-byte 0x-prefixed hex value (bytes32)' })
  .transform((v) => v.toLowerCase() as Hex);

const hexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, { message: 'Must be a 0x-prefixed hex string' })
  .transform((v) => v as Hex);

const checksumAddressSchema = z
  .string()
  .refine((v) => isAddress(v), { message: 'Invalid EVM address' })
  .transform((v) => getAddress(v));

const uint256StringSchema = z
  .string()
  .regex(/^\d+$/, { message: 'Must be a non-negative integer base-unit string (uint256)' });

export const canonicalPaymentRequestSchema = z.object({
  chainId: uint256StringSchema,
  vault: checksumAddressSchema,
  agentId: bytes32Schema,
  keyId: bytes32Schema,
  mandateId: bytes32Schema,
  token: checksumAddressSchema,
  recipient: checksumAddressSchema,
  amount: uint256StringSchema,
  nonce: bytes32Schema,
  deadline: z.number().int().positive(),
});

export type CanonicalPaymentRequest = z.infer<typeof canonicalPaymentRequestSchema>;

export const paymentVerificationEnvelopeSchema = z.object({
  protocolVersion: z.string().min(1),
  request: canonicalPaymentRequestSchema,
  /** Encoded ML-DSA-65 signature (0x-hex or strict base64, exact 3,309 bytes decoded) */
  signature: z.string().min(16),
});

export type PaymentVerificationEnvelope = z.infer<typeof paymentVerificationEnvelopeSchema>;

/**
 * Deterministic canonical ABI-encoded digest bound to every payment request field.
 * 100% reproducible in Solidity via keccak256(abi.encode(...)).
 */
export function computeCanonicalRequestDigest(
  request: CanonicalPaymentRequest,
  protocolVersion: string = SUPPORTED_PROTOCOL_VERSION,
): Hex {
  const versionNum = BigInt(protocolVersion);
  const encoded = encodeAbiParameters(
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
      versionNum,
      BigInt(request.chainId),
      getAddress(request.vault),
      request.agentId,
      request.keyId,
      request.mandateId,
      getAddress(request.token),
      getAddress(request.recipient),
      BigInt(request.amount),
      request.nonce,
      BigInt(request.deadline),
    ],
  );
  return keccak256(encoded);
}

export const agentRegisterBodySchema = z.object({
  agentId: bytes32Schema,
  label: z.string().trim().min(2).max(80),
  owner: checksumAddressSchema,
  keyId: bytes32Schema,
  publicKey: z.string().min(64),
  timestamp: z.number().int().positive(),
  ownerSignature: hexSchema,
});

export const agentRotateBodySchema = z.object({
  owner: checksumAddressSchema,
  newKeyId: bytes32Schema,
  newPublicKey: z.string().min(64),
  timestamp: z.number().int().positive(),
  ownerSignature: hexSchema,
});

export const agentRevokeBodySchema = z.object({
  owner: checksumAddressSchema,
  keyId: bytes32Schema,
  reason: z.string().trim().max(160).optional(),
  timestamp: z.number().int().positive(),
  ownerSignature: hexSchema,
});

export type OwnerKeyAction = 'REGISTER_AGENT_KEY' | 'ROTATE_AGENT_KEY' | 'REVOKE_AGENT_KEY';

/**
 * Deterministic human-readable EIP-191 authorization message signed by the vault owner's
 * EVM wallet to prove ownership before registering, rotating, or revoking an ML-DSA-65 key.
 */
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
