import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { useAgents } from '../hooks/useQrygentData';
import { LatticeKeyVisual } from '../components/pqc/LatticeKeyVisual';
import {
  ErrorAlert,
  LedgerCard,
  PqcDarkCard,
  SectionHeader,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

const HEX_OR_BASE64_PUBKEY_RE = /^(0x[0-9a-fA-F]{64,}|[A-Za-z0-9+/=]{64,})$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function AgentsPqcPage() {
  const agentsQuery = useAgents();

  const [agentLabel, setAgentLabel] = useState('');
  const [agentIdHex, setAgentIdHex] = useState('');
  const [publicKeyInput, setPublicKeyInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formValidated, setFormValidated] = useState(false);

  const handleValidateRegistration = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormValidated(false);

    if (agentLabel.trim().length < 2) {
      setFormError('Provide a descriptive agent label (at least 2 characters).');
      return;
    }
    if (!BYTES32_RE.test(agentIdHex.trim())) {
      setFormError('Agent ID must be a 32-byte 0x-prefixed hex identifier (66 characters).');
      return;
    }
    if (publicKeyInput.toLowerCase().includes('private')) {
      setFormError('Refused: never paste private key material into the browser.');
      return;
    }
    if (!HEX_OR_BASE64_PUBKEY_RE.test(publicKeyInput.trim())) {
      setFormError(
        'Public key must be an encoded ML-DSA-65 public key (hex or base64, never a private key).',
      );
      return;
    }

    setFormValidated(true);
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        index="03"
        eyebrow="Post-Quantum Cryptographic Identity"
        title="Agents & ML-DSA-65 Keys"
        description="Manage autonomous agent identities, inspect registered NIST FIPS 204 ML-DSA-65 public-key fingerprints, track key rotation history, and revoke compromised keys."
        actions={<ZoneBadge tone="pqc">Algorithm: ML-DSA-65 · FIPS 204</ZoneBadge>}
      />

      {/* PQC Identity Architecture & Custody Banner */}
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
              <strong className="text-[#F4F1EA]">Zero Browser Private Keys:</strong> Agent ML-DSA-65
              private keys remain exclusively inside the local agent signing runtime and are never
              generated, accepted, stored, or logged by this frontend.
            </span>
          </div>
        </PqcDarkCard>

        {/* Owner-Authorized Registration Form (Schema Preview + Gated Submission) */}
        <LedgerCard className="lg:col-span-5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#141412]/10">
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412] flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Register Public Key
            </h2>
            <ZoneBadge tone="warning">Registry Pending</ZoneBadge>
          </div>

          <form onSubmit={handleValidateRegistration} className="space-y-3.5" noValidate>
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
                placeholder="0x0000… (64 hex chars)"
                className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
              />
            </div>

            <div>
              <label
                htmlFor="agent-pubkey"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
              >
                ML-DSA-65 Public Key (Public Material Only)
              </label>
              <textarea
                id="agent-pubkey"
                rows={3}
                value={publicKeyInput}
                onChange={(e) => setPublicKeyInput(e.target.value)}
                placeholder="Paste encoded ML-DSA-65 public key (base64 or 0x-hex)..."
                className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-[11px] focus:outline-none focus:border-[#2B59C3]"
              />
            </div>

            {formError ? <ErrorAlert title="Registration Input Invalid" message={formError} /> : null}

            {formValidated ? (
              <div
                role="status"
                className="p-3 border border-[#B45309]/35 bg-[#B45309]/10 text-xs text-[#141412]"
              >
                Input format validated locally. Owner-authorized submission is currently disabled
                pending Milestone 0 selection of on-chain commitment vs. verifier registry endpoints.
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-[#141412] text-[#F7F5F0] font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-[#2a2a26]"
            >
              <Lock className="w-3.5 h-3.5" />
              Validate Registration Payload
            </button>
          </form>
        </LedgerCard>
      </div>

      {/* Registered Agents Directory */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold">
            Registered Agents &amp; Key Rotation History
          </h2>
          <span className="font-mono text-[11px] text-[#5F5E56]">
            Includes status, fingerprint, registration timestamp &amp; revocation controls
          </span>
        </div>

        {agentsQuery.data?.status === 'unconfigured' ? (
          <UnavailableIntegrationCard
            title="Agent & Public-Key Registry Not Yet Connected"
            reason={agentsQuery.data.reason}
            missing={agentsQuery.data.missing}
            owner={agentsQuery.data.owner}
          />
        ) : null}
      </section>
    </div>
  );
}
