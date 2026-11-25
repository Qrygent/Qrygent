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

export const keyStatusSchema = z.enum(['active', 'rotated', 'revoked', 'pending']);

export const keyRotationEntrySchema = z.object({
  keyId: z.string().min(1),
  fingerprint: z.string().min(1),
  algorithm: z.literal('ML-DSA-65'),
  registeredAt: z.number().int().nonnegative(),
  revokedAt: z.number().int().nonnegative().optional(),
  status: keyStatusSchema,
});

export const agentRecordSchema = z.object({
  agentId: z.string().min(1),
  label: z.string().min(1),
  owner: addressSchema,
  algorithm: z.literal('ML-DSA-65'),
  activeKeyId: z.string().min(1),
  publicKeyFingerprint: z.string().min(1),
  keyStatus: keyStatusSchema,
  registeredAt: z.number().int().nonnegative(),
  rotationHistory: z.array(keyRotationEntrySchema),
  assignedMandateIds: z.array(z.string()),
});

export const agentsListResponseSchema = z.object({
  agents: z.array(agentRecordSchema),
});

export const securityEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  layer: z.enum(['PQC_VERIFIER', 'SMART_CONTRACT']),
  code: z.string().min(1),
  summary: z.string().min(1),
  agentId: z.string().optional(),
  mandateId: z.string().optional(),
  requestId: z.string().optional(),
  txHash: hexStringSchema.optional(),
  severity: z.enum(['critical', 'high', 'medium', 'info']),
});

export const securityEventsResponseSchema = z.object({
  events: z.array(securityEventSchema),
});

export const benchmarkDatasetSchema = z.object({
  measured: z.literal(true),
  library: z.string().min(1),
  libraryVersion: z.string().min(1),
  runtime: z.string().min(1),
  cpu: z.string().min(1),
  iterations: z.number().int().positive(),
  measuredAt: z.string().min(1),
  notes: z.string(),
  metrics: z
    .array(
      z.object({
        algorithm: z.string().min(1),
        keygenMs: z.number().nonnegative(),
        signMs: z.number().nonnegative(),
        verifyMs: z.number().nonnegative(),
        publicKeyBytes: z.number().int().positive(),
        signatureBytes: z.number().int().positive(),
      }),
    )
    .min(1),
});
