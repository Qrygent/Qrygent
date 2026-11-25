import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Address, Hex } from 'viem';
import { ML_DSA_65_ALGORITHM } from '../crypto/mldsa.js';

export type KeyStatus = 'active' | 'rotated' | 'revoked';

export interface StoredKeyRecord {
  keyId: Hex;
  publicKeyHex: Hex;
  fingerprint: string;
  algorithm: typeof ML_DSA_65_ALGORITHM;
  registeredAt: number;
  revokedAt?: number;
  status: KeyStatus;
}

export interface StoredAgentRecord {
  agentId: Hex;
  label: string;
  owner: Address;
  algorithm: typeof ML_DSA_65_ALGORITHM;
  activeKeyId: Hex;
  publicKeyFingerprint: string;
  keyStatus: KeyStatus;
  registeredAt: number;
  rotationHistory: StoredKeyRecord[];
  assignedMandateIds: string[];
}

export interface PublicAgentRecord {
  agentId: Hex;
  label: string;
  owner: Address;
  algorithm: typeof ML_DSA_65_ALGORITHM;
  activeKeyId: Hex;
  publicKeyFingerprint: string;
  keyStatus: KeyStatus;
  registeredAt: number;
  rotationHistory: Array<{
    keyId: Hex;
    fingerprint: string;
    algorithm: typeof ML_DSA_65_ALGORITHM;
    registeredAt: number;
    revokedAt?: number;
    status: KeyStatus;
  }>;
  assignedMandateIds: string[];
}

export interface SecurityAuditEvent {
  id: string;
  timestamp: number;
  layer: 'PQC_VERIFIER';
  code: string;
  summary: string;
  agentId?: string;
  mandateId?: string;
  requestId?: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
}

export interface RegisterAgentParams {
  agentId: Hex;
  label: string;
  owner: Address;
  keyId: Hex;
  publicKeyHex: Hex;
  fingerprint: string;
  nowUnix?: number;
}

export interface RotateAgentKeyParams {
  agentId: Hex;
  owner: Address;
  newKeyId: Hex;
  newPublicKeyHex: Hex;
  newFingerprint: string;
  nowUnix?: number;
}

export interface RevokeAgentKeyParams {
  agentId: Hex;
  owner: Address;
  keyId: Hex;
  reason?: string;
  nowUnix?: number;
}

export type SecurityEventInput = Omit<SecurityAuditEvent, 'id' | 'timestamp' | 'layer'> & {
  timestamp?: number;
};

export interface IRegistryStore {
  readonly storageMode: 'local_file' | 'memory' | 'upstash_redis';
  listAgents(): Promise<PublicAgentRecord[]>;
  getAgent(agentId: Hex): Promise<StoredAgentRecord | undefined>;
  getAgentKey(agentId: Hex, keyId: Hex): Promise<StoredKeyRecord | undefined>;
  registerAgent(params: RegisterAgentParams): Promise<PublicAgentRecord>;
  rotateAgentKey(params: RotateAgentKeyParams): Promise<PublicAgentRecord>;
  revokeAgentKey(params: RevokeAgentKeyParams): Promise<PublicAgentRecord>;
  isNonceConsumed(nonce: Hex): Promise<boolean>;
  /** Atomically claims a nonce. Returns false if the nonce was already consumed. */
  claimNonce(nonce: Hex, requestId: string, nowUnix?: number): Promise<boolean>;
  recordSecurityEvent(input: SecurityEventInput): Promise<SecurityAuditEvent>;
  listSecurityEvents(limit?: number): Promise<SecurityAuditEvent[]>;
}

export function toPublicAgentRecord(a: StoredAgentRecord): PublicAgentRecord {
  return {
    agentId: a.agentId,
    label: a.label,
    owner: a.owner,
    algorithm: a.algorithm,
    activeKeyId: a.activeKeyId,
    publicKeyFingerprint: a.publicKeyFingerprint,
    keyStatus: a.keyStatus,
    registeredAt: a.registeredAt,
    rotationHistory: a.rotationHistory.map((k) => ({
      keyId: k.keyId,
      fingerprint: k.fingerprint,
      algorithm: k.algorithm,
      registeredAt: k.registeredAt,
      revokedAt: k.revokedAt,
      status: k.status,
    })),
    assignedMandateIds: a.assignedMandateIds,
  };
}

export function createSecurityEvent(input: SecurityEventInput): SecurityAuditEvent {
  return {
    id: `evt_${randomUUID().slice(0, 12)}`,
    timestamp: input.timestamp ?? Math.floor(Date.now() / 1000),
    layer: 'PQC_VERIFIER',
    code: input.code,
    summary: input.summary,
    agentId: input.agentId,
    mandateId: input.mandateId,
    requestId: input.requestId,
    severity: input.severity,
  };
}

interface PersistedState {
  agents: Record<string, StoredAgentRecord>;
  consumedNonces: Record<string, { requestId: string; consumedAt: number }>;
  securityEvents: SecurityAuditEvent[];
}

export const MAX_SECURITY_EVENTS = 200;

export class RegistryStore implements IRegistryStore {
  readonly storageMode: 'local_file' | 'memory';
  private state: PersistedState;
  private readonly filePath: string | null;

  constructor(filePath: string | null = null) {
    this.filePath = filePath;
    this.storageMode = filePath ? 'local_file' : 'memory';
    this.state = {
      agents: {},
      consumedNonces: {},
      securityEvents: [],
    };
    if (filePath && existsSync(filePath)) {
      try {
        const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<PersistedState>;
        this.state = {
          agents: raw.agents ?? {},
          consumedNonces: raw.consumedNonces ?? {},
          securityEvents: Array.isArray(raw.securityEvents) ? raw.securityEvents : [],
        };
      } catch {
        // Fail safe on unreadable local state file by starting clean
      }
    }
  }

  private persist() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  async listAgents(): Promise < PublicAgentRecord[] > {
      return Object.values(this.state.agents)
        .sort((a, b) => b.registeredAt - a.registeredAt)
      .map(toPublicAgentRecord);
    }

  async getAgent(agentId: Hex): Promise < StoredAgentRecord | undefined > {
        return this.state.agents[agentId.toLowerCase()];
      }

  async getAgentKey(agentId: Hex, keyId: Hex): Promise < StoredKeyRecord | undefined > {
          const agent = await this.getAgent(agentId);
          if(!agent) return undefined;
          return agent.rotationHistory.find((k) => k.keyId.toLowerCase() === keyId.toLowerCase());
        }

  async registerAgent(params: RegisterAgentParams): Promise < PublicAgentRecord > {
            const key = params.agentId.toLowerCase();
            if(this.state.agents[key]) {
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
            this.state.agents[key] = record;

              await this.recordSecurityEvent({
                code: 'KEY_REGISTERED',
                summary: `Registered ML-DSA-65 public key ${keyEntry.fingerprint.slice(0, 22)}… for agent ${params.label}.`,
                agentId: key,
                severity: 'info',
              });

              this.persist();
              return toPublicAgentRecord(record);
            }

              async rotateAgentKey(params: RotateAgentKeyParams): Promise<PublicAgentRecord> {
                const key = params.agentId.toLowerCase();
                const agent = this.state.agents[key];
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

                  await this.recordSecurityEvent({
                    code: 'KEY_ROTATED',
                    summary: `Rotated ML-DSA-65 key for agent ${agent.label} to ${newEntry.fingerprint.slice(0, 22)}….`,
                    agentId: key,
                    severity: 'medium',
                  });

                  this.persist();
                  return toPublicAgentRecord(agent);
                }

                  async revokeAgentKey(params: RevokeAgentKeyParams): Promise<PublicAgentRecord> {
                    const key = params.agentId.toLowerCase();
                    const agent = this.state.agents[key];
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

                      await this.recordSecurityEvent({
                        code: 'REVOKED_KEY',
                        summary: `Revoked ML-DSA-65 key ${target.fingerprint.slice(0, 22)}… for ${agent.label}${params.reason ? ` (${params.reason})` : ''}.`,
                        agentId: key,
                        severity: 'high',
                      });

                      this.persist();
                      return toPublicAgentRecord(agent);
                    }

                      async isNonceConsumed(nonce: Hex): Promise<boolean> {
                        return Boolean(this.state.consumedNonces[nonce.toLowerCase()]);
                      }

  async claimNonce(
                          nonce: Hex,
                          requestId: string,
                          nowUnix = Math.floor(Date.now() / 1000),
                        ): Promise < boolean > {
                          const key = nonce.toLowerCase();
                          if(this.state.consumedNonces[key]) {
                      return false;
                    }
                    this.state.consumedNonces[key] = { requestId, consumedAt: nowUnix };
                    this.persist();
                    return true;
                  }

  async recordSecurityEvent(input: SecurityEventInput): Promise < SecurityAuditEvent > {
                      const event = createSecurityEvent(input);
                      this.state.securityEvents.unshift(event);
                      if(this.state.securityEvents.length > MAX_SECURITY_EVENTS) {
                  this.state.securityEvents.length = MAX_SECURITY_EVENTS;
                }
                this.persist();
                return event;
              }

  async listSecurityEvents(limit = 50): Promise < SecurityAuditEvent[] > {
                  return this.state.securityEvents.slice(0, Math.max(1, Math.min(limit, MAX_SECURITY_EVENTS)));
                }
              }
