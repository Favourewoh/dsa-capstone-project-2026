import { randomBytes, randomUUID } from "node:crypto";

// Excludes ambiguous characters (0, O, 1, I, L) so codes are easy to read aloud.
const READABLE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newId() {
  return randomUUID();
}

export function newReference(length = 8) {
  if (!Number.isInteger(length) || length < 4 || length > 32) {
    throw new RangeError("Reference length must be an integer between 4 and 32.");
  }

  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += READABLE_ALPHABET[bytes[i] % READABLE_ALPHABET.length];
  }
  return `TKT-${code}`;
}