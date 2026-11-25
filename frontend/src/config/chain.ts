import { defineChain, type Chain } from 'viem';
import { envConfig, type QrygentEnvConfig } from './env';

/**
 * Constructs the target EVM testnet chain strictly from verified environment variables.
 * Per docs/ARCHITECTURE.md §9, chain IDs, RPC URLs, and explorers are NEVER hardcoded.
 */
export function buildTargetChain(config: QrygentEnvConfig = envConfig): Chain | null {
  if (!config.capabilities.hasChainConfig || !config.chainId || !config.rpcUrl) {
    return null;
  }

  return defineChain({
    id: config.chainId,
    name: `Configured Testnet (${config.chainId})`,
    nativeCurrency: {
      name: 'Testnet Gas Token',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [config.rpcUrl],
      },
    },
    ...(config.explorerUrl
      ? {
          blockExplorers: {
            default: {
              name: 'Testnet Explorer',
              url: config.explorerUrl,
            },
          },
        }
      : {}),
    testnet: true,
  });
}

export const targetChain = buildTargetChain(envConfig);

export function buildExplorerTxUrl(txHash: string, explorerUrl = envConfig.explorerUrl): string | null {
  if (!explorerUrl) return null;
  return `${explorerUrl}/tx/${txHash}`;
}

export function buildExplorerAddressUrl(
  address: string,
  explorerUrl = envConfig.explorerUrl,
): string | null {
  if (!explorerUrl) return null;
  return `${explorerUrl}/address/${address}`;
}
