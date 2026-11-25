import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Cpu,
  FileCheck2,
  Gauge,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  Vault,
  Wallet,
  X,
} from 'lucide-react';
import { envConfig } from '../../config/env';
import { truncateHex } from '../../domain/units';
import { useVerifierHealth, useWalletNetwork } from '../../hooks/useQrygentData';
import { TestnetAssetBadge } from '../primitives/AtelierPrimitives';

interface NavItem {
  to: string;
  index: string;
  label: string;
  icon: typeof LayoutGrid;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', index: '01', label: 'Overview', icon: LayoutGrid },
  { to: '/vault', index: '02', label: 'Vault', icon: Vault },
  { to: '/agents', index: '03', label: 'Agents & ML-DSA', icon: KeyRound },
  { to: '/mandates', index: '04', label: 'Mandates', icon: FileCheck2 },
  { to: '/payments', index: '05', label: 'Payments', icon: Activity },
  { to: '/security', index: '06', label: 'Security', icon: ShieldCheck },
  { to: '/benchmarks', index: '07', label: 'Benchmarks', icon: Gauge },
  { to: '/settings', index: '08', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const wallet = useWalletNetwork();
  const healthQuery = useVerifierHealth();

  const currentNav =
    NAV_ITEMS.find((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
    ) ?? NAV_ITEMS[0]!;

  const health = healthQuery.data;
  const healthStatus = health?.status ?? (healthQuery.isLoading ? 'checking' : 'unreachable');

  const handleConnect = () => {
    const primary = wallet.connectors[0];
    if (primary) {
      wallet.connect({ connector: primary });
    }
  };

  const spineContent = (
    <div className="flex flex-col justify-between h-full gap-6 p-5 bg-[#0D0E0D] text-[#F4F1EA] bg-pqc-grid">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-start justify-between gap-2 pb-5 border-b border-[#262924]">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-xl font-extrabold tracking-tight text-[#F4F1EA]">
                QRYGENT
              </span>
              <span className="w-2 h-2 rounded-full bg-[#B8F229]" aria-hidden="true" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9C9A91] mt-1">
              PQC Payment Vault
            </p>
          </div>
          <button
            type="button"
            className="lg:hidden p-1.5 text-[#9C9A91] hover:text-[#F4F1EA]"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Primary navigation" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-3 py-2.5 text-xs font-mono transition-colors border-l-2 ${
                    isActive
                      ? 'bg-[#171A15] text-[#B8F229] border-[#B8F229]'
                      : 'text-[#A8A69E] border-transparent hover:text-[#F4F1EA] hover:bg-[#151714]'
                  }`
                }
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-3.5 h-3.5 opacity-80" aria-hidden="true" />
                  <span className="tracking-wide uppercase">{item.label}</span>
                </span>
                <span className="text-[10px] opacity-60">{item.index}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Cryptographic Telemetry Spine Footer */}
      <div className="space-y-3 pt-5 border-t border-[#262924]">
        {/* Verifier Liveness Card */}
        <div className="p-3 bg-[#151714] border border-[#262924] rounded-[2px] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#9C9A91] flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-[#B8F229]" aria-hidden="true" />
              PQC Verifier
            </span>
            <button
              type="button"
              onClick={() => healthQuery.refetch()}
              className="text-[#9C9A91] hover:text-[#F4F1EA] p-0.5 cursor-pointer"
              title="Re-check PQC verifier health"
              aria-label="Re-check PQC verifier health"
            >
              <RefreshCw
                className={`w-3 h-3 ${healthQuery.isFetching ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  healthStatus === 'healthy'
                    ? 'bg-[#B8F229]'
                    : healthStatus === 'unconfigured'
                      ? 'bg-[#B45309]'
                      : healthStatus === 'checking'
                        ? 'bg-[#2B59C3]'
                        : 'bg-[#C81E3A]'
                }`}
              />
              <span className="uppercase">{healthStatus}</span>
            </span>
            {health?.latencyMs !== undefined ? (
              <span className="text-[#9C9A91]">{health.latencyMs}ms</span>
            ) : (
              <span className="text-[#9C9A91]">ML-DSA-65</span>
            )}
          </div>
          <div className="font-mono text-[10px] text-[#7D7B73] truncate">
            {envConfig.pqcServiceBaseUrl ?? 'VITE_PQC_SERVICE_BASE_URL unset'}
          </div>
        </div>

        {/* Wallet Connection Module */}
        <div className="p-3 bg-[#151714] border border-[#262924] rounded-[2px] space-y-2.5">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[#9C9A91]">
            <span className="flex items-center gap-1.5">
              <Wallet className="w-3 h-3" aria-hidden="true" />
              Owner Wallet
            </span>
            <span>
              {wallet.activeChainId !== null ? `Chain ${wallet.activeChainId}` : 'No Chain'}
            </span>
          </div>

          {wallet.isConnected && wallet.address ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-[#F4F1EA]">
                  {truncateHex(wallet.address)}
                </span>
                <button
                  type="button"
                  onClick={() => wallet.disconnect()}
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-[#9C9A91] hover:text-[#F4F1EA] cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                  Disconnect
                </button>
              </div>
              {wallet.isWrongChain && wallet.targetChainId ? (
                <button
                  type="button"
                  onClick={() => wallet.switchChain({ chainId: wallet.targetChainId! })}
                  disabled={wallet.isSwitching}
                  className="w-full py-1.5 px-2.5 bg-[#C81E3A] text-white font-mono text-[10px] uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {wallet.isSwitching
                    ? 'Switching Chain…'
                    : `Switch to Chain ${wallet.targetChainId}`}
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={wallet.isConnecting || wallet.connectors.length === 0}
              className="w-full py-2 px-3 bg-[#B8F229] text-[#0D0E0D] font-mono text-[11px] font-semibold uppercase tracking-wider hover:bg-[#c8f752] transition-colors cursor-pointer disabled:opacity-50"
            >
              {wallet.isConnecting ? 'Connecting…' : 'Connect EVM Wallet'}
            </button>
          )}
          {wallet.connectError ? (
            <p className="text-[10px] text-[#f87171] leading-snug">
              {wallet.connectError.message}
            </p>
          ) : null}
        </div>

        {/* Hybrid Trust Boundary Caption */}
        <p className="text-[10px] leading-relaxed text-[#7D7B73]">
          <strong className="text-[#C8C6BC]">Trust Boundary:</strong> Off-chain ML-DSA-65
          verification · ECDSA EIP-712 attestation · Independent on-chain mandate enforcement.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F5F0] text-[#141412]">
      {/* Desktop Permanent Dark Cryptographic Spine */}
      <aside className="hidden lg:block w-[272px] shrink-0 sticky top-0 h-screen overflow-y-auto border-r border-[#262924]">
        {spineContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[280px] max-w-[85vw] h-full overflow-y-auto shadow-2xl">
            {spineContent}
          </div>
          <button
            type="button"
            aria-label="Close navigation backdrop"
            className="flex-1 bg-black/55"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      ) : null}

      {/* Main Warm Bone Financial Ledger Workspace */}
      <div className="flex-1 min-w-0 flex flex-col bg-atelier-grid">
        {/* Top Utility Strip */}
        <div className="sticky top-0 z-20 bg-[#F7F5F0]/95 backdrop-blur-sm border-b border-[#141412]/15 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 border border-[#141412]/20 bg-white text-[#141412]"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#5F5E56]">
              <span className="text-[#141412] font-semibold">Qrygent Vault</span>
              <span className="mx-2 opacity-40">/</span>
              <span>
                {currentNav.index} · {currentNav.label}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <TestnetAssetBadge />
            {!envConfig.capabilities.hasChainConfig ? (
              <span className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 border border-[#B45309]/40 bg-[#B45309]/10 text-[#B45309]">
                Target Chain Unconfigured
              </span>
            ) : wallet.isWrongChain ? (
              <span className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 border border-[#C81E3A]/40 bg-[#C81E3A]/10 text-[#C81E3A] inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Unsupported Chain ({wallet.activeChainId})
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 border border-[#2E4A00]/30 bg-[#2E4A00]/10 text-[#2E4A00]">
                Target Chain {envConfig.chainId}
              </span>
            )}
          </div>
        </div>

        {/* Unsupported Chain Hard Guard Banner */}
        {wallet.isWrongChain && wallet.targetChainId ? (
          <div
            role="alert"
            className="bg-[#C81E3A] text-white px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Connected wallet is on chain <strong>{wallet.activeChainId}</strong>. Deposits,
                mandates, and payment execution are blocked until you switch to verified target
                testnet chain <strong>{wallet.targetChainId}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => wallet.switchChain({ chainId: wallet.targetChainId! })}
              className="px-3 py-1 bg-white text-[#C81E3A] font-mono text-[10px] font-semibold uppercase tracking-wider cursor-pointer"
            >
              Switch Network
            </button>
          </div>
        ) : null}

        {/* Page Container */}
        <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8 py-8 space-y-8">
          {children}
        </main>
      </div>
    </div>
  );
}
