import { DomainError, ErrorCodes } from "../domain/errors.js";
import { newId, newReference } from "../domain/ids.js";
import { assertTransition } from "../domain/bookingStateMachine.js";

const MIN_TICKETS = 1;
const MAX_TICKETS = 10;

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError(ErrorCodes.VALIDATION, `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

export function createBookingService(repository, paymentGateway) {
  if (!repository) {
    throw new DomainError(ErrorCodes.VALIDATION, "Repository is required for bookingService.");
  }

  return {
    async createBooking({ tierId, attendeeName, quantity, userId } = {}) {
      const ownerId = requireNonEmptyString(userId, "x-user-id");
      const cleanTierId = requireNonEmptyString(tierId, "tierId");
      const cleanAttendeeName = requireNonEmptyString(attendeeName, "attendeeName");

      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        !Number.isSafeInteger(quantity) ||
        quantity < MIN_TICKETS ||
        quantity > MAX_TICKETS
      ) {
        throw new DomainError(
          ErrorCodes.VALIDATION,
          `Booking quantity must be an integer between ${MIN_TICKETS} and ${MAX_TICKETS}.`
        );
      }

      const tier = await repository.getTierById(cleanTierId);
      if (!tier) {
        throw new DomainError(ErrorCodes.NOT_FOUND, `Ticket tier not found: ${cleanTierId}`);
      }

      const event = await repository.getEventById(tier.eventId);
      if (!event || !event.published) {
        throw new DomainError(
          ErrorCodes.INVALID_STATE,
          "Cannot book tickets for an unpublished or missing event."
        );
      }

      if (tier.seatsLeft < quantity) {
        throw new DomainError(
          ErrorCodes.SOLD_OUT,
          `Not enough seats left on tier "${tier.name}". Requested ${quantity}, available ${tier.seatsLeft}.`
        );
      }

      const totalCents = tier.priceCents * quantity;
      if (!Number.isSafeInteger(totalCents)) {
        throw new DomainError(
          ErrorCodes.VALIDATION,
          "Total booking amount exceeds safe integer range."
        );
      }

      let reference = newReference();
      while (await repository.hasBookingReference(reference)) {
        reference = newReference();
      }

      await repository.saveTier({
        ...tier,
        seatsLeft: tier.seatsLeft - quantity,
      });

      const booking = {
        id: newId(),
        reference,
        eventId: event.id,
        tierId: tier.id,
        userId: ownerId,
        attendeeName: cleanAttendeeName,
        quantity,
        unitPriceCents: tier.priceCents,
        totalCents,
        status: "pending",
        createdAt: new Date().toISOString(),
        paidAt: null,
        cancelledAt: null,
      };

      return repository.saveBooking(booking);
    },

    async payBooking(reference, { userId, decline = false } = {}) {
      const callerId = requireNonEmptyString(userId, "x-user-id");
      const cleanRef = requireNonEmptyString(reference, "reference").toUpperCase();

      const booking = await repository.getBookingByReference(cleanRef);
      if (!booking) {
        throw new DomainError(ErrorCodes.NOT_FOUND, `Booking not found: ${cleanRef}`);
      }

      if (booking.userId !== callerId) {
        throw new DomainError(
          ErrorCodes.CONFLICT,
          "Only the user who created this booking can pay for it."
        );
      }

      // Enforces booking state machine rules (throws INVALID_TRANSITION if already paid/cancelled/etc.)
      assertTransition(booking.status, "paid");

      if (!paymentGateway || typeof paymentGateway.charge !== "function") {
        throw new DomainError(
          ErrorCodes.INVALID_STATE,
          "Payment gateway is not configured."
        );
      }

      // If declined, paymentGateway throws PAYMENT_DECLINED and booking remains "pending"
      const payment = await paymentGateway.charge({
        amountCents: booking.totalCents,
        reference: booking.reference,
        decline: Boolean(decline),
      });

      const updated = await repository.saveBooking({
        ...booking,
        status: "paid",
        paidAt: payment.chargedAt,
        paymentTransactionId: payment.transactionId,
      });

      return {
        booking: updated,
        payment,
      };
    },

    async cancelBooking(reference, { userId } = {}) {
      const callerId = requireNonEmptyString(userId, "x-user-id");
      const cleanRef = requireNonEmptyString(reference, "reference").toUpperCase();

      const booking = await repository.getBookingByReference(cleanRef);
      if (!booking) {
        throw new DomainError(ErrorCodes.NOT_FOUND, `Booking not found: ${cleanRef}`);
      }

      if (booking.userId !== callerId) {
        throw new DomainError(
          ErrorCodes.CONFLICT,
          "Only the user who created this booking can cancel it."
        );
      }

      // Build 4 rule: unpaid bookings only for now
      if (booking.status !== "pending") {
        throw new DomainError(
          ErrorCodes.INVALID_TRANSITION,
          `Only unpaid (pending) bookings can be cancelled in Build 4. Current status: "${booking.status}".`
        );
      }

      assertTransition(booking.status, "cancelled");

      const tier = await repository.getTierById(booking.tierId);
      if (tier) {
        await repository.saveTier({
          ...tier,
          seatsLeft: tier.seatsLeft + booking.quantity,
        });
      }

      const updated = await repository.saveBooking({
        ...booking,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });

      return {
        booking: updated,
        seatsLeft: tier ? tier.seatsLeft + booking.quantity : null,
      };
    },
  };
}