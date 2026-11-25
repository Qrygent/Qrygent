import { envConfig } from '../../config/env';
import type { MandateRecord, PaymentRecord, SecurityEvent, ServiceResult } from '../../domain/types';

/**
 * Documented Smart Contract integration boundary for Qrygent Vault.
 *
 * Per docs/ARCHITECTURE.md §5 & docs/WORKPLAN.md Milestone 0:
 * Exact Solidity function signatures, storage structs, events, custom errors, and
 * EIP-712 domain parameters must be frozen and handed off by the Smart Contract Lead
 * before contract read/write calls are enabled.
 *
 * NEVER invent ABI entries or simulate contract transactions here.
 */
export const VAULT_CONTRACT_INTEGRATION = {
  abiReady: false,
  abiStatus: 'PENDING_CONTRACT_HANDOFF' as const,
  expectedCapabilities: [
    'deposit(address token, uint256 amount) / deposit(uint256 amount)',
    'withdraw(address token, uint256 amount) / withdraw(uint256 amount)',
    'createMandate(...) / updateMandate(...) / revokeMandate(bytes32 mandateId)',
    'executePayment(PaymentRequest calldata request, Attestation calldata attestation)',
    'Events: Deposited, Withdrawn, MandateCreated, MandateRevoked, PaymentExecuted',
  ],
  owner: 'Smart Contract / Blockchain Lead',
};

export interface VaultSummaryData {
  totalBalance: bigint;
  totalSpent: bigint;
  committedBudget: bigint;
  availableBudget: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  activeMandateCount: number;
  verifierSigner?: string;
}

export function getVaultContractBlocker(): {
  reason: string;
  missing: string[];
  owner: string;
} {
  const missing: string[] = [];
  if (!envConfig.chainId) missing.push('VITE_CHAIN_ID');
  if (!envConfig.rpcUrl) missing.push('VITE_RPC_URL');
  if (!envConfig.tokenAddress) missing.push('VITE_TOKEN_ADDRESS');
  if (!envConfig.vaultAddress) missing.push('VITE_VAULT_ADDRESS');
  if (!VAULT_CONTRACT_INTEGRATION.abiReady) {
    missing.push('Frozen Qrygent Vault Solidity ABI & EIP-712 domain (contracts/)');
  }

  return {
    reason:
      'Qrygent Vault smart contract ABI and deployed testnet configuration have not been supplied yet.',
    missing,
    owner: VAULT_CONTRACT_INTEGRATION.owner,
  };
}

export async function fetchVaultSummary(): Promise<ServiceResult<VaultSummaryData>> {
  return {
    status: 'unconfigured',
    ...getVaultContractBlocker(),
  };
}

export async function fetchOnChainMandates(): Promise<ServiceResult<MandateRecord[]>> {
  return {
    status: 'unconfigured',
    ...getVaultContractBlocker(),
  };
}

export async function fetchOnChainPayments(): Promise<ServiceResult<PaymentRecord[]>> {
  return {
    status: 'unconfigured',
    ...getVaultContractBlocker(),
  };
}

export async function fetchOnChainSecurityEvents(): Promise<ServiceResult<SecurityEvent[]>> {
  return {
    status: 'unconfigured',
    ...getVaultContractBlocker(),
  };
}
