import { CheckCircle2, ExternalLink, RefreshCw, Shield, XCircle } from 'lucide-react';
import { envConfig } from '../config/env';
import { buildExplorerAddressUrl } from '../config/chain';
import { useVerifierHealth, useWalletNetwork } from '../hooks/useQrygentData';
import {
  LedgerCard,
  SectionHeader,
  TrustModelNotice,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

export function SettingsPage() {
  const wallet = useWalletNetwork();
  const healthQuery = useVerifierHealth();

  return (
    <div className="space-y-8">
      <SectionHeader
        index="08"
        eyebrow="Wallet & Environment Diagnostics"
        title="Settings & Configuration"
        description="Inspect validated public frontend environment variables, manage EVM wallet connectivity, and verify live service connectivity."
      />

      {/* Wallet & Network Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <LedgerCard className="lg:col-span-6 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#141412]/10">
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412]">
              EVM Wallet &amp; Chain Status
            </h2>
            <ZoneBadge tone={wallet.isConnected ? 'vault' : 'neutral'}>
              {wallet.isConnected ? 'Connected' : 'Disconnected'}
            </ZoneBadge>
          </div>

          <dl className="divide-y divide-[#141412]/10 font-mono text-xs">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#5F5E56]">Connected Account</dt>
              <dd className="text-[#141412] break-all text-right">
                {wallet.address ?? 'Not connected'}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#5F5E56]">Active Wallet Chain ID</dt>
              <dd className="text-[#141412]">
                {wallet.activeChainId !== null ? wallet.activeChainId : '—'}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#5F5E56]">Configured Target Chain ID</dt>
              <dd className="text-[#141412]">{envConfig.chainId ?? 'Unconfigured'}</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#5F5E56]">Available Connectors</dt>
              <dd className="text-[#141412]">
                {wallet.connectors.map((c) => c.name).join(', ') || 'None detected'}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 pt-2">
            {wallet.isConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => wallet.disconnect()}
                  className="px-4 py-2 border border-[#141412] font-mono text-xs uppercase tracking-wider cursor-pointer hover:bg-[#ECEAE3]"
                >
                  Disconnect Wallet
                </button>
                {wallet.isWrongChain && wallet.targetChainId ? (
                  <button
                    type="button"
                    onClick={() => wallet.switchChain({ chainId: wallet.targetChainId! })}
                    className="px-4 py-2 bg-[#C81E3A] text-white font-mono text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Switch to Chain {wallet.targetChainId}
                  </button>
                ) : null}
              </>
            ) : (
              wallet.connectors.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  onClick={() => wallet.connect({ connector })}
                  disabled={wallet.isConnecting}
                  className="px-4 py-2 bg-[#0D0E0D] text-[#B8F229] font-mono text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  Connect {connector.name}
                </button>
              ))
            )}
          </div>
        </LedgerCard>

        {/* PQC Verifier Connection Test */}
        <LedgerCard className="lg:col-span-6 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#141412]/10">
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412]">
              PQC Verifier Connectivity
            </h2>
            <button
              type="button"
              onClick={() => healthQuery.refetch()}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase underline text-[#141412] cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 ${healthQuery.isFetching ? 'animate-spin' : ''}`}
              />
              Test /v1/health
            </button>
          </div>

          <dl className="divide-y divide-[#141412]/10 font-mono text-xs">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#5F5E56]">Configured Base URL</dt>
              <dd className="text-[#141412] break-all text-right">
                {envConfig.pqcServiceBaseUrl ?? 'Unset'}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#5F5E56]">Live Status</dt>
              <dd className="uppercase font-semibold text-[#141412]">
                {healthQuery.data?.status ?? 'Checking'}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#5F5E56]">Roundtrip Latency</dt>
              <dd className="text-[#141412]">
                {healthQuery.data?.latencyMs !== undefined
                  ? `${healthQuery.data.latencyMs} ms`
                  : '—'}
              </dd>
            </div>
          </dl>

          {healthQuery.data?.message ? (
            <p className="p-3 bg-[#F7F5F0] border border-[#141412]/15 text-xs text-[#5F5E56]">
              {healthQuery.data.message}
            </p>
          ) : null}
        </LedgerCard>
      </div>

      {/* Startup Environment Validation Table */}
      <LedgerCard className="overflow-hidden">
        <div className="px-6 py-4 border-b border-[#141412]/15 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412]">
              Public Environment Variable Diagnostics (Startup Validated)
            </h2>
            <p className="text-xs text-[#5F5E56] mt-0.5">
              Only public <code>VITE_*</code> configuration is read by the browser. Private keys and
              verifier signing secrets are strictly prohibited here.
            </p>
          </div>
          <ZoneBadge tone={envConfig.hasErrors ? 'error' : 'neutral'}>
            {envConfig.hasErrors ? 'Validation Errors Found' : 'Schema Valid'}
          </ZoneBadge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#141412]/15 bg-[#F7F5F0] font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                <th className="py-3 px-6">Variable</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Value / Validation</th>
                <th className="py-3 px-4">Purpose</th>
                <th className="py-3 px-6">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141412]/10 text-xs">
              {envConfig.diagnostics.map((row) => {
                const isAddr =
                  (row.key === 'VITE_VAULT_ADDRESS' || row.key === 'VITE_TOKEN_ADDRESS') &&
                  row.valuePreview;
                const expUrl = isAddr ? buildExplorerAddressUrl(row.valuePreview!) : null;
                return (
                  <tr key={row.key}>
                    <td className="py-3.5 px-6 font-mono font-medium text-[#141412] whitespace-nowrap">
                      {row.key}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {row.status === 'configured' ? (
                        <ZoneBadge tone="vault">
                          <CheckCircle2 className="w-3 h-3" /> Configured
                        </ZoneBadge>
                      ) : row.status === 'invalid' ? (
                        <ZoneBadge tone="error">
                          <XCircle className="w-3 h-3" /> Invalid
                        </ZoneBadge>
                      ) : row.status === 'optional_unset' ? (
                        <ZoneBadge tone="neutral">Optional</ZoneBadge>
                      ) : (
                        <ZoneBadge tone="warning">Missing</ZoneBadge>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#141412]">
                      {row.error ? (
                        <span className="text-[#C81E3A]">{row.error}</span>
                      ) : row.valuePreview ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="break-all">{row.valuePreview}</span>
                          {expUrl ? (
                            <a
                              href={expUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#2B59C3]"
                              aria-label={`View ${row.key} on explorer`}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-[#5F5E56]">Not set</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-[#5F5E56]">{row.requiredFor}</td>
                    <td className="py-3.5 px-6 text-[#5F5E56] whitespace-nowrap">{row.owner}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </LedgerCard>

      <div className="p-4 bg-[#0D0E0D] text-[#F4F1EA] border border-[#262924] rounded-[2px] flex items-start gap-3 text-xs">
        <Shield className="w-4 h-4 text-[#B8F229] shrink-0 mt-0.5" />
        <p className="text-[#9C9A91] leading-relaxed">
          <strong className="text-[#F4F1EA]">Frontend Security Boundary Reminder:</strong> Do not
          place private keys, verifier ECDSA signing keys, seed phrases, or secret API tokens into{' '}
          <code>.env.local</code> under <code>VITE_*</code> prefixes. Every variable exposed to Vite
          is public in the compiled browser bundle.
        </p>
      </div>

      <TrustModelNotice />
    </div>
  );
}
