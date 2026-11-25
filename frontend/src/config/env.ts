import { z } from 'zod';
import { isAddress, type Address } from 'viem';

const evmAddressSchema = z
  .string()
  .trim()
  .refine((val) => isAddress(val), { message: 'Must be a valid 0x-prefixed EVM address' })
  .transform((val) => val as Address);

const httpUrlSchema = z
  .string()
  .trim()
  .url({ message: 'Must be a valid http(s) URL' })
  .refine((val) => val.startsWith('http://') || val.startsWith('https://'), {
    message: 'URL must use http:// or https://',
  })
  .transform((val) => val.replace(/\/+$/, ''));

const pqcServiceUrlSchema = z
  .string()
  .trim()
  .refine(
    (val) =>
      val === '/' ||
      ((val.startsWith('http://') || val.startsWith('https://')) &&
        z.string().url().safeParse(val).success),
    { message: 'Must be "/" (same-origin Vercel) or a valid http(s) URL' },
  )
  .transform((val) => (val === '/' ? '' : val.replace(/\/+$/, '')));

const positiveIntSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, { message: 'Must be a positive integer chain ID' })
  .transform((val) => Number.parseInt(val, 10))
  .refine((val) => Number.isSafeInteger(val) && val > 0, {
    message: 'Must be a positive safe integer',
  });

export interface EnvFieldDiagnostic {
  key: string;
  label: string;
  requiredFor: string;
  owner: string;
  status: 'configured' | 'missing' | 'invalid' | 'optional_unset';
  valuePreview?: string;
  error?: string;
}

export interface QrygentEnvConfig {
  chainId: number | null;
  rpcUrl: string | null;
  explorerUrl: string | null;
  tokenAddress: Address | null;
  vaultAddress: Address | null;
  pqcServiceBaseUrl: string | null;
  walletConnectProjectId: string | null;
  diagnostics: EnvFieldDiagnostic[];
  capabilities: {
    hasChainConfig: boolean;
    hasTokenConfig: boolean;
    hasVaultConfig: boolean;
    hasPqcVerifierConfig: boolean;
    hasWalletConnectConfig: boolean;
  };
  hasErrors: boolean;
}

export type RawEnvMap = Record<string, string | boolean | undefined>;

function parseOptionalField<T>(
  raw: string | boolean | undefined,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  meta: {
    key: string;
    label: string;
    requiredFor: string;
    owner: string;
    optional?: boolean;
    maskValue?: boolean;
  },
): { value: T | null; diagnostic: EnvFieldDiagnostic } {
  const str = typeof raw === 'string' ? raw.trim() : '';
  if (!str) {
    return {
      value: null,
      diagnostic: {
        key: meta.key,
        label: meta.label,
        requiredFor: meta.requiredFor,
        owner: meta.owner,
        status: meta.optional ? 'optional_unset' : 'missing',
      },
    };
  }

  const parsed = schema.safeParse(str);
  if (!parsed.success) {
    const firstErr = parsed.error.issues[0]?.message ?? 'Invalid configuration value';
    return {
      value: null,
      diagnostic: {
        key: meta.key,
        label: meta.label,
        requiredFor: meta.requiredFor,
        owner: meta.owner,
        status: 'invalid',
        valuePreview: meta.maskValue ? '***' : str,
        error: firstErr,
      },
    };
  }

  return {
    value: parsed.data,
    diagnostic: {
      key: meta.key,
      label: meta.label,
      requiredFor: meta.requiredFor,
      owner: meta.owner,
      status: 'configured',
      valuePreview: meta.maskValue
        ? `${str.slice(0, 4)}…${str.slice(-4)}`
        : str === '/'
          ? 'Same-origin (/v1)'
          : str,
    },
  };
}

export function validateEnv(rawEnv: RawEnvMap): QrygentEnvConfig {
  const chainId = parseOptionalField(rawEnv.VITE_CHAIN_ID, positiveIntSchema, {
    key: 'VITE_CHAIN_ID',
    label: 'Target Testnet Chain ID',
    requiredFor: 'Wallet network verification & EIP-712 domain binding',
    owner: 'Smart Contract / Blockchain Lead',
  });

  const rpcUrl = parseOptionalField(rawEnv.VITE_RPC_URL, httpUrlSchema, {
    key: 'VITE_RPC_URL',
    label: 'Target Testnet RPC URL',
    requiredFor: 'Reading balances, mandates, and on-chain vault events',
    owner: 'Smart Contract / Blockchain Lead',
  });

  const explorerUrl = parseOptionalField(rawEnv.VITE_EXPLORER_URL, httpUrlSchema, {
    key: 'VITE_EXPLORER_URL',
    label: 'Block Explorer Base URL',
    requiredFor: 'Auditable links to transactions and deployed contracts',
    owner: 'Smart Contract / Blockchain Lead',
    optional: true,
  });

  const tokenAddress = parseOptionalField(rawEnv.VITE_TOKEN_ADDRESS, evmAddressSchema, {
    key: 'VITE_TOKEN_ADDRESS',
    label: 'Supported Test Token (ERC-20)',
    requiredFor: 'Token balance display, ERC-20 approval, and vault deposits',
    owner: 'Smart Contract / Blockchain Lead',
  });

  const vaultAddress = parseOptionalField(rawEnv.VITE_VAULT_ADDRESS, evmAddressSchema, {
    key: 'VITE_VAULT_ADDRESS',
    label: 'Qrygent Vault Contract Address',
    requiredFor: 'Deposits, withdrawals, mandate enforcement, and payment execution',
    owner: 'Smart Contract / Blockchain Lead',
  });

  const pqcServiceBaseUrl = parseOptionalField(
    rawEnv.VITE_PQC_SERVICE_BASE_URL,
    pqcServiceUrlSchema,
    {
      key: 'VITE_PQC_SERVICE_BASE_URL',
      label: 'PQC Verifier Service URL',
      requiredFor: 'Live /v1/health probes and ML-DSA-65 verification (/v1/payments/verify)',
      owner: 'Product / Frontend / PQC Lead',
    },
  );

  const walletConnectProjectId = parseOptionalField(
    rawEnv.VITE_WALLET_CONNECT_PROJECT_ID,
    z.string().trim().min(8, { message: 'Project ID appears too short' }),
    {
      key: 'VITE_WALLET_CONNECT_PROJECT_ID',
      label: 'WalletConnect Project ID',
      requiredFor: 'Optional QR mobile wallet support (injected wallets work without it)',
      owner: 'Frontend / Project Team',
      optional: true,
      maskValue: true,
    },
  );

  const diagnostics = [
    chainId.diagnostic,
    rpcUrl.diagnostic,
    explorerUrl.diagnostic,
    tokenAddress.diagnostic,
    vaultAddress.diagnostic,
    pqcServiceBaseUrl.diagnostic,
    walletConnectProjectId.diagnostic,
  ];

  const hasChainConfig = chainId.value !== null && rpcUrl.value !== null;
  const hasTokenConfig = hasChainConfig && tokenAddress.value !== null;
  const hasVaultConfig = hasChainConfig && vaultAddress.value !== null;
  const hasPqcVerifierConfig = pqcServiceBaseUrl.value !== null;
  const hasWalletConnectConfig = walletConnectProjectId.value !== null;
  const hasErrors = diagnostics.some((d) => d.status === 'invalid');

  return {
    chainId: chainId.value,
    rpcUrl: rpcUrl.value,
    explorerUrl: explorerUrl.value,
    tokenAddress: tokenAddress.value,
    vaultAddress: vaultAddress.value,
    pqcServiceBaseUrl: pqcServiceBaseUrl.value,
    walletConnectProjectId: walletConnectProjectId.value,
    diagnostics,
    capabilities: {
      hasChainConfig,
      hasTokenConfig,
      hasVaultConfig,
      hasPqcVerifierConfig,
      hasWalletConnectConfig,
    },
    hasErrors,
  };
}

export const envConfig: QrygentEnvConfig = validateEnv(
  import.meta.env as unknown as RawEnvMap,
);
