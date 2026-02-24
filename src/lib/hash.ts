import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(raw: string): Promise<string> {
  return bcrypt.hash(raw, ROUNDS);
}

export async function verifyPassword(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash);
}
