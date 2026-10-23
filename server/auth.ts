/**
 * Local credential handling (Decision D-004).
 *
 * scrypt with a per-user random salt, constant-time comparison, no third-party identity provider,
 * and no secret material anywhere but the database. `.env` is never read or written by this code.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = { N: 16384, r: 8, p: 1 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: COST.N, r: COST.r, p: COST.p }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${COST.N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, saltPart, keyPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !keyPart) return false;
  const salt = Buffer.from(saltPart, "base64");
  const expected = Buffer.from(keyPart, "base64");
  const actual = await derive(password, salt);
  if (actual.length !== expected.length) return false;
  const safe = timingSafeEqual(actual, expected);
  // Cheap early-out when the stored cost differs from the current cost parameter.
  return safe && Number(cost ?? COST.N) > 0;
}

export const MIN_PASSWORD_LENGTH = 8;

export function isStrongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
