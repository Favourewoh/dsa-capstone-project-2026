import { DomainError, ErrorCodes } from "../domain/errors.js";
import { verifyToken } from "../lib/token.js";

export function extractBearerToken(req) {
  const rawHeader = req.headers?.authorization || req.headers?.Authorization;
  if (typeof rawHeader !== "string") {
    throw new DomainError(ErrorCodes.UNAUTHENTICATED, "Authentication required.");
  }

  const parts = rawHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
    throw new DomainError(ErrorCodes.UNAUTHENTICATED, "Invalid Bearer token.");
  }

  return parts[1];
}

export async function requireUser(req, { repository }) {
  const token = extractBearerToken(req);

  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    throw new DomainError(ErrorCodes.UNAUTHENTICATED, "Invalid or expired token.");
  }

  if (!claims?.sub) {
    throw new DomainError(ErrorCodes.UNAUTHENTICATED, "Invalid token payload.");
  }

  const user = await repository.getUserById(claims.sub);
  if (!user) {
    throw new DomainError(ErrorCodes.UNAUTHENTICATED, "User not found.");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles);
  return async function roleGuard(req, context) {
    const user = await requireUser(req, context);
    if (!allowed.has(user.role)) {
      throw new DomainError(
        ErrorCodes.FORBIDDEN,
        "You do not have permission to perform this action."
      );
    }
    return user;
  };
}

export function assertBookingOwner(booking, user) {
  if (!booking || !user || booking.userId !== user.id) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "Booking not found.");
  }
}

export function assertEventOwner(event, user) {
  if (!event) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "Event not found.");
  }
  if (!user || !event.organizerId || event.organizerId !== user.id) {
    throw new DomainError(
      ErrorCodes.FORBIDDEN,
      "You do not own this event."
    );
  }
}