import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcrypt.
 * @param password The plaintext password to hash.
 * @returns A promise that resolves to the hashed password.
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a hashed password.
 * @param password The plaintext password to verify.
 * @param hash The hashed password to compare against.
 * @returns A promise that resolves to a boolean indicating if the password matches.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}
