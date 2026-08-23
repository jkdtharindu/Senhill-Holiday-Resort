/**
 * Password hashing for admin accounts.
 *
 * Customers never have a password — they sign in with Google. This module is
 * admin-only, and is one of the pieces that keeps the two auth systems
 * genuinely separate rather than separate-looking.
 */

import bcrypt from "bcryptjs";

/**
 * bcrypt cost factor. Each increment doubles the work.
 *
 * 12 is the current sensible default: roughly 250ms on typical hardware, slow
 * enough to make offline cracking expensive, fast enough that a real admin
 * signing in does not notice. Raising this later is safe — bcrypt stores the
 * cost inside the hash, so old hashes keep verifying and only get upgraded
 * when someone next changes their password.
 */
export const BCRYPT_ROUNDS = 12;

/**
 * Minimum admin password length.
 *
 * Length beats character-class rules: "correct-horse-battery-staple" is far
 * stronger than "P@ss1!" and far easier to remember, so this deliberately does
 * not demand symbols or mixed case.
 */
export const MIN_PASSWORD_LENGTH = 12;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters. Longer is better than more complicated — a few unrelated words beats a short password with symbols in it.`;
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A bcrypt hash of a value nobody knows, used to burn the same CPU time as a
 * real verification when the email does not exist.
 *
 * Without this, a failed login for an unknown email returns in about a
 * millisecond while a wrong password for a real one takes ~250ms. That timing
 * gap tells an attacker which email addresses are real admin accounts, which
 * is exactly the reconnaissance we removed from the repo earlier. Generated at
 * module load so it is never a constant an attacker can recognise.
 */
const DUMMY_HASH_PROMISE: Promise<string> = bcrypt.hash(
  `no-such-account-${Math.random()}-${Date.now()}`,
  BCRYPT_ROUNDS,
);

/**
 * Spend the same time as a real password check, then fail.
 * Call this on the "no such admin" path so both paths take equally long.
 */
export async function fakeVerifyPassword(password: string): Promise<false> {
  await bcrypt.compare(password, await DUMMY_HASH_PROMISE);
  return false;
}
