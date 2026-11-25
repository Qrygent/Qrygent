import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSignMessage,
  useSwitchChain,
} from 'wagmi';
import { envConfig } from '../config/env';
import type { PaymentVerificationEnvelope } from '../domain/types';
import { ERC20_ABI } from '../services/contracts/erc20';
import {
  fetchOnChainMandates,
  fetchOnChainPayments,
  fetchOnChainSecurityEvents,
  fetchVaultSummary,
} from '../services/contracts/vaultInterface';
import {
  pqcVerifierClient,
  type RegisterAgentKeyInput,
  type RevokeAgentKeyInput,
} from '../services/pqcVerifier/client';

export function useWalletNetwork() {
  const account = useAccount();
  const activeChainId = useChainId();
  const { connectors, connect, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const { signMessageAsync, isPending: isSigningMessage } = useSignMessage();

  const targetChainId = envConfig.chainId;
  const hasChainConfig = envConfig.capabilities.hasChainConfig;
  const isSupportedChain = Boolean(
    hasChainConfig && account.isConnected && targetChainId && activeChainId === targetChainId,
  );
  const isWrongChain = Boolean(
    hasChainConfig && account.isConnected && targetChainId && activeChainId !== targetChainId,
  );

  const canReadToken = Boolean(
    isSupportedChain && account.address && envConfig.tokenAddress,
  );

  const tokenBalanceQuery = useReadContract({
    abi: ERC20_ABI,
    address: envConfig.tokenAddress ?? undefined,
    functionName: 'balanceOf',
    args: account.address ? [account.address] : undefined,
    query: { enabled: canReadToken },
  });

  const tokenDecimalsQuery = useReadContract({
    abi: ERC20_ABI,
    address: envConfig.tokenAddress ?? undefined,
    functionName: 'decimals',
    query: { enabled: canReadToken },
  });

  const tokenSymbolQuery = useReadContract({
    abi: ERC20_ABI,
    address: envConfig.tokenAddress ?? undefined,
    functionName: 'symbol',
    query: { enabled: canReadToken },
  });

  return {
    address: account.address,
    isConnected: account.isConnected,
    status: account.status,
    activeChainId: account.isConnected ? activeChainId : null,
    targetChainId,
    hasChainConfig,
    isSupportedChain,
    isWrongChain,
    connectors,
    connect,
    disconnect,
    switchChain,
    signMessageAsync,
    isSigningMessage,
    isConnecting,
    isSwitching,
    connectError,
    switchError,
    tokenBalance: {
      enabled: canReadToken,
      isLoading:
        tokenBalanceQuery.isLoading ||
        tokenDecimalsQuery.isLoading ||
        tokenSymbolQuery.isLoading,
      error:
        tokenBalanceQuery.error ?? tokenDecimalsQuery.error ?? tokenSymbolQuery.error ?? null,
      rawBalance: tokenBalanceQuery.data,
      decimals: tokenDecimalsQuery.data,
      symbol: tokenSymbolQuery.data,
    },
  };
}

export function useVerifierHealth() {
  return useQuery({
    queryKey: ['pqc-verifier', 'health', envConfig.pqcServiceBaseUrl],
    queryFn: () => pqcVerifierClient.checkHealth(),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (envelope: PaymentVerificationEnvelope) =>
      pqcVerifierClient.verifyPaymentRequest(envelope),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['security', 'pqc-verifier'] });
    },
  });
}

export function useRegisterAgentKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterAgentKeyInput) => pqcVerifierClient.registerAgentKey(input),
    onSuccess: (res) => {
      if (res.status === 'ready') {
        void qc.invalidateQueries({ queryKey: ['agents'] });
        void qc.invalidateQueries({ queryKey: ['security', 'pqc-verifier'] });
      }
    },
  });
}

export function useRevokeAgentKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RevokeAgentKeyInput) => pqcVerifierClient.revokeAgentKey(input),
    onSuccess: (res) => {
      if (res.status === 'ready') {
        void qc.invalidateQueries({ queryKey: ['agents'] });
        void qc.invalidateQueries({ queryKey: ['security', 'pqc-verifier'] });
      }
    },
  });
}

export function useVaultSummary() {
  return useQuery({
    queryKey: ['vault', 'summary', envConfig.vaultAddress, envConfig.chainId],
    queryFn: () => fetchVaultSummary(),
    retry: false,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ['agents', 'list', envConfig.pqcServiceBaseUrl, envConfig.vaultAddress],
    queryFn: () => pqcVerifierClient.listAgents(),
    retry: false,
  });
}

export function useMandates() {
  return useQuery({
    queryKey: ['mandates', 'list', envConfig.vaultAddress],
    queryFn: () => fetchOnChainMandates(),
    retry: false,
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ['payments', 'list', envConfig.vaultAddress],
    queryFn: () => fetchOnChainPayments(),
    retry: false,
  });
}

export function useSecurityEvents() {
  const verifierEvents = useQuery({
    queryKey: ['security', 'pqc-verifier', envConfig.pqcServiceBaseUrl],
    queryFn: () => pqcVerifierClient.listSecurityEvents(),
    retry: false,
  });

  const contractEvents = useQuery({
    queryKey: ['security', 'smart-contract', envConfig.vaultAddress],
    queryFn: () => fetchOnChainSecurityEvents(),
    retry: false,
  });

  return { verifierEvents, contractEvents };
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ['benchmarks', 'measured', envConfig.pqcServiceBaseUrl],
    queryFn: () => pqcVerifierClient.fetchBenchmarks(),
    retry: false,
  });
}
