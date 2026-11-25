import { formatUnits, parseUnits } from 'viem';

/**
 * Format ERC-20 integer base units into a human-readable string using verified token decimals.
 * Never uses JavaScript floating-point math for financial conversions.
 */
export function formatBaseUnits(
  amount: bigint | string,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const formatted = formatUnits(value, decimals);
  const [intPart = '0', fracPart = ''] = formatted.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (!fracPart || maxFractionDigits <= 0) {
    return withCommas;
  }

  const trimmedFrac = fracPart.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmedFrac.length > 0 ? `${withCommas}.${trimmedFrac}` : withCommas;
}

/**
 * Parse a decimal display string into exact uint256 base units.
 * Throws if negative, malformed, or exceeds token decimal precision.
 */
export function parseDecimalToBaseUnits(input: string, decimals: number): bigint {
  const cleaned = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error('Amount must be a non-negative decimal number.');
  }

  const [, frac = ''] = cleaned.split('.');
  if (frac.length > decimals) {
    throw new Error(`Amount exceeds token precision (${decimals} decimals).`);
  }

  return parseUnits(cleaned, decimals);
}

export function truncateHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
}

export function formatUtcTimestamp(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return '—';
  return new Date(unixSeconds * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export function formatCountdown(expiryUnixSeconds: number, nowUnixSeconds = Math.floor(Date.now() / 1000)): string {
  const delta = expiryUnixSeconds - nowUnixSeconds;
  if (delta <= 0) return 'Expired';
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const mins = Math.floor((delta % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${Math.max(1, mins)}m remaining`;
}
