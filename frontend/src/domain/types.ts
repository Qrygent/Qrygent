import type { Address, Hex } from 'viem';

/**
 * All stable error codes defined in docs/API.md §6.
 */
export const PQC_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'UNSUPPORTED_PROTOCOL_VERSION',
  'UNKNOWN_AGENT',
  'UNKNOWN_KEY',
  'REVOKED_KEY',
  'INVALID_SIGNATURE',
  'MANDATE_NOT_FOUND',
  'MANDATE_REVOKED',
  'MANDATE_EXPIRED',
  'RECIPIENT_NOT_ALLOWED',
  'PAYMENT_LIMIT_EXCEEDED',
  'BUDGET_EXCEEDED',
  'REQUEST_EXPIRED',
  'NONCE_ALREADY_USED',
  'WRONG_CHAIN',
  'WRONG_VAULT',
  'VERIFIER_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type PqcErrorCode = (typeof PQC_ERROR_CODES)[number];

export interface CanonicalPaymentRequest {
  chainId: string;
  vault: Address;
  agentId: Hex;
  keyId: Hex;
  mandateId: Hex;
  token: Address;
  recipient: Address;
  /** Integer token base units as stringified uint256 — never floating point */
  amount: string;
  nonce: Hex;
  /** Unix timestamp in seconds */
  deadline: number;
}

export interface PaymentVerificationEnvelope {
  protocolVersion: string;
  request: CanonicalPaymentRequest;
  /** Encoded ML-DSA-65 signature (encoding locked in API v1.0) */
  signature: string;
}

export interface Eip712Attestation {
  requestDigest: Hex;
  agentId: Hex;
  mandateId: Hex;
  nonce: Hex;
  deadline: number;
  verifier: Address;
  signature: Hex;
}

export interface VerificationMetadata {
  algorithm: 'ML-DSA-65';
  publicKeyFingerprint: string;
  verifiedAt: string;
  integrityStatus: 'intact';
}

export interface VerificationSuccessResponse {
  status: 'verified';
  requestId: string;
  verification?: VerificationMetadata;
  attestation: Eip712Attestation;
}

export interface VerificationRejectedResponse {
  status: 'rejected';
  code: PqcErrorCode | string;
  message: string;
  integrityStatus?: 'tampered_or_invalid' | 'unchecked';
}

export type VerificationResponse = VerificationSuccessResponse | VerificationRejectedResponse;

export interface VerifierHealthStatus {
  reachable: boolean;
  status: 'healthy' | 'degraded' | 'unreachable' | 'unconfigured';
  httpStatus?: number;
  latencyMs?: number;
  checkedAt: string;
  message?: string;
  details?: Record<string, unknown>;
}

export type KeyStatus = 'active' | 'rotated' | 'revoked' | 'pending';

export interface KeyRotationEntry {
  keyId: string;
  fingerprint: string;
  algorithm: 'ML-DSA-65';
  registeredAt: number;
  revokedAt?: number;
  status: KeyStatus;
}

export interface AgentRecord {
  agentId: string;
  label: string;
  owner: Address;
  algorithm: 'ML-DSA-65';
  activeKeyId: string;
  publicKeyFingerprint: string;
  keyStatus: KeyStatus;
  registeredAt: number;
  rotationHistory: KeyRotationEntry[];
  assignedMandateIds: string[];
}

export type MandateStatus = 'active' | 'expired' | 'revoked' | 'exhausted';

export interface MandateRecord {
  mandateId: string;
  label?: string;
  owner: Address;
  agentId: string;
  token: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  approvedRecipients: Address[];
  maxPerPayment: bigint;
  aggregateBudget: bigint;
  spentAmount: bigint;
  expiry: number;
  status: MandateStatus;
}

export type PaymentExecutionStatus =
  | 'pending_verification'
  | 'pqc_rejected'
  | 'attested'
  | 'submitted'
  | 'settled'
  | 'contract_reverted';

export interface PaymentRecord {
  id: string;
  requestId?: string;
  mandateId: string;
  agentId: string;
  keyId: string;
  publicKeyFingerprint?: string;
  token: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  recipient: Address;
  amount: bigint;
  nonce: string;
  timestamp: number;
  algorithm: 'ML-DSA-65';
  pqcVerificationStatus: 'verified' | 'rejected' | 'pending';
  pqcFailureReason?: string;
  eip712Verifier?: Address;
  executionStatus: PaymentExecutionStatus;
  txHash?: Hex;
  contractRevertReason?: string;
}

export type EnforcementLayer = 'PQC_VERIFIER' | 'SMART_CONTRACT';

export interface SecurityEvent {
  id: string;
  timestamp: number;
  layer: EnforcementLayer;
  code: PqcErrorCode | string;
  summary: string;
  agentId?: string;
  mandateId?: string;
  requestId?: string;
  txHash?: Hex;
  severity: 'critical' | 'high' | 'medium' | 'info';
}

export interface BenchmarkMetric {
  algorithm: string;
  keygenMs: number;
  signMs: number;
  verifyMs: number;
  publicKeyBytes: number;
  signatureBytes: number;
}

export interface BenchmarkDataset {
  measured: true;
  library: string;
  libraryVersion: string;
  runtime: string;
  cpu: string;
  iterations: number;
  measuredAt: string;
  notes: string;
  metrics: BenchmarkMetric[];
}

/**
 * Discriminated union guaranteeing honest integration reporting across all services.
 */
export type ServiceResult<T> =
  | { status: 'ready'; data: T }
  | {
      status: 'unconfigured';
      reason: string;
      missing: string[];
      owner: string;
    }
  | {
      status: 'error';
      message: string;
      code?: string;
      httpStatus?: number;
    };
