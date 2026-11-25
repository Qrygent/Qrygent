import type { ReactNode } from 'react';
import { AlertTriangle, ShieldAlert, Unplug } from 'lucide-react';

export type BadgeTone = 'pqc' | 'bridge' | 'vault' | 'error' | 'warning' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  pqc: 'bg-[#0D0E0D] text-[#B8F229] border-[#262924]',
  bridge: 'bg-[#2B59C3] text-white border-[#2B59C3]',
  vault: 'bg-[#2E4A00]/10 text-[#2E4A00] border-[#2E4A00]/25',
  error: 'bg-[#C81E3A]/10 text-[#C81E3A] border-[#C81E3A]/30',
  warning: 'bg-[#B45309]/10 text-[#B45309] border-[#B45309]/30',
  neutral: 'bg-[#ECEAE3] text-[#5F5E56] border-[#141412]/15',
};

export function ZoneBadge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function TestnetAssetBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${
        dark
          ? 'border-[#B8F229]/40 bg-[#B8F229]/10 text-[#B8F229]'
          : 'border-[#141412]/25 bg-[#ECEAE3] text-[#141412]'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dark ? 'bg-[#B8F229]' : 'bg-[#B45309]'}`}
        aria-hidden="true"
      />
      Testnet Only · No Real Value
    </span>
  );
}

export function SectionHeader({
  index,
  eyebrow,
  title,
  description,
  actions,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[#141412]/15 pb-6">
      <div className="space-y-1.5 max-w-2xl">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5F5E56]">
          <span className="text-[#141412] font-semibold">{index}</span>
          <span aria-hidden="true">/</span>
          <span>{eyebrow}</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#141412]">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-[#5F5E56] leading-relaxed">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}

export function LedgerCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[#FFFFFF] border border-[#141412]/15 rounded-[2px] ${className}`}>
      {children}
    </div>
  );
}

export function PqcDarkCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-[#0D0E0D] text-[#F4F1EA] border border-[#262924] rounded-[2px] bg-pqc-grid ${className}`}
    >
      {children}
    </div>
  );
}

export function UnavailableIntegrationCard({
  title,
  reason,
  missing,
  owner,
  compact = false,
}: {
  title: string;
  reason: string;
  missing: string[];
  owner: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={`border border-[#141412]/20 bg-[#ECEAE3]/65 rounded-[2px] ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 shrink-0 bg-[#141412] text-[#F7F5F0] flex items-center justify-center rounded-[2px] mt-0.5">
          <Unplug className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="space-y-2.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#141412]">{title}</h3>
            <ZoneBadge tone="warning">Integration Required</ZoneBadge>
          </div>
          <p className="text-xs text-[#5F5E56] leading-relaxed">{reason}</p>
          {missing.length > 0 ? (
            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                Missing Dependencies
              </div>
              <ul className="space-y-1">
                {missing.map((item) => (
                  <li
                    key={item}
                    className="font-mono text-[11px] text-[#141412] flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 bg-[#B45309] shrink-0" aria-hidden="true" />
                    <span className="break-all">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="pt-1 border-t border-[#141412]/10 font-mono text-[10px] text-[#5F5E56]">
            Owner: <span className="text-[#141412] font-medium">{owner}</span> · See{' '}
            <code>docs/FRONTEND_INTEGRATION_REQUIREMENTS.md</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorAlert({
  title,
  message,
  code,
}: {
  title: string;
  message: string;
  code?: string;
}) {
  return (
    <div
      role="alert"
      className="border border-[#C81E3A]/35 bg-[#C81E3A]/[0.06] p-4 rounded-[2px] flex items-start gap-3"
    >
      <ShieldAlert className="w-4 h-4 text-[#C81E3A] shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#C81E3A]">{title}</span>
          {code ? <ZoneBadge tone="error">{code}</ZoneBadge> : null}
        </div>
        <p className="text-xs text-[#141412] leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

export function TrustModelNotice({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`p-3.5 border rounded-[2px] flex items-start gap-2.5 text-xs leading-relaxed ${
        dark
          ? 'bg-[#151714] border-[#262924] text-[#9C9A91]'
          : 'bg-[#FFFFFF] border-[#141412]/15 text-[#5F5E56]'
      }`}
    >
      <AlertTriangle
        className={`w-4 h-4 shrink-0 mt-0.5 ${dark ? 'text-[#B8F229]' : 'text-[#2B59C3]'}`}
        aria-hidden="true"
      />
      <div>
        <span className={`font-semibold ${dark ? 'text-[#F4F1EA]' : 'text-[#141412]'}`}>
          Hybrid Trust Disclosure:
        </span>{' '}
        This MVP verifies agent <strong className={dark ? 'text-[#F4F1EA]' : 'text-[#141412]'}>ML-DSA-65</strong>{' '}
        signatures off-chain and bridges them via a short-lived{' '}
        <strong className={dark ? 'text-[#F4F1EA]' : 'text-[#141412]'}>ECDSA EIP-712</strong> verifier
        attestation. The smart contract independently enforces financial mandates. The verifier key is a
        scoped trust assumption—not native on-chain ML-DSA verification.
      </div>
    </div>
  );
}
