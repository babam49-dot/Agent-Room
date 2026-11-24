import { randomBytes } from 'node:crypto';

/**
 * Generates a UUIDv7 (RFC 9562)
 * 48-bit Unix timestamp in ms | 4-bit ver (0111) | 12-bit rand_a | 2-bit var (10) | 62-bit rand_b
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const now = Date.now();

  // 48-bit timestamp
  bytes[0] = Math.floor(now / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(now / 0x100000000) & 0xff;
  bytes[2] = Math.floor(now / 0x1000000) & 0xff;
  bytes[3] = Math.floor(now / 0x10000) & 0xff;
  bytes[4] = Math.floor(now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  // Version 7: 0111 in bits 48-51
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);

  // Variant 1: 10 in bits 64-65
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
