import { z } from 'zod';
import { isAddress, type Address, type Hex } from 'viem';

const hexStringSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, { message: 'Must be a 0x-prefixed hex string' })
  .transform((val) => val as Hex);

const addressSchema = z
  .string()
  .refine((val) => isAddress(val), { message: 'Invalid EVM address' })
  .transform((val) => val as Address);

export const canonicalPaymentRequestSchema = z.object({
  chainId: z.string().regex(/^\d+$/, { message: 'chainId must be a stringified uint256' }),
  vault: addressSchema,
  agentId: hexStringSchema,
  keyId: hexStringSchema,
  mandateId: hexStringSchema,
  token: addressSchema,
  recipient: addressSchema,
  amount: z.string().regex(/^\d+$/, { message: 'amount must be integer base units (stringified uint256)' }),
  nonce: hexStringSchema,
  deadline: z.number().int().positive({ message: 'deadline must be a positive Unix timestamp' }),
});

export const paymentVerificationEnvelopeSchema = z.object({
  protocolVersion: z.string().min(1, { message: 'protocolVersion is required' }),
  request: canonicalPaymentRequestSchema,
  signature: z.string().min(16, { message: 'Encoded ML-DSA-65 signature is required' }),
});

export const eip712AttestationSchema = z.object({
  requestDigest: hexStringSchema,
  agentId: hexStringSchema,
  mandateId: hexStringSchema,
  nonce: hexStringSchema,
  deadline: z.number().int().positive(),
  verifier: addressSchema,
  signature: hexStringSchema,
});

export const verificationSuccessSchema = z.object({
  status: z.literal('verified'),
  requestId: z.string().min(1),
  attestation: eip712AttestationSchema,
});

export const verificationRejectedSchema = z.object({
  status: z.literal('rejected'),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const verificationResponseSchema = z.discriminatedUnion('status', [
  verificationSuccessSchema,
  verificationRejectedSchema,
]);
