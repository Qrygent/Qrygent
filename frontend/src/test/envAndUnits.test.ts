import { describe, expect, it } from 'vitest';
import { validateEnv } from '../config/env';
import { formatBaseUnits, parseDecimalToBaseUnits, truncateHex } from '../domain/units';

describe('Startup environment validation', () => {
  it('reports missing configuration honestly without throwing', () => {
    const cfg = validateEnv({});
    expect(cfg.hasErrors).toBe(false);
    expect(cfg.capabilities.hasChainConfig).toBe(false);
    expect(cfg.capabilities.hasTokenConfig).toBe(false);
    expect(cfg.capabilities.hasVaultConfig).toBe(false);
    expect(cfg.capabilities.hasPqcVerifierConfig).toBe(false);
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_CHAIN_ID')?.status).toBe('missing');
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_WALLET_CONNECT_PROJECT_ID')?.status).toBe(
      'optional_unset',
    );
  });

  it('flags invalid chain IDs, URLs, and EVM addresses with actionable errors', () => {
    const cfg = validateEnv({
      VITE_CHAIN_ID: 'not-a-number',
      VITE_RPC_URL: 'ftp://bad-protocol.example',
      VITE_TOKEN_ADDRESS: '0x1234',
      VITE_VAULT_ADDRESS: 'not-an-address',
      VITE_PQC_SERVICE_BASE_URL: 'invalid-url',
    });

    expect(cfg.hasErrors).toBe(true);
    expect(cfg.capabilities.hasChainConfig).toBe(false);
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_CHAIN_ID')?.status).toBe('invalid');
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_RPC_URL')?.status).toBe('invalid');
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_TOKEN_ADDRESS')?.status).toBe('invalid');
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_VAULT_ADDRESS')?.status).toBe('invalid');
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_PQC_SERVICE_BASE_URL')?.status).toBe(
      'invalid',
    );
  });

  it('parses valid public configuration cleanly', () => {
    const cfg = validateEnv({
      VITE_CHAIN_ID: '11155111',
      VITE_RPC_URL: 'https://rpc.example.org/',
      VITE_EXPLORER_URL: 'https://explorer.example.org/',
      VITE_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
      VITE_VAULT_ADDRESS: '0x2222222222222222222222222222222222222222',
      VITE_PQC_SERVICE_BASE_URL: 'http://127.0.0.1:8000/',
    });

    expect(cfg.hasErrors).toBe(false);
    expect(cfg.chainId).toBe(11155111);
    expect(cfg.rpcUrl).toBe('https://rpc.example.org');
    expect(cfg.pqcServiceBaseUrl).toBe('http://127.0.0.1:8000');
    expect(cfg.capabilities.hasChainConfig).toBe(true);
    expect(cfg.capabilities.hasTokenConfig).toBe(true);
    expect(cfg.capabilities.hasVaultConfig).toBe(true);
    expect(cfg.capabilities.hasPqcVerifierConfig).toBe(true);
  });

  it('accepts "/" for same-origin Vercel PQC API routing', () => {
    const cfg = validateEnv({
      VITE_PQC_SERVICE_BASE_URL: '/',
    });
    expect(cfg.hasErrors).toBe(false);
    expect(cfg.pqcServiceBaseUrl).toBe('');
    expect(cfg.capabilities.hasPqcVerifierConfig).toBe(true);
    expect(cfg.diagnostics.find((d) => d.key === 'VITE_PQC_SERVICE_BASE_URL')?.valuePreview).toBe(
      'Same-origin (/v1)',
    );
  });
});

describe('Base-unit integer financial formatting', () => {
  it('converts decimal inputs to exact uint256 base units without floats', () => {
    expect(parseDecimalToBaseUnits('125.5', 6)).toBe(125_500_000n);
    expect(parseDecimalToBaseUnits('0.000001', 6)).toBe(1n);
    expect(parseDecimalToBaseUnits('1000', 18)).toBe(1000_000000000000000000n);
  });

  it('rejects negative values and excess precision', () => {
    expect(() => parseDecimalToBaseUnits('-5', 6)).toThrow();
    expect(() => parseDecimalToBaseUnits('1.1234567', 6)).toThrow(/precision/i);
  });

  it('formats base units with commas and strips trailing fractional zeros', () => {
    expect(formatBaseUnits(12_500_000_000n, 6)).toBe('12,500');
    expect(formatBaseUnits(12_500_250_000n, 6)).toBe('12,500.25');
    expect(truncateHex('0x1234567890abcdef1234567890abcdef12345678', 4, 4)).toBe('0x1234…5678');
  });
});
