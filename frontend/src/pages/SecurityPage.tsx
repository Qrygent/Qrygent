import { Cpu, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { envConfig } from '../config/env';
import { formatUtcTimestamp, truncateHex } from '../domain/units';
import { useSecurityEvents, useVerifierHealth } from '../hooks/useQrygentData';
import {
  ErrorAlert,
  LedgerCard,
  PqcDarkCard,
  SectionHeader,
  TrustModelNotice,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

interface ThreatControlSpec {
  code: string;
  layer: 'PQC_VERIFIER' | 'SMART_CONTRACT' | 'BOTH';
  scenario: string;
  enforcement: string;
}

const ENFORCEMENT_MATRIX: ThreatControlSpec[] = [
  {
    code: 'INVALID_SIGNATURE',
    layer: 'PQC_VERIFIER',
    scenario: 'Invalid ML-DSA-65 signature or altered signed payment field',
    enforcement: 'Rejected off-chain; no EIP-712 attestation issued.',
  },
  {
    code: 'UNKNOWN_KEY / REVOKED_KEY',
    layer: 'PQC_VERIFIER',
    scenario: 'Unregistered or revoked agent public key',
    enforcement: 'Verifier fails closed against authoritative key registry.',
  },
  {
    code: 'REQUEST_EXPIRED',
    layer: 'BOTH',
    scenario: 'Stale signed payment request or expired attestation deadline',
    enforcement: 'Checked off-chain by verifier and enforced on-chain via block.timestamp.',
  },
  {
    code: 'RECIPIENT_NOT_ALLOWED',
    layer: 'BOTH',
    scenario: 'Payment targets an address outside the mandate allowlist',
    enforcement: 'Vault contract independently reverts regardless of verifier attestation.',
  },
  {
    code: 'PAYMENT_LIMIT_EXCEEDED',
    layer: 'BOTH',
    scenario: 'Single payment exceeds mandate per-transaction maximum',
    enforcement: 'Vault contract independently reverts before any ERC-20 transfer.',
  },
  {
    code: 'BUDGET_EXCEEDED',
    layer: 'BOTH',
    scenario: 'Cumulative payments exceed mandate aggregate budget',
    enforcement: 'Vault contract tracks on-chain spent accounting and reverts.',
  },
  {
    code: 'MANDATE_REVOKED / EXPIRED',
    layer: 'BOTH',
    scenario: 'Request submitted after owner revokes or mandate expires',
    enforcement: 'Vault contract reads live mandate state at execution time.',
  },
  {
    code: 'NONCE_ALREADY_USED',
    layer: 'BOTH',
    scenario: 'Replay attempt reusing a previously valid request or attestation',
    enforcement: 'Nonce / request digest permanently consumed on-chain.',
  },
];

export function SecurityPage() {
  const healthQuery = useVerifierHealth();
  const { verifierEvents, contractEvents } = useSecurityEvents();
  const health = healthQuery.data;
  const vEvents = verifierEvents.data;

  return (
    <div className="space-y-8">
      <SectionHeader
        index="06"
        eyebrow="Dual-Layer Cryptographic & Contract Defense"
        title="Security & PQC Monitoring"
        description="Audit cryptographic rejections from the off-chain ML-DSA-65 verification service separately from on-chain financial policy reverts enforced by the Vault smart contract."
        actions={
          <button
            type="button"
            onClick={() => {
              void healthQuery.refetch();
              void verifierEvents.refetch();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#141412] bg-white font-mono text-xs uppercase tracking-wider cursor-pointer hover:bg-[#ECEAE3]"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${healthQuery.isFetching || verifierEvents.isFetching ? 'animate-spin' : ''}`}
            />
            Refresh Telemetry
          </button>
        }
      />

      {/* Live PQC Verifier Status Banner */}
      <PqcDarkCard className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#B8F229]">
              <Cpu className="w-3.5 h-3.5" />
              Live PQC Verifier Liveness Probe (GET /v1/health)
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-2xl font-bold uppercase">
                {health?.status ?? (healthQuery.isLoading ? 'Checking…' : 'Unreachable')}
              </span>
              {health?.httpStatus ? (
                <ZoneBadge tone={health.status === 'healthy' ? 'pqc' : 'error'}>
                  HTTP {health.httpStatus}
                </ZoneBadge>
              ) : null}
              {health?.latencyMs !== undefined ? (
                <span className="font-mono text-xs text-[#9C9A91]">{health.latencyMs} ms</span>
              ) : null}
            </div>
            <p className="text-xs text-[#9C9A91]">
              {health?.message ??
                `Target endpoint: ${envConfig.pqcServiceBaseUrl ?? 'Not configured'}`}
            </p>
          </div>

          <div className="font-mono text-[11px] text-[#9C9A91] md:text-right space-y-1">
            <div>Last Checked: {health?.checkedAt ?? '—'}</div>
            <div>Fail-Closed Policy: Active</div>
          </div>
        </div>
      </PqcDarkCard>

      {/* Two-Column Separated Live Security Event Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-label="Off-chain PQC verifier security events" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#C81E3A]" />
              Layer 1 · PQC Verifier Rejections &amp; Key Audit
            </h2>
            <ZoneBadge tone="pqc">Off-Chain ML-DSA-65</ZoneBadge>
          </div>

          {vEvents?.status === 'unconfigured' ? (
            <UnavailableIntegrationCard
              title="Off-Chain Verification Audit Feed Unconfigured"
              reason={vEvents.reason}
              missing={vEvents.missing}
              owner={vEvents.owner}
            />
          ) : vEvents?.status === 'error' ? (
            <ErrorAlert
              title="Unable to Reach PQC Security Audit Feed"
              code={vEvents.code}
              message={vEvents.message}
            />
          ) : vEvents?.status === 'ready' ? (
            vEvents.data.length === 0 ? (
              <LedgerCard className="p-6 text-xs text-[#5F5E56]">
                Connected to <code>GET /v1/security/events</code>. Zero off-chain security events
                have been recorded yet.
              </LedgerCard>
            ) : (
              <LedgerCard className="divide-y divide-[#141412]/10">
                {vEvents.data.slice(0, 12).map((evt) => (
                  <div key={evt.id} className="p-4 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ZoneBadge
                        tone={
                          evt.severity === 'critical' || evt.severity === 'high'
                            ? 'error'
                            : evt.severity === 'medium'
                              ? 'warning'
                              : 'vault'
                        }
                      >
                        {evt.code}
                      </ZoneBadge>
                      <span className="font-mono text-[10px] text-[#5F5E56]">
                        {formatUtcTimestamp(evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-[#141412]">{evt.summary}</p>
                    {evt.agentId || evt.requestId ? (
                      <div className="font-mono text-[10px] text-[#5F5E56]">
                        {evt.agentId ? `Agent: ${truncateHex(evt.agentId, 8, 6)} ` : ''}
                        {evt.requestId ? `· Req: ${evt.requestId}` : ''}
                      </div>
                    ) : null}
                  </div>
                ))}
              </LedgerCard>
            )
          ) : null}
        </section>

        <section aria-label="On-chain smart contract security events" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2E4A00]" />
              Layer 2 · On-Chain Contract Enforcement
            </h2>
            <ZoneBadge tone="vault">Solidity Vault</ZoneBadge>
          </div>
          {contractEvents.data?.status === 'unconfigured' ? (
            <UnavailableIntegrationCard
              title="On-Chain Security Event Feed Pending"
              reason={contractEvents.data.reason}
              missing={contractEvents.data.missing}
              owner={contractEvents.data.owner}
            />
          ) : null}
        </section>
      </div>

      {/* Enforcement Architecture Reference Table */}
      <LedgerCard className="overflow-hidden">
        <div className="px-6 py-4 border-b border-[#141412]/15 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412]">
              Documented Threat &amp; Enforcement Separation Matrix
            </h2>
            <p className="text-xs text-[#5F5E56] mt-0.5">
              Source: <code>docs/API.md</code> &amp; <code>docs/SECURITY.md</code> §4 (reference
              specification, not live event counts)
            </p>
          </div>
          <ZoneBadge tone="bridge">Defense in Depth</ZoneBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#141412]/15 bg-[#F7F5F0] font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                <th className="py-3 px-6">Error Code</th>
                <th className="py-3 px-4">Enforcing Layer</th>
                <th className="py-3 px-4">Attack / Failure Scenario</th>
                <th className="py-3 px-6">Required Mitigation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141412]/10 text-xs">
              {ENFORCEMENT_MATRIX.map((row) => (
                <tr key={row.code} className="hover:bg-[#F7F5F0]/60">
                  <td className="py-3.5 px-6 font-mono font-medium text-[#C81E3A] whitespace-nowrap">
                    {row.code}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <ZoneBadge
                      tone={
                        row.layer === 'PQC_VERIFIER'
                          ? 'pqc'
                          : row.layer === 'SMART_CONTRACT'
                            ? 'vault'
                            : 'bridge'
                      }
                    >
                      {row.layer === 'BOTH' ? 'Verifier + Contract' : row.layer.replace('_', ' ')}
                    </ZoneBadge>
                  </td>
                  <td className="py-3.5 px-4 text-[#141412]">{row.scenario}</td>
                  <td className="py-3.5 px-6 text-[#5F5E56]">{row.enforcement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LedgerCard>

      <TrustModelNotice />
    </div>
  );
}
