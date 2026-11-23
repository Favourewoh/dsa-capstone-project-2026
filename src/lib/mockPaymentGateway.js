import { randomUUID } from "node:crypto";
import { DomainError, ErrorCodes } from "../domain/errors.js";

export function createMockPaymentGateway() {
  return {
    async charge({ amountCents, currency = "USD", reference, decline = false } = {}) {
      if (
        typeof amountCents !== "number" ||
        !Number.isInteger(amountCents) ||
        !Number.isSafeInteger(amountCents) ||
        amountCents < 0
      ) {
        throw new DomainError(
          ErrorCodes.VALIDATION,
          "amountCents must be a non-negative integer in whole cents."
        );
      }

      if (decline) {
        throw new DomainError(
          ErrorCodes.PAYMENT_DECLINED,
          `Payment declined for booking reference ${reference ?? "unknown"}.`,
          { reference }
        );
      }

      return {
        approved: true,
        transactionId: `txn_${randomUUID()}`,
        amountCents,
        currency,
        reference,
        chargedAt: new Date().toISOString(),
      };
    },
  };
}