import { randomUUID } from 'node:crypto';
import { bytesToHex, getAddress, hexToBytes, verifyMessage, type Address, type Hex } from 'viem';
import {
  Eip712AttestationSigner,
  type Eip712Attestation,
} from '../crypto/eip712.js';
import {
  computePublicKeyFingerprint,
  decodeStrictKeyOrSig,
  ML_DSA_65_PUBLIC_KEY_BYTES,
  ML_DSA_65_SIGNATURE_BYTES,
  verifyDigestMldsa65,
} from '../crypto/mldsa.js';
import {
  agentRegisterBodySchema,
  agentRevokeBodySchema,
  agentRotateBodySchema,
  buildOwnerKeyAuthMessage,
  computeCanonicalRequestDigest,
  paymentVerificationEnvelopeSchema,
  SUPPORTED_PROTOCOL_VERSION,
} from '../protocol/canonical.js';
import { RegistryStore, type PublicAgentRecord } from '../store/registry.js';

export type VerifyPaymentOutcome =
  | {
      httpStatus: 200;
      body: {
        status: 'verified';
        requestId: string;
        verification: {
          algorithm: 'ML-DSA-65';
          publicKeyFingerprint: string;
          verifiedAt: string;
          integrityStatus: 'intact';
        };
        attestation: Eip712Attestation;
      };
    }
  | {
      httpStatus: 400 | 401 | 403 | 409 | 429 | 503;
      body: {
        status: 'rejected';
        code: string;
        message: string;
        integrityStatus?: 'tampered_or_invalid' | 'unchecked';
      };
    };

export interface VerifierConfig {
  expectedChainId?: string | null;
  expectedVaultAddress?: Address | null;
  ownerAuthWindowSeconds?: number;
}

export class PaymentVerifierService {
  readonly store: RegistryStore;
  readonly attestationSigner: Eip712AttestationSigner | null;
  readonly config: VerifierConfig;

  constructor(
    store: RegistryStore,
    attestationSigner: Eip712AttestationSigner | null,
    config: VerifierConfig = {},
  ) {
    this.store = store;
    this.attestationSigner = attestationSigner;
    this.config = config;
  }

  private reject(
    httpStatus: 400 | 401 | 403 | 409 | 503,
    code: string,
    message: string,
    audit?: {
      agentId?: string;
      mandateId?: string;
      severity?: 'critical' | 'high' | 'medium' | 'info';
    },
  ): VerifyPaymentOutcome {
    this.store.recordSecurityEvent({
      code,
      summary: message,
      agentId: audit?.agentId,
      mandateId: audit?.mandateId,
      severity: audit?.severity ?? 'high',
    });
    return {
      httpStatus,
      body: {
        status: 'rejected',
        code,
        message,
        integrityStatus: code === 'INVALID_SIGNATURE' ? 'tampered_or_invalid' : 'unchecked',
      },
    };
  }

  async verifyPaymentRequest(
    rawPayload: unknown,
    nowUnixSeconds = Math.floor(Date.now() / 1000),
  ): Promise<VerifyPaymentOutcome> {
    const parsed = paymentVerificationEnvelopeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return this.reject(
        400,
        'MALFORMED_REQUEST',
        `Canonical payment request failed validation: ${parsed.error.issues[0]?.message ?? 'invalid payload'}.`,
        { severity: 'medium' },
      );
    }

    const { protocolVersion, request, signature } = parsed.data;

    if (protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
      return this.reject(
        400,
        'UNSUPPORTED_PROTOCOL_VERSION',
        `Unsupported protocolVersion "${protocolVersion}". Expected "${SUPPORTED_PROTOCOL_VERSION}".`,
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'medium' },
      );
    }

    if (this.config.expectedChainId && request.chainId !== this.config.expectedChainId) {
      return this.reject(
        400,
        'WRONG_CHAIN',
        `Request chainId ${request.chainId} does not match configured testnet chain ${this.config.expectedChainId}.`,
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'high' },
      );
    }

    if (
      this.config.expectedVaultAddress &&
      getAddress(request.vault) !== getAddress(this.config.expectedVaultAddress)
    ) {
      return this.reject(
        400,
        'WRONG_VAULT',
        'Request vault address does not match the configured Qrygent Vault contract.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'high' },
      );
    }

    if (request.deadline <= nowUnixSeconds) {
      return this.reject(
        400,
        'REQUEST_EXPIRED',
        'The signed payment request deadline has already expired.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'medium' },
      );
    }

    if (this.store.isNonceConsumed(request.nonce)) {
      return this.reject(
        409,
        'NONCE_ALREADY_USED',
        'Replay detected: this payment request nonce has already been accepted by the verifier.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'critical' },
      );
    }

    const agent = this.store.getAgent(request.agentId);
    if (!agent) {
      return this.reject(
        401,
        'UNKNOWN_AGENT',
        'No registered agent matches the provided agentId.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'high' },
      );
    }

    const keyRecord = this.store.getAgentKey(request.agentId, request.keyId);
    if (!keyRecord) {
      return this.reject(
        401,
        'UNKNOWN_KEY',
        'The specified keyId is not registered for this agent.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'high' },
      );
    }

    if (keyRecord.status === 'revoked') {
      return this.reject(
        403,
        'REVOKED_KEY',
        'The agent ML-DSA-65 key has been revoked and cannot authorize payments.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'critical' },
      );
    }

    if (keyRecord.status !== 'active') {
      return this.reject(
        403,
        'REVOKED_KEY',
        'The agent ML-DSA-65 key has been rotated out of active service.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'high' },
      );
    }

    let sigBytes: Uint8Array;
    try {
      sigBytes = decodeStrictKeyOrSig(signature, ML_DSA_65_SIGNATURE_BYTES, 'ML-DSA-65 signature');
    } catch {
      return this.reject(
        400,
        'INVALID_SIGNATURE',
        'Malformed or wrong-length ML-DSA-65 signature (expected 3,309 bytes).',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'high' },
      );
    }

    const digest = computeCanonicalRequestDigest(request, protocolVersion);
    const pubKeyBytes = hexToBytes(keyRecord.publicKeyHex);
    const sigValid = verifyDigestMldsa65(digest, sigBytes, pubKeyBytes);

    if (!sigValid) {
      return this.reject(
        401,
        'INVALID_SIGNATURE',
        'The payment request ML-DSA-65 signature could not be verified against the registered public key (invalid signature or altered payload).',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'critical' },
      );
    }

    if (!this.attestationSigner) {
      return this.reject(
        503,
        'VERIFIER_UNAVAILABLE',
        'ML-DSA-65 signature is valid, but VERIFIER_ATTESTATION_PRIVATE_KEY is not configured on the verifier service. Failing closed.',
        { agentId: request.agentId, mandateId: request.mandateId, severity: 'high' },
      );
    }

    const requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const attestation = await this.attestationSigner.signAttestation(
      request,
      digest,
      nowUnixSeconds,
    );

    this.store.markNonceConsumed(request.nonce, requestId, nowUnixSeconds);
    this.store.recordSecurityEvent({
      code: 'PAYMENT_ATTESTED',
      summary: `Verified ML-DSA-65 signature for ${agent.label} and issued short-lived EIP-712 attestation.`,
      agentId: request.agentId,
      mandateId: request.mandateId,
      requestId,
      severity: 'info',
    });

    return {
      httpStatus: 200,
      body: {
        status: 'verified',
        requestId,
        verification: {
          algorithm: 'ML-DSA-65',
          publicKeyFingerprint: keyRecord.fingerprint,
          verifiedAt: new Date(nowUnixSeconds * 1000).toISOString(),
          integrityStatus: 'intact',
        },
        attestation,
      },
    };
  }

  private assertFreshTimestamp(timestamp: number, nowUnixSeconds: number) {
    const windowSec = this.config.ownerAuthWindowSeconds ?? 600;
    if (Math.abs(nowUnixSeconds - timestamp) > windowSec) {
      throw new Error('Owner authorization signature timestamp is expired or out of window.');
    }
  }

  async registerAgentKey(
    rawBody: unknown,
    nowUnixSeconds = Math.floor(Date.now() / 1000),
  ): Promise<{ agent: PublicAgentRecord }> {
    const parsed = agentRegisterBodySchema.parse(rawBody);
    this.assertFreshTimestamp(parsed.timestamp, nowUnixSeconds);

    const pkBytes = decodeStrictKeyOrSig(
      parsed.publicKey,
      ML_DSA_65_PUBLIC_KEY_BYTES,
      'ML-DSA-65 public key',
    );
    const fingerprint = computePublicKeyFingerprint(pkBytes);
    const authMessage = buildOwnerKeyAuthMessage({
      action: 'REGISTER_AGENT_KEY',
      owner: parsed.owner,
      agentId: parsed.agentId,
      keyId: parsed.keyId,
      publicKeyFingerprint: fingerprint,
      timestamp: parsed.timestamp,
    });

    const ownerValid = await verifyMessage({
      address: parsed.owner,
      message: authMessage,
      signature: parsed.ownerSignature,
    });
    if (!ownerValid) {
      this.store.recordSecurityEvent({
        code: 'UNAUTHORIZED_KEY_MUTATION',
        summary: `Rejected unauthenticated ML-DSA-65 key registration attempt for ${parsed.agentId}.`,
        agentId: parsed.agentId,
        severity: 'critical',
      });
      throw new Error('Invalid owner wallet signature for key registration.');
    }

    const agent = this.store.registerAgent({
      agentId: parsed.agentId,
      label: parsed.label,
      owner: parsed.owner,
      keyId: parsed.keyId,
      publicKeyHex: bytesToHex(pkBytes),
      fingerprint,
      nowUnix: nowUnixSeconds,
    });

    return { agent };
  }

  async rotateAgentKey(
    agentId: Hex,
    rawBody: unknown,
    nowUnixSeconds = Math.floor(Date.now() / 1000),
  ): Promise<{ agent: PublicAgentRecord }> {
    const parsed = agentRotateBodySchema.parse(rawBody);
    this.assertFreshTimestamp(parsed.timestamp, nowUnixSeconds);

    const pkBytes = decodeStrictKeyOrSig(
      parsed.newPublicKey,
      ML_DSA_65_PUBLIC_KEY_BYTES,
      'ML-DSA-65 public key',
    );
    const fingerprint = computePublicKeyFingerprint(pkBytes);
    const authMessage = buildOwnerKeyAuthMessage({
      action: 'ROTATE_AGENT_KEY',
      owner: parsed.owner,
      agentId,
      keyId: parsed.newKeyId,
      publicKeyFingerprint: fingerprint,
      timestamp: parsed.timestamp,
    });

    const ownerValid = await verifyMessage({
      address: parsed.owner,
      message: authMessage,
      signature: parsed.ownerSignature,
    });
    if (!ownerValid) {
      this.store.recordSecurityEvent({
        code: 'UNAUTHORIZED_KEY_MUTATION',
        summary: `Rejected unauthenticated ML-DSA-65 key rotation attempt for ${agentId}.`,
        agentId,
        severity: 'critical',
      });
      throw new Error('Invalid owner wallet signature for key rotation.');
    }

    const agent = this.store.rotateAgentKey({
      agentId,
      owner: parsed.owner,
      newKeyId: parsed.newKeyId,
      newPublicKeyHex: bytesToHex(pkBytes),
      newFingerprint: fingerprint,
      nowUnix: nowUnixSeconds,
    });

    return { agent };
  }

  async revokeAgentKey(
    agentId: Hex,
    rawBody: unknown,
    nowUnixSeconds = Math.floor(Date.now() / 1000),
  ): Promise<{ agent: PublicAgentRecord }> {
    const parsed = agentRevokeBodySchema.parse(rawBody);
    this.assertFreshTimestamp(parsed.timestamp, nowUnixSeconds);

    const keyRecord = this.store.getAgentKey(agentId, parsed.keyId);
    if (!keyRecord) {
      throw new Error('Specified agent or keyId not found.');
    }

    const authMessage = buildOwnerKeyAuthMessage({
      action: 'REVOKE_AGENT_KEY',
      owner: parsed.owner,
      agentId,
      keyId: parsed.keyId,
      publicKeyFingerprint: keyRecord.fingerprint,
      timestamp: parsed.timestamp,
    });

    const ownerValid = await verifyMessage({
      address: parsed.owner,
      message: authMessage,
      signature: parsed.ownerSignature,
    });
    if (!ownerValid) {
      this.store.recordSecurityEvent({
        code: 'UNAUTHORIZED_KEY_MUTATION',
        summary: `Rejected unauthenticated ML-DSA-65 key revocation attempt for ${agentId}.`,
        agentId,
        severity: 'critical',
      });
      throw new Error('Invalid owner wallet signature for key revocation.');
    }

    const agent = this.store.revokeAgentKey({
      agentId,
      owner: parsed.owner,
      keyId: parsed.keyId,
      reason: parsed.reason,
      nowUnix: nowUnixSeconds,
    });

    return { agent };
  }
}
