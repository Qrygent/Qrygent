import { createConfig, http, injected } from 'wagmi';
import { defineChain, type Chain } from 'viem';
import { envConfig } from './env';
import { targetChain } from './chain';

/**
 * Sentinel placeholder chain used ONLY so wagmi can mount injected wallet connectors
 * when VITE_CHAIN_ID / VITE_RPC_URL are not yet configured.
 * All write/read actions check envConfig.capabilities.hasChainConfig first and refuse
 * to operate against this unconfigured placeholder.
 */
const unconfiguredSentinelChain: Chain = defineChain({
  id: 0,
  name: 'Unconfigured Network',
  nativeCurrency: { name: 'None', symbol: 'NONE', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:0'] } },
  testnet: true,
});

const activeChain = targetChain ?? unconfiguredSentinelChain;

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [activeChain.id]: http(envConfig.rpcUrl ?? undefined),
  },
  multiInjectedProviderDiscovery: true,
});
