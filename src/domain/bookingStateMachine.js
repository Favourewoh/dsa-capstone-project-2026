import { DomainError, ErrorCodes } from "./errors.js";

export const BOOKING_STATES = Object.freeze([
  "pending",
  "paid",
  "cancelled",
  "refunded",
  "checked_in",
]);

export const FINAL_BOOKING_STATES = Object.freeze([
  "cancelled",
  "refunded",
  "checked_in",
]);

export const ALLOWED_BOOKING_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["paid", "cancelled"]),
  paid: Object.freeze(["checked_in", "refunded", "cancelled"]),
  cancelled: Object.freeze([]),
  refunded: Object.freeze([]),
  checked_in: Object.freeze([]),
});

const TRANSITION_MAP = new Map(
  Object.entries(ALLOWED_BOOKING_TRANSITIONS).map(([from, toList]) => [
    from,
    new Set(toList),
  ])
);

const INVALID_TRANSITION_CODE =
  ErrorCodes?.INVALID_TRANSITION ?? "INVALID_TRANSITION";

export function canTransition(fromState, toState) {
  if (typeof fromState !== "string" || typeof toState !== "string") {
    return false;
  }
  const targets = TRANSITION_MAP.get(fromState);
  if (!targets) {
    return false;
  }
  return targets.has(toState);
}

export function assertTransition(fromState, toState) {
  if (!TRANSITION_MAP.has(fromState)) {
    throw new DomainError(
      INVALID_TRANSITION_CODE,
      `Unknown booking state: "${String(fromState)}".`,
      { from: fromState, to: toState }
    );
  }

  if (!canTransition(fromState, toState)) {
    const allowed = Array.from(TRANSITION_MAP.get(fromState));
    throw new DomainError(
      INVALID_TRANSITION_CODE,
      `Cannot transition booking from "${fromState}" to "${String(toState)}". Allowed transitions: [${allowed.join(", ")}].`,
      { from: fromState, to: toState, allowed }
    );
  }

  return true;
}