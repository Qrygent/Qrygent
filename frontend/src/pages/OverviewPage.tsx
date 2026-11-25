import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, CircleDashed, KeyRound, ShieldCheck, Vault } from 'lucide-react';
import { envConfig } from '../config/env';
import { formatBaseUnits } from '../domain/units';
import {
  useAgents,
  useMandates,
  usePayments,
  useSecurityEvents,
  useVaultSummary,
  useVerifierHealth,
  useWalletNetwork,
} from '../hooks/useQrygentData';
import {
  DualStageAuthPipeline,
  IDLE_PIPELINE_STATE,
} from '../components/pqc/DualStageAuthPipeline';
import {
  LedgerCard,
  PqcDarkCard,
  SectionHeader,
  TestnetAssetBadge,
  TrustModelNotice,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

export function OverviewPage() {
  const wallet = useWalletNetwork();
  const healthQuery = useVerifierHealth();
  const vaultQuery = useVaultSummary();
  const agentsQuery = useAgents();
  const mandatesQuery = useMandates();
  const paymentsQuery = usePayments();
  const { verifierEvents, contractEvents } = useSecurityEvents();

  const vault = vaultQuery.data;
  const health = healthQuery.data;

  const pipelineState = {
    ...IDLE_PIPELINE_STATE,
    stage3VerifierSig:
      health?.status === 'healthy'
        ? ('idle' as const)
        : health?.status === 'unreachable'
          ? ('rejected' as const)
          : ('unavailable' as const),
    stage4FreshnessMandate:
      health?.status === 'healthy' ? ('idle' as const) : ('unavailable' as const),
    stage5Eip712Attestation:
      health?.status === 'healthy' ? ('idle' as const) : ('unavailable' as const),
    summaryNote:
      health?.status === 'healthy'
        ? 'Verifier Online · Vault ABI Pending'
        : 'Awaiting Live Verifier & Vault Contract',
  };

  const readinessItems = [
    {
      label: 'EVM Wallet (Injected)',
      ready: wallet.isConnected,
      detail: wallet.isConnected
        ? wallet.isWrongChain
          ? `Connected on wrong chain (${wallet.activeChainId})`
          : 'Connected'
        : 'Ready to connect',
    },
    {
      label: 'Target Testnet RPC',
      ready: envConfig.capabilities.hasChainConfig,
      detail: envConfig.capabilities.hasChainConfig
        ? `Chain ${envConfig.chainId}`
        : 'Missing VITE_CHAIN_ID / VITE_RPC_URL',
    },
    {
      label: 'Vault Smart Contract',
      ready: false,
      detail: envConfig.vaultAddress
        ? 'Address set · ABI pending handoff'
        : 'Missing VITE_VAULT_ADDRESS & ABI',
    },
    {
      label: 'PQC Verifier Service',
      ready: health?.status === 'healthy',
      detail:
        health?.status === 'healthy'
          ? `Online (${health.latencyMs ?? 0}ms)`
          : health?.status === 'unconfigured'
            ? 'Missing VITE_PQC_SERVICE_BASE_URL'
            : 'Offline / Unreachable',
    },
  ];

  return (
    <div className="space-y-8">
      <SectionHeader
        index="01"
        eyebrow="Control & Observability Surface"
        title="Vault & Authorization Overview"
        description="Real-time status of vault liquidity, registered ML-DSA-65 agent identities, on-chain payment mandates, and dual-stage authorization telemetry."
        actions={
          <>
            <Link
              to="/payments"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-[#141412] bg-white text-xs font-mono uppercase tracking-wider text-[#141412] hover:bg-[#ECEAE3] transition-colors"
            >
              Inspect Authorization
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/mandates"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0D0E0D] text-[#B8F229] text-xs font-mono uppercase tracking-wider hover:bg-[#1a1c19] transition-colors"
            >
              + Draft Mandate
            </Link>
          </>
        }
      />

      {/* Sculptural Hero Ledger Strip */}
      <section
        aria-label="Vault financial summary"
        className="grid grid-cols-1 lg:grid-cols-12 gap-4"
      >
        <LedgerCard className="lg:col-span-7 p-6 flex flex-col justify-between gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5F5E56]">
              Total Vault Balance · On-Chain Test Token
            </span>
            <TestnetAssetBadge />
          </div>

          {vault?.status === 'ready' ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-4xl sm:text-5xl font-light tracking-tight text-[#141412] tabular-nums">
                  {formatBaseUnits(vault.data.totalBalance, vault.data.tokenDecimals)}
                </span>
                <span className="font-mono text-xs uppercase px-2 py-0.5 bg-[#141412] text-[#F7F5F0]">
                  {vault.data.tokenSymbol}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#141412]/10 font-mono text-xs">
                <div>
                  <div className="text-[10px] uppercase text-[#5F5E56]">Available</div>
                  <div className="font-semibold mt-1">
                    {formatBaseUnits(vault.data.availableBudget, vault.data.tokenDecimals)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#5F5E56]">Committed</div>
                  <div className="font-semibold mt-1">
                    {formatBaseUnits(vault.data.committedBudget, vault.data.tokenDecimals)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#5F5E56]">Total Spent</div>
                  <div className="font-semibold mt-1">
                    {formatBaseUnits(vault.data.totalSpent, vault.data.tokenDecimals)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-5xl font-light tracking-tight text-[#141412]/35">
                  —
                </span>
                <ZoneBadge tone="warning">Vault Contract Unconfigured</ZoneBadge>
              </div>
              <p className="text-xs text-[#5F5E56] leading-relaxed max-w-xl">
                No balance is fabricated before the Vault smart contract is deployed and its ABI is
                supplied. Connect your wallet and configure verified testnet addresses in{' '}
                <Link to="/settings" className="underline text-[#141412] font-medium">
                  Settings
                </Link>
                .
              </p>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#141412]/10 font-mono text-xs text-[#5F5E56]">
                <div>
                  <div className="text-[10px] uppercase">Available Budget</div>
                  <div className="mt-1">—</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase">Committed</div>
                  <div className="mt-1">—</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase">Total Spent</div>
                  <div className="mt-1">—</div>
                </div>
              </div>
            </div>
          )}
        </LedgerCard>

        {/* Live Integration Readiness Spine Card */}
        <PqcDarkCard className="lg:col-span-5 p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#262924]">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#B8F229]">
              Live Integration Readiness
            </span>
            <Link
              to="/settings"
              className="font-mono text-[10px] uppercase text-[#9C9A91] hover:text-[#F4F1EA] underline"
            >
              Diagnostics
            </Link>
          </div>

          <ul className="divide-y divide-[#262924]">
            {readinessItems.map((item) => (
              <li key={item.label} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.ready ? (
                    <CheckCircle2 className="w-4 h-4 text-[#B8F229] shrink-0" />
                  ) : (
                    <CircleDashed className="w-4 h-4 text-[#9C9A91] shrink-0" />
                  )}
                  <span className="text-xs font-medium text-[#F4F1EA] truncate">{item.label}</span>
                </div>
                <span className="font-mono text-[10px] text-[#9C9A91] text-right shrink-0">
                  {item.detail}
                </span>
              </li>
            ))}
          </ul>

          <div className="pt-2 border-t border-[#262924] font-mono text-[10px] text-[#9C9A91] flex items-center justify-between">
            <span>ZERO SILENT MOCKING ENFORCED</span>
            <span className="text-[#B8F229]">FAIL-CLOSED</span>
          </div>
        </PqcDarkCard>
      </section>

      {/* Secondary Metrics Row */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Platform counters">
        <LedgerCard className="p-5 space-y-2">
          <div className="flex items-center justify-between text-[#5F5E56]">
            <span className="font-mono text-[10px] uppercase tracking-wider">Registered Agents</span>
            <KeyRound className="w-4 h-4" />
          </div>
          <div className="font-mono text-2xl font-semibold text-[#141412]">
            {agentsQuery.data?.status === 'ready' ? agentsQuery.data.data.length : '—'}
          </div>
          <p className="text-[11px] text-[#5F5E56]">
            {agentsQuery.data?.status === 'ready'
              ? 'Bound to ML-DSA-65 public keys'
              : 'Registry source pending Milestone 0'}
          </p>
        </LedgerCard>

        <LedgerCard className="p-5 space-y-2">
          <div className="flex items-center justify-between text-[#5F5E56]">
            <span className="font-mono text-[10px] uppercase tracking-wider">Active Mandates</span>
            <Vault className="w-4 h-4" />
          </div>
          <div className="font-mono text-2xl font-semibold text-[#141412]">
            {mandatesQuery.data?.status === 'ready' ? mandatesQuery.data.data.length : '—'}
          </div>
          <p className="text-[11px] text-[#5F5E56]">
            {mandatesQuery.data?.status === 'ready'
              ? 'Enforced independently on-chain'
              : 'Vault ABI required for mandate reads'}
          </p>
        </LedgerCard>

        <LedgerCard className="p-5 space-y-2">
          <div className="flex items-center justify-between text-[#5F5E56]">
            <span className="font-mono text-[10px] uppercase tracking-wider">
              Authorization Service
            </span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="font-mono text-2xl font-semibold text-[#141412] uppercase">
            {health?.status ?? 'Checking'}
          </div>
          <p className="text-[11px] text-[#5F5E56] truncate">
            {health?.message ??
              (health?.status === 'healthy'
                ? `HTTP ${health.httpStatus} · ${health.latencyMs}ms`
                : 'Probing /v1/health')}
          </p>
        </LedgerCard>
      </section>

      {/* Dual-Zone Authorization Pipeline */}
      <DualStageAuthPipeline state={pipelineState} />

      {/* Recent Payments & Security Split */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold">
              Recent Payments
            </h2>
            <Link to="/payments" className="font-mono text-[11px] underline text-[#5F5E56]">
              Open Payment Activity
            </Link>
          </div>
          {paymentsQuery.data?.status === 'unconfigured' ? (
            <UnavailableIntegrationCard
              compact
              title="On-Chain Payment History Pending"
              reason={paymentsQuery.data.reason}
              missing={paymentsQuery.data.missing}
              owner={paymentsQuery.data.owner}
            />
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold">
              Recent Security Events
            </h2>
            <Link to="/security" className="font-mono text-[11px] underline text-[#5F5E56]">
              Open Security Monitor
            </Link>
          </div>
          {verifierEvents.data?.status === 'unconfigured' ||
          contractEvents.data?.status === 'unconfigured' ? (
            <UnavailableIntegrationCard
              compact
              title="Security Event Feeds Not Yet Connected"
              reason="Qrygent separates off-chain PQC verifier rejections from on-chain smart contract reverts. Connect the verifier audit endpoint and Vault event ABI to stream live security events."
              missing={[
                'PQC verifier audit log endpoint (docs/API.md)',
                'Vault contract events ABI (contracts/)',
              ]}
              owner="Shared (Product/PQC + Smart Contract Lead)"
            />
          ) : null}
        </div>
      </section>

      <TrustModelNotice />
    </div>
  );
}
