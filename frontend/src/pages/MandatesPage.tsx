import { useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { envConfig } from '../config/env';
import { formatBaseUnits, formatCountdown, parseDecimalToBaseUnits, truncateHex } from '../domain/units';
import type { MandateRecord } from '../domain/types';
import { useAgents, useMandates } from '../hooks/useQrygentData';
import { VAULT_CONTRACT_INTEGRATION } from '../services/contracts/vaultInterface';
import {
  ErrorAlert,
  LedgerCard,
  SectionHeader,
  UnavailableIntegrationCard,
  ZoneBadge,
} from '../components/primitives/AtelierPrimitives';

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function MandateBudgetRuler({ mandate }: { mandate: MandateRecord }) {
  const remaining =
    mandate.aggregateBudget > mandate.spentAmount
      ? mandate.aggregateBudget - mandate.spentAmount
      : 0n;
  const spentPct =
    mandate.aggregateBudget > 0n
      ? Number((mandate.spentAmount * 10000n) / mandate.aggregateBudget) / 100
      : 0;
  const capPct =
    mandate.aggregateBudget > 0n
      ? Math.min(100, Number((mandate.maxPerPayment * 10000n) / mandate.aggregateBudget) / 100)
      : 0;

  return (
    <div className="space-y-2">
      <div className="h-3 w-full bg-[#ECEAE3] border border-[#141412]/20 relative overflow-hidden">
        <div
          className="h-full bg-[#141412] transition-all"
          style={{ width: `${Math.min(100, spentPct)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 border-l-2 border-dashed border-[#2B59C3]"
          style={{ left: `${capPct}%` }}
          title={`Per-payment cap (${capPct.toFixed(1)}% of aggregate budget)`}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 font-mono text-[11px] text-[#5F5E56]">
        <span>
          Spent: {formatBaseUnits(mandate.spentAmount, mandate.tokenDecimals)}{' '}
          {mandate.tokenSymbol} ({spentPct.toFixed(1)}%)
        </span>
        <span>
          Remaining: {formatBaseUnits(remaining, mandate.tokenDecimals)} /{' '}
          {formatBaseUnits(mandate.aggregateBudget, mandate.tokenDecimals)} {mandate.tokenSymbol}
        </span>
        <span>{formatCountdown(mandate.expiry)}</span>
      </div>
    </div>
  );
}

export interface MandateDraftValidation {
  agentId: string;
  recipients: string[];
  maxPerPaymentBase: bigint;
  aggregateBudgetBase: bigint;
  expiryUnix: number;
}

export function MandatesPage() {
  const mandatesQuery = useMandates();
  const agentsQuery = useAgents();
  const registeredAgents =
    agentsQuery.data?.status === 'ready'
      ? agentsQuery.data.data.filter((a) => a.keyStatus === 'active')
      : [];

  const [agentId, setAgentId] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [maxPerTx, setMaxPerTx] = useState('');
  const [aggregateBudget, setAggregateBudget] = useState('');
  const [expiryDateTime, setExpiryDateTime] = useState('');
  const [decimalsInput, setDecimalsInput] = useState('6');
  const [errors, setErrors] = useState<string[]>([]);
  const [validatedDraft, setValidatedDraft] = useState<MandateDraftValidation | null>(null);

  const handleAddRecipient = () => {
    const trimmed = recipientInput.trim();
    if (!isAddress(trimmed)) {
      setErrors(['Recipient must be a valid 0x-prefixed EVM address.']);
      return;
    }
    if (recipients.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      setErrors(['Recipient address is already in the allowlist.']);
      return;
    }
    setErrors([]);
    setRecipients((prev) => [...prev, trimmed]);
    setRecipientInput('');
  };

  const handleRemoveRecipient = (addr: string) => {
    setRecipients((prev) => prev.filter((r) => r !== addr));
  };

  const handleValidateMandate = (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: string[] = [];
    setValidatedDraft(null);

    if (!BYTES32_RE.test(agentId.trim())) {
      nextErrors.push('Agent ID must be a valid bytes32 hex identifier (0x + 64 hex chars).');
    }

    if (recipients.length === 0) {
      nextErrors.push('At least one approved recipient address is required.');
    }

    const decimals = Number.parseInt(decimalsInput, 10);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      nextErrors.push('Token decimals must be an integer between 0 and 18.');
    }

    let maxBase = 0n;
    let budgetBase = 0n;
    try {
      maxBase = parseDecimalToBaseUnits(maxPerTx, Number.isInteger(decimals) ? decimals : 6);
      if (maxBase <= 0n) nextErrors.push('Maximum payment per transaction must be greater than 0.');
    } catch (err) {
      nextErrors.push(
        `Per-payment cap: ${err instanceof Error ? err.message : 'Invalid decimal amount.'}`,
      );
    }

    try {
      budgetBase = parseDecimalToBaseUnits(
        aggregateBudget,
        Number.isInteger(decimals) ? decimals : 6,
      );
      if (budgetBase <= 0n) nextErrors.push('Aggregate spending budget must be greater than 0.');
    } catch (err) {
      nextErrors.push(
        `Aggregate budget: ${err instanceof Error ? err.message : 'Invalid decimal amount.'}`,
      );
    }

    if (maxBase > 0n && budgetBase > 0n && maxBase > budgetBase) {
      nextErrors.push('Maximum amount per payment cannot exceed the aggregate spending budget.');
    }

    const parsedDate = Date.parse(expiryDateTime);
    const expiryUnix = Number.isNaN(parsedDate) ? 0 : Math.floor(parsedDate / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    if (!expiryUnix || expiryUnix <= nowUnix) {
      nextErrors.push('Mandate expiry timestamp must be strictly in the future.');
    }

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors([]);
    setValidatedDraft({
      agentId: agentId.trim(),
      recipients,
      maxPerPaymentBase: maxBase,
      aggregateBudgetBase: budgetBase,
      expiryUnix,
    });
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        index="04"
        eyebrow="On-Chain Financial Permissions"
        title="Mandate Management"
        description="Define strict, contract-enforced spending envelopes: approved recipient allowlists, per-payment caps, aggregate budgets, and explicit expiry/revocation."
        actions={
          <ZoneBadge tone={VAULT_CONTRACT_INTEGRATION.abiReady ? 'vault' : 'warning'}>
            {VAULT_CONTRACT_INTEGRATION.abiReady
              ? 'Vault Contract Ready'
              : 'Contract ABI Pending Handoff'}
          </ZoneBadge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Create Mandate Policy Composer */}
        <LedgerCard className="lg:col-span-6 p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#141412]/10 pb-3">
            <h2 className="font-mono text-xs uppercase tracking-wider font-semibold text-[#141412]">
              Create Payment Mandate
            </h2>
            <span className="font-mono text-[10px] text-[#5F5E56]">Integer Base Units Only</span>
          </div>

          <form onSubmit={handleValidateMandate} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="mandate-agent-id"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]"
              >
                Authorized Agent ID (bytes32)
              </label>
              {registeredAgents.length > 0 ? (
                <select
                  aria-label="Select registered agent"
                  value={registeredAgents.some((a) => a.agentId === agentId) ? agentId : ''}
                  onChange={(e) => {
                    if (e.target.value) setAgentId(e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-[#141412]/25 bg-[#F7F5F0] font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
                >
                  <option value="">Choose a live registered ML-DSA-65 agent…</option>
                  {registeredAgents.map((a) => (
                    <option key={a.agentId} value={a.agentId}>
                      {a.label} ({truncateHex(a.agentId, 8, 6)})
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                id="mandate-agent-id"
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
              />
            </div>

            {/* Approved Recipient Allowlist */}
            <div className="space-y-2">
              <label
                htmlFor="mandate-recipient"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]"
              >
                Approved Recipients Allowlist
              </label>
              <div className="flex gap-2">
                <input
                  id="mandate-recipient"
                  type="text"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="0xRecipientAddress..."
                  className="flex-1 px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
                />
                <button
                  type="button"
                  onClick={handleAddRecipient}
                  className="px-3 py-2 border border-[#141412] bg-[#F7F5F0] font-mono text-xs uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer hover:bg-[#ECEAE3]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
              {recipients.length > 0 ? (
                <ul className="space-y-1.5">
                  {recipients.map((addr) => (
                    <li
                      key={addr}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#F7F5F0] border border-[#141412]/15 font-mono text-[11px]"
                    >
                      <span className="truncate">{addr}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(addr)}
                        aria-label={`Remove recipient ${addr}`}
                        className="text-[#C81E3A] hover:opacity-75 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-[#5F5E56]">
                  Payments to any address outside this allowlist will revert on-chain.
                </p>
              )}
            </div>

            {/* Spending Caps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="mandate-max-tx"
                  className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
                >
                  Max / Payment
                </label>
                <input
                  id="mandate-max-tx"
                  type="text"
                  inputMode="decimal"
                  value={maxPerTx}
                  onChange={(e) => setMaxPerTx(e.target.value)}
                  placeholder="250"
                  className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
                />
              </div>
              <div>
                <label
                  htmlFor="mandate-budget"
                  className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
                >
                  Aggregate Budget
                </label>
                <input
                  id="mandate-budget"
                  type="text"
                  inputMode="decimal"
                  value={aggregateBudget}
                  onChange={(e) => setAggregateBudget(e.target.value)}
                  placeholder="3000"
                  className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
                />
              </div>
              <div>
                <label
                  htmlFor="mandate-decimals"
                  className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
                >
                  Token Decimals
                </label>
                <input
                  id="mandate-decimals"
                  type="number"
                  min={0}
                  max={18}
                  value={decimalsInput}
                  onChange={(e) => setDecimalsInput(e.target.value)}
                  className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="mandate-expiry"
                className="block font-mono text-[10px] uppercase tracking-wider text-[#5F5E56] mb-1"
              >
                Expiry Date &amp; Time (Local)
              </label>
              <input
                id="mandate-expiry"
                type="datetime-local"
                value={expiryDateTime}
                onChange={(e) => setExpiryDateTime(e.target.value)}
                className="w-full px-3 py-2 border border-[#141412]/25 bg-white font-mono text-xs focus:outline-none focus:border-[#2B59C3]"
              />
            </div>

            {errors.length > 0 ? (
              <ErrorAlert
                title="Mandate Policy Validation Failed"
                message={errors.join(' ')}
              />
            ) : null}

            {validatedDraft ? (
              <div
                role="status"
                className="p-3.5 bg-[#0D0E0D] text-[#F4F1EA] font-mono text-[11px] space-y-1.5 rounded-[2px]"
              >
                <div className="text-[#B8F229] uppercase text-[10px]">
                  Policy Validated Locally · Ready for Contract ABI
                </div>
                <div>maxPerPayment (uint256): {validatedDraft.maxPerPaymentBase.toString()}</div>
                <div>aggregateBudget (uint256): {validatedDraft.aggregateBudgetBase.toString()}</div>
                <div>expiry (unix): {validatedDraft.expiryUnix}</div>
                <div>recipients: {validatedDraft.recipients.length} allowlisted</div>
                <div className="text-[#9C9A91] pt-1 border-t border-[#262924]">
                  On-chain submission is disabled until{' '}
                  {envConfig.vaultAddress ? 'the frozen Vault ABI' : 'VITE_VAULT_ADDRESS & ABI'} is
                  provided.
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-[#0D0E0D] text-[#B8F229] font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-[#1a1c19]"
            >
              <Lock className="w-3.5 h-3.5" />
              Validate Mandate Policy
            </button>
          </form>
        </LedgerCard>

        {/* Active On-Chain Mandates List */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#141412] font-semibold">
              Active &amp; Revoked Mandates
            </h2>
            <span className="font-mono text-[11px] text-[#5F5E56]">Source: Vault Smart Contract</span>
          </div>

          {mandatesQuery.data?.status === 'unconfigured' ? (
            <UnavailableIntegrationCard
              title="On-Chain Mandates Cannot Be Loaded Yet"
              reason={mandatesQuery.data.reason}
              missing={mandatesQuery.data.missing}
              owner={mandatesQuery.data.owner}
            />
          ) : null}

          <LedgerCard className="p-5 space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#5F5E56]">
              Smart Contract Enforcement Guarantees (docs/PRD.md §FR-07)
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#141412]">
              <li className="p-2.5 bg-[#F7F5F0] border border-[#141412]/10">
                ✓ Independent recipient allowlist verification
              </li>
              <li className="p-2.5 bg-[#F7F5F0] border border-[#141412]/10">
                ✓ Per-payment maximum cap enforcement
              </li>
              <li className="p-2.5 bg-[#F7F5F0] border border-[#141412]/10">
                ✓ Aggregate remaining budget accounting
              </li>
              <li className="p-2.5 bg-[#F7F5F0] border border-[#141412]/10">
                ✓ Immediate on-chain expiry &amp; revocation
              </li>
            </ul>
          </LedgerCard>
        </div>
      </div>
    </div>
  );
}
