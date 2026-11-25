import { useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Lock } from 'lucide-react';
import { envConfig } from '../config/env';
import { buildExplorerAddressUrl } from '../config/chain';
import { formatBaseUnits, parseDecimalToBaseUnits, truncateHex } from '../domain/units';
import { useVaultSummary, useWalletNetwork } from '../hooks/useQrygentData';
import { VAULT_CONTRACT_INTEGRATION } from '../services/contracts/vaultInterface';
import {
  ErrorAlert,
  LedgerCard,
  SectionHeader,
  TestnetAssetBadge,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

export function VaultPage() {
  const wallet = useWalletNetwork();
  const vaultQuery = useVaultSummary();

  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amountInput, setAmountInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [parsedBaseUnits, setParsedBaseUnits] = useState<bigint | null>(null);

  const verifiedDecimals = wallet.tokenBalance.decimals ?? null;
  const tokenSymbol = wallet.tokenBalance.symbol ?? 'TEST TOKEN';

  const canExecuteOnChain = Boolean(
    wallet.isConnected &&
      wallet.isSupportedChain &&
      envConfig.capabilities.hasVaultConfig &&
      envConfig.capabilities.hasTokenConfig &&
      VAULT_CONTRACT_INTEGRATION.abiReady,
  );

  const handleAmountChange = (value: string) => {
    setAmountInput(value);
    setValidationError(null);
    setParsedBaseUnits(null);

    if (!value.trim()) return;
    const decimalsForPreview = verifiedDecimals ?? 6;
    try {
      const units = parseDecimalToBaseUnits(value, decimalsForPreview);
      if (units <= 0n) {
        setValidationError('Amount must be greater than zero.');
      } else {
        setParsedBaseUnits(units);
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Invalid token amount.');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!amountInput.trim()) {
      setValidationError('Enter a token amount before submitting.');
      return;
    }
    if (!canExecuteOnChain) {
      setValidationError(
        'On-chain execution is blocked until wallet is connected on the verified testnet and the Vault contract ABI & addresses are configured.',
      );
    }
  };

  const tokenExplorerUrl = envConfig.tokenAddress
    ? buildExplorerAddressUrl(envConfig.tokenAddress)
    : null;
  const vaultExplorerUrl = envConfig.vaultAddress
    ? buildExplorerAddressUrl(envConfig.vaultAddress)
    : null;

  return (
    <div className="space-y-8">
      <SectionHeader
        index="02"
        eyebrow="Programmable Custody"
        title="Vault Management"
        description="Deposit supported testnet ERC-20 tokens into the Qrygent Vault, monitor available vs. mandate-committed liquidity, and execute owner-only withdrawals."
        actions={<TestnetAssetBadge />}
      />

      {/* Balance & Contract Context Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <LedgerCard className="lg:col-span-7 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#141412]/10">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#5F5E56]">
              Custody Balances (Base-Unit Accurate)
            </span>
            <ZoneBadge tone={wallet.isSupportedChain ? 'vault' : 'warning'}>
              {wallet.isSupportedChain
                ? `Verified Chain ${envConfig.chainId}`
                : wallet.isWrongChain
                  ? `Unsupported Chain ${wallet.activeChainId}`
                  : 'Chain Unconfigured / Disconnected'}
            </ZoneBadge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                Connected Wallet Token Balance
              </div>
              {wallet.tokenBalance.enabled &&
              wallet.tokenBalance.rawBalance !== undefined &&
              verifiedDecimals !== null ? (
                <>
                  <div className="font-mono text-3xl font-light text-[#141412]">
                    {formatBaseUnits(wallet.tokenBalance.rawBalance, verifiedDecimals)}{' '}
                    <span className="text-sm font-medium">{tokenSymbol}</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#5F5E56]">
                    Base units: {wallet.tokenBalance.rawBalance.toString()} ({verifiedDecimals}{' '}
                    decimals)
                  </div>
                </>
              ) : (
                <>
                  <div className="font-mono text-3xl font-light text-[#141412]/35">—</div>
                  <div className="text-xs text-[#5F5E56]">
                    {wallet.tokenBalance.error
                      ? `RPC read failed: ${wallet.tokenBalance.error.message}`
                      : 'Connect wallet on verified testnet with VITE_TOKEN_ADDRESS configured.'}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
                Vault Contract Balance
              </div>
              <div className="font-mono text-3xl font-light text-[#141412]/35">—</div>
              <div className="text-xs text-[#5F5E56]">
                Awaiting frozen Vault ABI &amp; deployed address.
              </div>
            </div>
          </div>

          {/* Contract Metadata Footer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-[#141412]/10 font-mono text-[11px]">
            <div className="p-3 bg-[#F7F5F0] border border-[#141412]/10">
              <div className="text-[10px] uppercase text-[#5F5E56]">Test Token Contract</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span>
                  {envConfig.tokenAddress ? truncateHex(envConfig.tokenAddress, 8, 6) : 'Not set'}
                </span>
                {tokenExplorerUrl ? (
                  <a
                    href={tokenExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#2B59C3] hover:underline"
                  >
                    Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            </div>

            <div className="p-3 bg-[#F7F5F0] border border-[#141412]/10">
              <div className="text-[10px] uppercase text-[#5F5E56]">Qrygent Vault Contract</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span>
                  {envConfig.vaultAddress ? truncateHex(envConfig.vaultAddress, 8, 6) : 'Not set'}
                </span>
                {vaultExplorerUrl ? (
                  <a
                    href={vaultExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#2B59C3] hover:underline"
                  >
                    Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </LedgerCard>

        {/* Deposit / Withdraw Action Panel */}
        <LedgerCard className="lg:col-span-5 p-6 space-y-5">
          <div className="grid grid-cols-2 border border-[#141412]/20 p-1 bg-[#F7F5F0]">
            <button
              type="button"
              onClick={() => setTab('deposit')}
              className={`py-2 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'deposit' ? 'bg-[#0D0E0D] text-[#B8F229]' : 'text-[#5F5E56]'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setTab('withdraw')}
              className={`py-2 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'withdraw' ? 'bg-[#0D0E0D] text-[#B8F229]' : 'text-[#5F5E56]'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Withdraw
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="vault-amount"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]"
              >
                {tab === 'deposit' ? 'Deposit Amount (Testnet Token)' : 'Owner Withdrawal Amount'}
              </label>
              <div className="flex border border-[#141412]/25 bg-white focus-within:border-[#2B59C3]">
                <input
                  id="vault-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-3 py-2.5 font-mono text-base bg-transparent focus:outline-none"
                />
                <span className="px-3 py-2.5 bg-[#ECEAE3] font-mono text-xs text-[#141412] border-l border-[#141412]/15 flex items-center">
                  {tokenSymbol}
                </span>
              </div>
              {parsedBaseUnits !== null ? (
                <div className="font-mono text-[11px] text-[#2E4A00]">
                  Encoded uint256 base units: {parsedBaseUnits.toString()}{' '}
                  {verifiedDecimals === null ? '(previewing 6 decimals until token verified)' : ''}
                </div>
              ) : null}
            </div>

            {validationError ? (
              <ErrorAlert title="Validation / Execution Blocked" message={validationError} />
            ) : null}

            <div className="p-3 bg-[#F7F5F0] border border-[#141412]/15 text-[11px] text-[#5F5E56] space-y-1">
              <div className="font-mono text-[10px] uppercase text-[#141412] font-semibold">
                {tab === 'deposit' ? 'Two-Step ERC-20 Deposit Flow' : 'Owner-Only Contract Rule'}
              </div>
              <p>
                {tab === 'deposit'
                  ? 'Requires ERC-20 approve(vault, amount) followed by vault.deposit(...) on the verified testnet.'
                  : 'Withdrawals are enforced on-chain as owner-only. The PQC verifier signer can never withdraw funds.'}
              </p>
            </div>

            <button
              type="submit"
              disabled={!canExecuteOnChain}
              className="w-full py-3 px-4 bg-[#0D0E0D] text-[#B8F229] font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              {canExecuteOnChain
                ? tab === 'deposit'
                  ? 'Approve & Deposit Test Tokens'
                  : 'Execute Owner Withdrawal'
                : 'Awaiting Vault ABI & Verified Testnet'}
            </button>
          </form>
        </LedgerCard>
      </div>

      {/* Vault Activity / Dependency Blocker */}
      {vaultQuery.data?.status === 'unconfigured' ? (
        <UnavailableIntegrationCard
          title="Vault Activity Ledger Pending Contract Handoff"
          reason={vaultQuery.data.reason}
          missing={vaultQuery.data.missing}
          owner={vaultQuery.data.owner}
        />
      ) : null}
    </div>
  );
}
