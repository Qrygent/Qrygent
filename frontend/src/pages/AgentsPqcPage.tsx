import { useState, type FormEvent } from 'react';
import type { Hex } from 'viem';
import { Ban, CheckCircle2, KeyRound, Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatUtcTimestamp, truncateHex } from '../domain/units';
import {
  useAgents,
  useRegisterAgentKey,
  useRevokeAgentKey,
  useWalletNetwork,
} from '../hooks/useQrygentData';
import {
  buildOwnerKeyAuthMessage,
  computePublicKeyFingerprintBrowser,
} from '../services/pqcVerifier/client';
import { LatticeKeyVisual } from '../components/pqc/LatticeKeyVisual';
import {
  ErrorAlert,
  LedgerCard,
  PqcDarkCard,
  SectionHeader,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function AgentsPqcPage() {
  const wallet = useWalletNetwork();
  const agentsQuery = useAgents();
  const registerMutation = useRegisterAgentKey();
  const revokeMutation = useRevokeAgentKey();

  const [agentLabel, setAgentLabel] = useState('');
  const [agentIdHex, setAgentIdHex] = useState('');
  const [keyIdHex, setKeyIdHex] = useState('');
  const [publicKeyInput, setPublicKeyInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (agentLabel.trim().length < 2) {
      setFormError('Provide a descriptive agent label (at least 2 characters).');
      return;
    }
    if (!BYTES32_RE.test(agentIdHex.trim())) {
      setFormError('Agent ID must be a 32-byte 0x-prefixed hex identifier (66 characters).');
      return;
    }
    if (!BYTES32_RE.test(keyIdHex.trim())) {
      setFormError('Key ID must be a 32-byte 0x-prefixed hex identifier (66 characters).');
      return;
    }
    if (publicKeyInput.toLowerCase().includes('private')) {
      setFormError('Refused: never paste private key material into the browser.');
      return;
    }

    let fingerprint: string;
    try {
      fingerprint = await computePublicKeyFingerprintBrowser(publicKeyInput);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Public key must be an exact 1,952-byte encoded ML-DSA-65 public key.',
      );
      return;
    }

    if (!wallet.isConnected || !wallet.address) {
      setFormError(
        `Public key validated (${fingerprint.slice(0, 22)}…). Connect your owner EVM wallet to sign the EIP-191 key registration authorization.`,
      );
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = buildOwnerKeyAuthMessage({
        action: 'REGISTER_AGENT_KEY',
        owner: wallet.address,
        agentId: agentIdHex.trim() as Hex,
        keyId: keyIdHex.trim() as Hex,
        publicKeyFingerprint: fingerprint,
        timestamp,
      });

      const ownerSignature = await wallet.signMessageAsync({ message });
      const res = await registerMutation.mutateAsync({
        agentId: agentIdHex.trim() as Hex,
        label: agentLabel.trim(),
        owner: wallet.address,
        keyId: keyIdHex.trim() as Hex,
        publicKey: publicKeyInput.trim(),
        timestamp,
        ownerSignature,
      });

      if (res.status === 'ready') {
        setFormSuccess(
          `Registered ${res.data.label} (${res.data.publicKeyFingerprint.slice(0, 24)}…).`,
        );
        setAgentLabel('');
        setAgentIdHex('');
        setKeyIdHex('');
        setPublicKeyInput('');
      } else if (res.status === 'unconfigured') {
        setFormError(res.reason);
      } else {
        setFormError(res.message);
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Wallet signature or registration failed.',
      );
    }
  };

  const handleRevokeKey = async (agentId: string, keyId: string, fingerprint: string) => {
    setActionError(null);
    if (!wallet.isConnected || !wallet.address) {
      setActionError('Connect the owning EVM wallet before revoking an ML-DSA-65 key.');
      return;
    }
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = buildOwnerKeyAuthMessage({
        action: 'REVOKE_AGENT_KEY',
        owner: wallet.address,
        agentId: agentId as Hex,
        keyId: keyId as Hex,
        publicKeyFingerprint: fingerprint,
        timestamp,
      });
      const ownerSignature = await wallet.signMessageAsync({ message });
      const res = await revokeMutation.mutateAsync({
        agentId: agentId as Hex,
        owner: wallet.address,
        keyId: keyId as Hex,
        reason: 'Owner initiated revocation via Qrygent dashboard',
        timestamp,
        ownerSignature,
      });
      if (res.status === 'error') {
        setActionError(res.message);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Revocation failed.');
    }
  };

  const agentsState = agentsQuery.data;

  return (
    <div className="space-y-8">
      <SectionHeader
        index="03"
        eyebrow="Post-Quantum Cryptographic Identity"
        title="Agents & ML-DSA-65 Keys"
        description="Manage autonomous agent identities, inspect registered NIST FIPS 204 ML-DSA-65 public-key fingerprints, track key rotation history, and revoke compromised keys via owner wallet signatures."
        actions={<ZoneBadge tone="pqc">Algorithm: ML-DSA-65 · FIPS 204</ZoneBadge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <PqcDarkCard className="lg:col-span-7 p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#B8F229]">
                NIST FIPS 204 Parameter Reference
              </div>
              <h2 className="font-display text-xl font-bold text-[#F4F1EA]">
                ML-DSA-65 (Module-Lattice Digital Signature)
              </h2>
              <p className="text-xs text-[#9C9A91] leading-relaxed">
                Authenticates canonical payment instructions off-chain before the verifier issues a
                short-lived ECDSA EIP-712 attestation for the EVM vault contract.
              </p>
            </div>
            <LatticeKeyVisual
              fingerprint={publicKeyInput.trim().length >= 16 ? publicKeyInput.trim() : null}
              size={64}
              dark
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#262924] font-mono">
            <div>
              <div className="text-[10px] uppercase text-[#9C9A91]">Security Level</div>
              <div className="text-sm text-[#F4F1EA] mt-1">NIST Level 3</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#9C9A91]">Public Key Spec</div>
              <div className="text-sm text-[#F4F1EA] mt-1">1,952 bytes</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#9C9A91]">Signature Spec</div>
              <div className="text-sm text-[#F4F1EA] mt-1">3,309 bytes</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#9C9A91]">Key Custody</div>
              <div className="text-sm text-[#B8F229] mt-1">Local Agent Only</div>
            </div>
          </div>

          <div className="p-3 bg-[#151714] border border-[#262924] text-[11px] text-[#9C9A91] flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#B8F229] shrink-0 mt-0.5" />
            <span>
              <strong className="text-[#F4F1EA]">Zero Browser Private Keys:</strong> Generate keys
              locally via <code>npm --prefix pqc-service run agent:cli -- keygen</code>. Only the
              1,952-byte public key is registered here, authorized by your owner EVM wallet
              signature.
            </span>
          </div>
        </PqcDarkCard>

        {/* Owner-Authorized Registration Form */}
        <LedgerCard className="lg:col-span-5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#141412]/10">
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412] flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Register Public Key
            </h2>
            <ZoneBadge tone={wallet.isConnected ? 'vault' : 'neutral'}>
              {wallet.isConnected ? 'Owner Wallet Ready' : 'Connect Wallet to Sign'}
            </ZoneBadge>
          </div>

          <form onSubmit={handleRegister} className="space-y-3.5" noValidate>
            <div>
              <label
                htmlFor="agent-label"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
              >
                Agent Label
              </label>
              <input
                id="agent-label"
                type="text"
                value={agentLabel}
                onChange={(e) => setAgentLabel(e.target.value)}
                placeholder="e.g. Treasury Settlement Simulator"
                className="w-full px-3 py-2 border border-[#141412]/25 bg-white text-xs focus:outline-none focus:border-[#2B59C3]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="agent-id"
                  className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
                >
                  Agent ID (bytes32)
                </label>
                <input
                  id="agent-id"
                  type="text"
                  value={agentIdHex}
                  onChange={(e) => setAgentIdHex(e.target.value)}
                  placeholder="0x0000… (64 hex)"
                  className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
                />
              </div>
              <div>
                <label
                  htmlFor="key-id"
                  className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
                >
                  Key ID (bytes32)
                </label>
                <input
                  id="key-id"
                  type="text"
                  value={keyIdHex}
                  onChange={(e) => setKeyIdHex(e.target.value)}
                  placeholder="0x0000… (64 hex)"
                  className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="agent-pubkey"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
              >
                ML-DSA-65 Public Key (1,952 bytes · Public Material Only)
              </label>
              <textarea
                id="agent-pubkey"
                rows={3}
                value={publicKeyInput}
                onChange={(e) => setPublicKeyInput(e.target.value)}
                placeholder="Paste 0x-hex or base64 ML-DSA-65 public key from agent CLI..."
                className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-[11px] focus:outline-none focus:border-[#2B59C3]"
              />
            </div>

            {formError ? <ErrorAlert title="Registration Blocked" message={formError} /> : null}

            {formSuccess ? (
              <div
                role="status"
                className="p-3 border border-[#2E4A00]/35 bg-[#2E4A00]/10 text-xs text-[#141412] flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-[#2E4A00] shrink-0" />
                <span>{formSuccess}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={registerMutation.isPending || wallet.isSigningMessage}
              className="w-full py-2.5 px-4 bg-[#0D0E0D] text-[#B8F229] font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-[#1a1c19] disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5" />
              {wallet.isSigningMessage
                ? 'Awaiting Owner Wallet Signature…'
                : registerMutation.isPending
                  ? 'Registering Key…'
                  : 'Sign & Register ML-DSA-65 Key'}
            </button>
          </form>
        </LedgerCard>
      </div>

      {/* Live Registered Agents Directory */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold">
            Registered Agents &amp; Key Rotation History
          </h2>
          <button
            type="button"
            onClick={() => agentsQuery.refetch()}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase text-[#5F5E56] hover:text-[#141412] cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${agentsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh Registry
          </button>
        </div>

        {actionError ? <ErrorAlert title="Key Action Failed" message={actionError} /> : null}

        {agentsState?.status === 'unconfigured' ? (
          <UnavailableIntegrationCard
            title="Agent & Public-Key Registry Not Configured"
            reason={agentsState.reason}
            missing={agentsState.missing}
            owner={agentsState.owner}
          />
        ) : agentsState?.status === 'error' ? (
          <ErrorAlert
            title="Unable to Load Agent Registry"
            code={agentsState.code}
            message={agentsState.message}
          />
        ) : agentsState?.status === 'ready' ? (
          agentsState.data.length === 0 ? (
            <LedgerCard className="p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[#141412]">No Agents Registered Yet</p>
              <p className="text-xs text-[#5F5E56] max-w-md mx-auto">
                Connected to live PQC verifier registry. Generate a local test ML-DSA-65 keypair
                with the agent CLI and register its public key above.
              </p>
            </LedgerCard>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {agentsState.data.map((agent) => (
                <LedgerCard key={agent.agentId} className="p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <LatticeKeyVisual
                        fingerprint={agent.publicKeyFingerprint}
                        size={52}
                        dark={false}
                      />
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-[#141412]">{agent.label}</h3>
                          <ZoneBadge tone="pqc">{agent.algorithm}</ZoneBadge>
                          <ZoneBadge
                            tone={
                              agent.keyStatus === 'active'
                                ? 'vault'
                                : agent.keyStatus === 'revoked'
                                  ? 'error'
                                  : 'warning'
                            }
                          >
                            {agent.keyStatus}
                          </ZoneBadge>
                        </div>
                        <div className="font-mono text-[11px] text-[#5F5E56] break-all">
                          Agent ID: {truncateHex(agent.agentId, 10, 8)} · Owner:{' '}
                          {truncateHex(agent.owner, 6, 4)}
                        </div>
                        <div className="font-mono text-[11px] text-[#141412] break-all">
                          Fingerprint: {agent.publicKeyFingerprint}
                        </div>
                        <div className="font-mono text-[10px] text-[#5F5E56]">
                          Registered: {formatUtcTimestamp(agent.registeredAt)}
                        </div>
                      </div>
                    </div>

                    {agent.keyStatus === 'active' ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleRevokeKey(
                            agent.agentId,
                            agent.activeKeyId,
                            agent.publicKeyFingerprint,
                          )
                        }
                        disabled={revokeMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#C81E3A] text-[#C81E3A] font-mono text-[11px] uppercase tracking-wider hover:bg-[#C81E3A] hover:text-white transition-colors cursor-pointer shrink-0"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Revoke Active Key
                      </button>
                    ) : null}
                  </div>

                  {/* Key Rotation History */}
                  <div className="pt-3 border-t border-[#141412]/10 space-y-2">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                      Key Rotation &amp; Revocation Audit Trail ({agent.rotationHistory.length})
                    </div>
                    <div className="divide-y divide-[#141412]/10 font-mono text-[11px]">
                      {agent.rotationHistory.map((entry) => (
                        <div
                          key={entry.keyId}
                          className="py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="text-[#141412]">
                            {truncateHex(entry.keyId, 8, 6)} · {entry.fingerprint.slice(0, 26)}…
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[#5F5E56]">
                              {formatUtcTimestamp(entry.registeredAt)}
                            </span>
                            <ZoneBadge
                              tone={
                                entry.status === 'active'
                                  ? 'vault'
                                  : entry.status === 'revoked'
                                    ? 'error'
                                    : 'neutral'
                              }
                            >
                              {entry.status}
                            </ZoneBadge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </LedgerCard>
              ))}
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
