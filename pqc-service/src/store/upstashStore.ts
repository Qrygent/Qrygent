import type { Hex } from 'viem';
import { ML_DSA_65_ALGORITHM } from '../crypto/mldsa.js';
import {
  createSecurityEvent,
  MAX_SECURITY_EVENTS,
  toPublicAgentRecord,
  type IRegistryStore,
  type PublicAgentRecord,
  type RegisterAgentParams,
  type RevokeAgentKeyParams,
  type RotateAgentKeyParams,
  type SecurityAuditEvent,
  type SecurityEventInput,
  type StoredAgentRecord,
  type StoredKeyRecord,
} from './registry.js';

const AGENTS_HASH_KEY = 'qrygent:v1:agents';
const EVENTS_LIST_KEY = 'qrygent:v1:security_events';
const NONCE_PREFIX = 'qrygent:v1:nonce:';

/**
 * Serverless-safe persistent registry store backed by Upstash Redis REST API
 * (zero extra npm dependencies; native fetch; atomic SET NX for replay protection).
 */
export class UpstashRedisRegistryStore implements IRegistryStore {
  readonly storageMode = 'upstash_redis' as const;
  private readonly restUrl: string;
  private readonly restToken: string;

  constructor(restUrl: string, restToken: string) {
    this.restUrl = restUrl.replace(/\/+$/, '');
    this.restToken = restToken.trim();
  }

  private async command<T>(args: Array<string | number>): Promise<T> {
    const response = await fetch(this.restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      throw new Error(`Upstash Redis REST error (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as { result?: T; error?: string };
    if (body.error) {
      throw new Error(`Upstash Redis command failed: ${body.error}`);
    }
    return body.result as T;
  }

  async listAgents(): Promise<PublicAgentRecord[]> {
    const raw = await this.command<string[] | Record<string, string> | null>([
      'HGETALL',
      AGENTS_HASH_KEY,
    ]);
    if (!raw) return [];

    const records: StoredAgentRecord[] = [];
    if (Array.isArray(raw)) {
      for (let i = 1; i < raw.length; i += 2) {
        const val = raw[i];
        if (val) records.push(JSON.parse(val) as StoredAgentRecord);
      }
    } else {
      for (const val of Object.values(raw)) {
        records.push(JSON.parse(val) as StoredAgentRecord);
      }
    }

    return records
      .sort((a, b) => b.registeredAt - a.registeredAt)
      .map(toPublicAgentRecord);
  }

  async getAgent(agentId: Hex): Promise<StoredAgentRecord | undefined> {
    const raw = await this.command<string | null>(['HGET', AGENTS_HASH_KEY, agentId.toLowerCase()]);
    if (!raw) return undefined;
    return JSON.parse(raw) as StoredAgentRecord;
  }

  async getAgentKey(agentId: Hex, keyId: Hex): Promise<StoredKeyRecord | undefined> {
    const agent = await this.getAgent(agentId);
    if (!agent) return undefined;
    return agent.rotationHistory.find((k) => k.keyId.toLowerCase() === keyId.toLowerCase());
  }

  async registerAgent(params: RegisterAgentParams): Promise<PublicAgentRecord> {
    const key = params.agentId.toLowerCase();
    const existing = await this.getAgent(key as Hex);
    if (existing) {
      throw new Error('Agent ID is already registered. Use key rotation to update keys.');
    }

    const now = params.nowUnix ?? Math.floor(Date.now() / 1000);
    const keyEntry: StoredKeyRecord = {
      keyId: params.keyId.toLowerCase() as Hex,
      publicKeyHex: params.publicKeyHex,
      fingerprint: params.fingerprint,
      algorithm: ML_DSA_65_ALGORITHM,
      registeredAt: now,
      status: 'active',
    };

    const record: StoredAgentRecord = {
      agentId: key as Hex,
      label: params.label,
      owner: params.owner,
      algorithm: ML_DSA_65_ALGORITHM,
      activeKeyId: keyEntry.keyId,
      publicKeyFingerprint: keyEntry.fingerprint,
      keyStatus: 'active',
      registeredAt: now,
      rotationHistory: [keyEntry],
      assignedMandateIds: [],
    };

    await this.command(['HSET', AGENTS_HASH_KEY, key, JSON.stringify(record)]);
    await this.recordSecurityEvent({
      code: 'KEY_REGISTERED',
      summary: `Registered ML-DSA-65 public key ${keyEntry.fingerprint.slice(0, 22)}… for agent ${params.label}.`,
      agentId: key,
      severity: 'info',
    });

    return toPublicAgentRecord(record);
  }

  async rotateAgentKey(params: RotateAgentKeyParams): Promise<PublicAgentRecord> {
    const key = params.agentId.toLowerCase();
    const agent = await this.getAgent(key as Hex);
    if (!agent) {
      throw new Error('Agent not found.');
    }
    if (agent.owner.toLowerCase() !== params.owner.toLowerCase()) {
      throw new Error('Only the registered agent owner may rotate keys.');
    }
    if (agent.rotationHistory.some((k) => k.keyId.toLowerCase() === params.newKeyId.toLowerCase())) {
      throw new Error('Key ID has already been used for this agent.');
    }

    const now = params.nowUnix ?? Math.floor(Date.now() / 1000);
    for (const existing of agent.rotationHistory) {
      if (existing.status === 'active') {
        existing.status = 'rotated';
      }
    }

    const newEntry: StoredKeyRecord = {
      keyId: params.newKeyId.toLowerCase() as Hex,
      publicKeyHex: params.newPublicKeyHex,
      fingerprint: params.newFingerprint,
      algorithm: ML_DSA_65_ALGORITHM,
      registeredAt: now,
      status: 'active',
    };

    agent.rotationHistory.unshift(newEntry);
    agent.activeKeyId = newEntry.keyId;
    agent.publicKeyFingerprint = newEntry.fingerprint;
    agent.keyStatus = 'active';

    await this.command(['HSET', AGENTS_HASH_KEY, key, JSON.stringify(agent)]);
    await this.recordSecurityEvent({
      code: 'KEY_ROTATED',
      summary: `Rotated ML-DSA-65 key for agent ${agent.label} to ${newEntry.fingerprint.slice(0, 22)}….`,
      agentId: key,
      severity: 'medium',
    });

    return toPublicAgentRecord(agent);
  }

  async revokeAgentKey(params: RevokeAgentKeyParams): Promise<PublicAgentRecord> {
    const key = params.agentId.toLowerCase();
    const agent = await this.getAgent(key as Hex);
    if (!agent) {
      throw new Error('Agent not found.');
    }
    if (agent.owner.toLowerCase() !== params.owner.toLowerCase()) {
      throw new Error('Only the registered agent owner may revoke keys.');
    }

    const target = agent.rotationHistory.find(
      (k) => k.keyId.toLowerCase() === params.keyId.toLowerCase(),
    );
    if (!target) {
      throw new Error('Key ID not found for this agent.');
    }

    const now = params.nowUnix ?? Math.floor(Date.now() / 1000);
    target.status = 'revoked';
    target.revokedAt = now;

    if (agent.activeKeyId.toLowerCase() === target.keyId.toLowerCase()) {
      agent.keyStatus = 'revoked';
    }

    await this.command(['HSET', AGENTS_HASH_KEY, key, JSON.stringify(agent)]);
    await this.recordSecurityEvent({
      code: 'REVOKED_KEY',
      summary: `Revoked ML-DSA-65 key ${target.fingerprint.slice(0, 22)}… for ${agent.label}${params.reason ? ` (${params.reason})` : ''}.`,
      agentId: key,
      severity: 'high',
    });

    return toPublicAgentRecord(agent);
  }

  async isNonceConsumed(nonce: Hex): Promise<boolean> {
    const existing = await this.command<string | null>(['GET', `${NONCE_PREFIX}${nonce.toLowerCase()}`]);
    return existing !== null;
  }

  async claimNonce(
    nonce: Hex,
    requestId: string,
    nowUnix = Math.floor(Date.now() / 1000),
  ): Promise<boolean> {
    const payload = JSON.stringify({ requestId, consumedAt: nowUnix });
    // Atomic SET NX prevents concurrent replay across serverless instances
    const result = await this.command<string | null>([
      'SET',
      `${NONCE_PREFIX}${nonce.toLowerCase()}`,
      payload,
      'NX',
    ]);
    return result === 'OK';
  }

  async recordSecurityEvent(input: SecurityEventInput): Promise<SecurityAuditEvent> {
    const event = createSecurityEvent(input);
    await this.command(['LPUSH', EVENTS_LIST_KEY, JSON.stringify(event)]);
    await this.command(['LTRIM', EVENTS_LIST_KEY, 0, MAX_SECURITY_EVENTS - 1]);
    return event;
  }

  async listSecurityEvents(limit = 50): Promise<SecurityAuditEvent[]> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_SECURITY_EVENTS));
    const items = await this.command<string[] | null>([
      'LRANGE',
      EVENTS_LIST_KEY,
      0,
      safeLimit - 1,
    ]);
    if (!items) return [];
    return items.map((item) => JSON.parse(item) as SecurityAuditEvent);
  }
}
