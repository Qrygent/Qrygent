import { Check, Clock, ShieldAlert, Slash } from 'lucide-react';
import { ZoneBadge } from '../primitives/AtelierPrimitives';

export type StageState = 'idle' | 'active' | 'verified' | 'rejected' | 'unavailable';

export interface AuthorizationPipelineState {
  stage1Canonical: StageState;
  stage2MldsaSign: StageState;
  stage3VerifierSig: StageState;
  stage4FreshnessMandate: StageState;
  stage5Eip712Attestation: StageState;
  stage6ContractEnforce: StageState;
  stage7Settlement: StageState;
  summaryNote?: string;
}

export const IDLE_PIPELINE_STATE: AuthorizationPipelineState = {
  stage1Canonical: 'idle',
  stage2MldsaSign: 'idle',
  stage3VerifierSig: 'idle',
  stage4FreshnessMandate: 'idle',
  stage5Eip712Attestation: 'idle',
  stage6ContractEnforce: 'unavailable',
  stage7Settlement: 'unavailable',
};

function StageIcon({ state, dark }: { state: StageState; dark?: boolean }) {
  if (state === 'verified') {
    return (
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          dark ? 'bg-[#B8F229] text-[#0D0E0D]' : 'bg-[#2E4A00] text-white'
        }`}
      >
        <Check className="w-3 h-3" />
      </span>
    );
  }
  if (state === 'rejected') {
    return (
      <span className="w-5 h-5 rounded-full bg-[#C81E3A] text-white flex items-center justify-center shrink-0">
        <ShieldAlert className="w-3 h-3" />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 animate-pulse ${
          dark ? 'bg-[#B8F229]/25 text-[#B8F229]' : 'bg-[#2B59C3]/20 text-[#2B59C3]'
        }`}
      >
        <Clock className="w-3 h-3" />
      </span>
    );
  }
  if (state === 'unavailable') {
    return (
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
          dark ? 'border-[#383B35] text-[#6E6C64]' : 'border-[#141412]/20 text-[#8D8B82]'
        }`}
      >
        <Slash className="w-2.5 h-2.5" />
      </span>
    );
  }
  return (
    <span
      className={`w-5 h-5 rounded-full border shrink-0 ${
        dark ? 'border-[#383B35]' : 'border-[#141412]/25'
      }`}
    />
  );
}

function StageRow({
  num,
  title,
  detail,
  state,
  dark = false,
}: {
  num: string;
  title: string;
  detail: string;
  state: StageState;
  dark?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <StageIcon state={state} dark={dark} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-xs font-medium ${
              dark ? 'text-[#F4F1EA]' : 'text-[#141412]'
            }`}
          >
            <span className="font-mono opacity-60 mr-1.5">{num}</span>
            {title}
          </span>
          <span
            className={`font-mono text-[10px] uppercase ${
              state === 'verified'
                ? dark
                  ? 'text-[#B8F229]'
                  : 'text-[#2E4A00]'
                : state === 'rejected'
                  ? 'text-[#C81E3A]'
                  : state === 'active'
                    ? dark
                      ? 'text-[#B8F229]'
                      : 'text-[#2B59C3]'
                    : dark
                      ? 'text-[#9C9A91]'
                      : 'text-[#5F5E56]'
            }`}
          >
            {state}
          </span>
        </div>
        <p className={`text-[11px] mt-0.5 ${dark ? 'text-[#9C9A91]' : 'text-[#5F5E56]'}`}>
          {detail}
        </p>
      </div>
    </div>
  );
}

/**
 * Dual-Zone Authorization Theater (Atelier Cipher Signature Component).
 * Visually separates Off-Chain ML-DSA-65 (Void Ink), ECDSA EIP-712 Bridge (Cobalt),
 * and On-Chain Vault Enforcement (Warm Bone).
 */
export function DualStageAuthPipeline({
  state = IDLE_PIPELINE_STATE,
  compact = false,
}: {
  state?: AuthorizationPipelineState;
  compact?: boolean;
}) {
  return (
    <section aria-label="Seven-stage cryptographic payment authorization pipeline" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#5F5E56]">
          7-Stage Hybrid Authorization Architecture
        </div>
        {state.summaryNote ? <ZoneBadge tone="neutral">{state.summaryNote}</ZoneBadge> : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#141412]/20 rounded-[2px] overflow-hidden">
        {/* ZONE I: OFF-CHAIN PQC (VOID INK) */}
        <div className="lg:col-span-5 bg-[#0D0E0D] text-[#F4F1EA] bg-pqc-grid p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#262924]">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#B8F229]">
              Zone I · Off-Chain PQC
            </span>
            <span className="font-mono text-[10px] text-[#9C9A91]">ML-DSA-65 (FIPS 204)</span>
          </div>

          <div className="divide-y divide-[#262924]">
            <StageRow
              num="01"
              title="Canonical Payment Request"
              detail="Deterministic fields bound to chainId, vault, agent, mandate, nonce & deadline"
              state={state.stage1Canonical}
              dark
            />
            <StageRow
              num="02"
              title="ML-DSA-65 Agent Signature"
              detail="Signed locally by agent runtime; private key never enters browser or verifier"
              state={state.stage2MldsaSign}
              dark
            />
            <StageRow
              num="03"
              title="Registered Public-Key Check"
              detail="Verifier validates ML-DSA-65 signature against authoritative key registry"
              state={state.stage3VerifierSig}
              dark
            />
            {!compact ? (
              <StageRow
                num="04"
                title="Freshness & Mandate Binding"
                detail="Checks request deadline, nonce uniqueness, key status & mandate binding"
                state={state.stage4FreshnessMandate}
                dark
              />
            ) : null}
          </div>
        </div>

        {/* ZONE II: VERIFIER BRIDGE (BRIDGE COBALT) */}
        <div className="lg:col-span-3 bg-[#2B59C3] text-white p-5 flex flex-col justify-between gap-4 border-y lg:border-y-0 lg:border-x border-[#141412]/20">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/20">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/90">
                Zone II · Bridge
              </span>
              <span className="font-mono text-[10px] text-white/75">ECDSA</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">05 · EIP-712 Attestation</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 bg-white/15 rounded-full">
                  {state.stage5Eip712Attestation}
                </span>
              </div>
              <p className="text-xs text-white/85 leading-relaxed">
                Authorized verifier signs a short-lived ECDSA EIP-712 attestation committing to the
                canonical request digest.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-white/20 text-[11px] text-white/85 leading-snug">
            <strong className="text-white">Trust Assumption:</strong> Verifier key is scoped solely
            to payment attestations and cannot withdraw funds or alter mandates.
          </div>
        </div>

        {/* ZONE III: ON-CHAIN VAULT ENFORCEMENT (WARM BONE / CHALK) */}
        <div className="lg:col-span-4 bg-[#FFFFFF] text-[#141412] p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#141412]/15">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#2E4A00] font-semibold">
              Zone III · On-Chain Vault
            </span>
            <span className="font-mono text-[10px] text-[#5F5E56]">Solidity EVM</span>
          </div>

          <div className="divide-y divide-[#141412]/10">
            <StageRow
              num="06"
              title="Independent Mandate Enforcement"
              detail="Recovers verifier signer; enforces recipient allowlist, per-tx cap, aggregate budget, expiry & nonce replay"
              state={state.stage6ContractEnforce}
            />
            <StageRow
              num="07"
              title="Settlement or Deterministic Revert"
              detail="Transfers verified ERC-20 base units and emits auditable PaymentExecuted event"
              state={state.stage7Settlement}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
