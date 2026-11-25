import { createHash, randomBytes } from 'node:crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { bytesToHex, hexToBytes, type Hex } from 'viem';

export const ML_DSA_65_ALGORITHM = 'ML-DSA-65' as const;
export const ML_DSA_65_STANDARD = 'NIST FIPS 204' as const;
export const ML_DSA_65_LIBRARY = '@noble/post-quantum' as const;
export const ML_DSA_65_PUBLIC_KEY_BYTES = 1952;
export const ML_DSA_65_SIGNATURE_BYTES = 3309;
export const ML_DSA_65_SECRET_KEY_BYTES = 4032;

export interface Mldsa65KeyPair {
  algorithm: typeof ML_DSA_65_ALGORITHM;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyHex: Hex;
  publicKeyFingerprint: string;
}

export function computePublicKeyFingerprint(publicKeyBytes: Uint8Array): string {
  const hash = createHash('sha256').update(publicKeyBytes).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Decodes either a 0x-prefixed hex string or strict base64 string into bytes
 * and enforces the exact expected cryptographic byte length.
 */
export function decodeStrictKeyOrSig(input: string, expectedBytes: number, label: string): Uint8Array {
  const trimmed = input.trim();
  let bytes: Uint8Array;

  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    if ((trimmed.length - 2) % 2 !== 0) {
      throw new Error(`${label} hex string must have an even number of characters.`);
    }
    bytes = hexToBytes(trimmed as Hex);
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
    bytes = new Uint8Array(Buffer.from(trimmed, 'base64'));
  } else {
    throw new Error(`${label} must be valid 0x-hex or strict base64.`);
  }

  if (bytes.length !== expectedBytes) {
    throw new Error(
      `${label} must be exactly ${expectedBytes} bytes for ML-DSA-65 (received ${bytes.length} bytes).`,
    );
  }

  return bytes;
}

export function generateMldsa65KeyPair(seed?: Uint8Array): Mldsa65KeyPair {
  const effectiveSeed = seed ?? new Uint8Array(randomBytes(32));
  const { publicKey, secretKey } = ml_dsa65.keygen(effectiveSeed);
  if (publicKey.length !== ML_DSA_65_PUBLIC_KEY_BYTES) {
    throw new Error(`Unexpected ML-DSA-65 public key length: ${publicKey.length}`);
  }
  return {
    algorithm: ML_DSA_65_ALGORITHM,
    publicKey,
    secretKey,
    publicKeyHex: bytesToHex(publicKey),
    publicKeyFingerprint: computePublicKeyFingerprint(publicKey),
  };
}

export function signDigestMldsa65(digestHex: Hex, secretKey: Uint8Array): Hex {
  if (secretKey.length !== ML_DSA_65_SECRET_KEY_BYTES) {
    throw new Error(
      `Invalid ML-DSA-65 secret key length: expected ${ML_DSA_65_SECRET_KEY_BYTES}, got ${secretKey.length}.`,
    );
  }
  const msgBytes = hexToBytes(digestHex);
  const signature = ml_dsa65.sign(secretKey, msgBytes);
  return bytesToHex(signature);
}

export function verifyDigestMldsa65(
  digestHex: Hex,
  signatureBytes: Uint8Array,
  publicKeyBytes: Uint8Array,
): boolean {
  if (
    signatureBytes.length !== ML_DSA_65_SIGNATURE_BYTES ||
    publicKeyBytes.length !== ML_DSA_65_PUBLIC_KEY_BYTES
  ) {
    return false;
  }

  try {
    const msgBytes = hexToBytes(digestHex);
    return ml_dsa65.verify(publicKeyBytes, msgBytes, signatureBytes);
  } catch {
    return false;
  }
}
