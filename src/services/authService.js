import { randomUUID } from "node:crypto";
import { DomainError, ErrorCodes } from "../domain/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/token.js";

const ALLOWED_ROLES = new Set(["attendee", "organizer", "staff"]);

function normalizeEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function createAuthService(repository) {
  if (!repository) {
    throw new DomainError(ErrorCodes.VALIDATION, "Repository is required for authService.");
  }

  return {
    async signup({ email, password, name, role = "attendee" } = {}) {
      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail || !cleanEmail.includes("@")) {
        throw new DomainError(ErrorCodes.VALIDATION, "A valid email is required.");
      }

      if (typeof password !== "string" || password.length < 8) {
        throw new DomainError(
          ErrorCodes.VALIDATION,
          "Password must be at least 8 characters long."
        );
      }

      const cleanRole =
        typeof role === "string" && role.trim() !== "" ? role.trim() : "attendee";
      if (!ALLOWED_ROLES.has(cleanRole)) {
        throw new DomainError(
          ErrorCodes.VALIDATION,
          "Role must be attendee, organizer, or staff."
        );
      }

      const existing = await repository.getUserByEmail(cleanEmail);
      if (existing) {
        throw new DomainError(ErrorCodes.EMAIL_TAKEN, "Email is already registered.");
      }

      const cleanName =
        typeof name === "string" && name.trim() !== ""
          ? name.trim()
          : cleanEmail.split("@")[0];

      const user = await repository.createUser({
        id: randomUUID(),
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
      });

      const token = signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      return {
        token,
        user: toSafeUser(user),
      };
    },

    async login({ email, password } = {}) {
      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail || typeof password !== "string" || password.length === 0) {
        throw new DomainError(
          ErrorCodes.INVALID_CREDENTIALS,
          "Invalid email or password."
        );
      }

      const user = await repository.getUserByEmail(cleanEmail);
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        throw new DomainError(
          ErrorCodes.INVALID_CREDENTIALS,
          "Invalid email or password."
        );
      }

      const token = signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      return {
        token,
        user: toSafeUser(user),
      };
    },

    async getMe(userId) {
      const user = await repository.getUserById(userId);
      if (!user) {
        throw new DomainError(ErrorCodes.UNAUTHENTICATED, "Authentication required.");
      }
      return toSafeUser(user);
    },
  };
}