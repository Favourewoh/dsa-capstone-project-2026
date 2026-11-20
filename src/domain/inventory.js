import { DomainError, ErrorCodes } from "./errors.js";
import { newId, newReference } from "./ids.js";
import { WaitlistQueue } from "./waitlistQueue.js";

const MIN_TICKETS_PER_BOOKING = 1;
const MAX_TICKETS_PER_BOOKING = 10;

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `${fieldName} must be a non-empty string.`
    );
  }
  return value.trim();
}

function assertPositiveSafeInteger(value, fieldName) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || !Number.isSafeInteger(value)) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `${fieldName} must be a positive safe integer.`
    );
  }
  return value;
}

function assertNonNegativeSafeInteger(value, fieldName) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `${fieldName} must be a non-negative safe integer.`
    );
  }
  return value;
}

export function createStore() {
  const events = new Map();
  const bookingsByReference = new Map();
  const waitlistsByTierId = new Map();

  function getEventOrThrow(eventId) {
    const cleanId = assertNonEmptyString(eventId, "eventId");
    const event = events.get(cleanId);
    if (!event) {
      throw new DomainError(ErrorCodes.NOT_FOUND, `Event not found: ${cleanId}`);
    }
    return event;
  }

  function findTierLocation(tierId) {
    const cleanTierId = assertNonEmptyString(tierId, "tierId");
    for (const event of events.values()) {
      const tier = event.tiers.get(cleanTierId);
      if (tier) {
        return { event, tier };
      }
    }
    throw new DomainError(
      ErrorCodes.NOT_FOUND,
      `Ticket tier not found: ${cleanTierId}`
    );
  }

  function createEvent({ title, venue = "", startsAt = null } = {}) {
    const cleanTitle = assertNonEmptyString(title, "title");
    const cleanVenue = typeof venue === "string" ? venue.trim() : "";
    if (cleanVenue === "" && venue !== "" && venue !== undefined && venue !== null) {
      throw new DomainError(ErrorCodes.VALIDATION, "venue must be a string.");
    }

    const event = {
      id: newId(),
      title: cleanTitle,
      venue: cleanVenue,
      startsAt,
      tiers: new Map(),
    };

    events.set(event.id, event);
    return {
      id: event.id,
      title: event.title,
      venue: event.venue,
      startsAt: event.startsAt,
      tiers: [],
    };
  }

  function addTier(eventId, { name, priceCents, capacity } = {}) {
    const event = getEventOrThrow(eventId);
    const cleanName = assertNonEmptyString(name, "name");
    const validPriceCents = assertNonNegativeSafeInteger(priceCents, "priceCents");
    const validCapacity = assertPositiveSafeInteger(capacity, "capacity");

    const tier = {
      id: newId(),
      eventId: event.id,
      name: cleanName,
      priceCents: validPriceCents,
      capacity: validCapacity,
      seatsLeft: validCapacity,
    };

    event.tiers.set(tier.id, tier);
    waitlistsByTierId.set(tier.id, new WaitlistQueue());

    return { ...tier };
  }

  function bookTickets({ tierId, attendeeName, quantity } = {}) {
    const { event, tier } = findTierLocation(tierId);
    const cleanAttendeeName = assertNonEmptyString(attendeeName, "attendeeName");
    const qty = assertPositiveSafeInteger(quantity, "quantity");

    if (qty < MIN_TICKETS_PER_BOOKING || qty > MAX_TICKETS_PER_BOOKING) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        `Booking quantity must be between ${MIN_TICKETS_PER_BOOKING} and ${MAX_TICKETS_PER_BOOKING} tickets.`
      );
    }

    // Check capacity before mutating any state so a failed booking changes nothing.
    if (tier.seatsLeft < qty) {
      throw new DomainError(
        ErrorCodes.SOLD_OUT,
        `Not enough seats left on tier "${tier.name}". Requested ${qty}, available ${tier.seatsLeft}.`,
        {
          eventId: event.id,
          tierId: tier.id,
          requested: qty,
          seatsLeft: tier.seatsLeft,
        }
      );
    }

    let reference = newReference();
    while (bookingsByReference.has(reference)) {
      reference = newReference();
    }

    const totalCents = tier.priceCents * qty;
    if (!Number.isSafeInteger(totalCents)) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        "Total booking amount exceeds safe integer range."
      );
    }

    tier.seatsLeft -= qty;

    const booking = {
      id: newId(),
      reference,
      eventId: event.id,
      tierId: tier.id,
      attendeeName: cleanAttendeeName,
      quantity: qty,
      unitPriceCents: tier.priceCents,
      totalCents,
      status: "CONFIRMED",
      bookedAt: new Date().toISOString(),
      cancelledAt: null,
    };

    bookingsByReference.set(booking.reference, booking);
    return { ...booking };
  }

  function cancelBooking(reference) {
    const cleanRef = assertNonEmptyString(reference, "reference").toUpperCase();
    const booking = bookingsByReference.get(cleanRef);

    if (!booking) {
      throw new DomainError(
        ErrorCodes.NOT_FOUND,
        `Booking not found for reference: ${cleanRef}`
      );
    }

    if (booking.status === "CANCELLED") {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        `Booking ${cleanRef} has already been cancelled.`
      );
    }

    const { tier } = findTierLocation(booking.tierId);
    booking.status = "CANCELLED";
    booking.cancelledAt = new Date().toISOString();
    tier.seatsLeft += booking.quantity;

    const waitlist = waitlistsByTierId.get(tier.id);
    const nextInLine = waitlist ? waitlist.peek() : undefined;

    return {
      booking: { ...booking },
      seatsLeft: tier.seatsLeft,
      nextInLine: nextInLine ? { ...nextInLine } : null,
    };
  }

  function findBookingByReference(reference) {
    if (typeof reference !== "string" || reference.trim() === "") {
      return null;
    }
    const booking = bookingsByReference.get(reference.trim().toUpperCase());
    return booking ? { ...booking } : null;
  }

  function joinWaitlist({ tierId, attendeeName, quantity = 1 } = {}) {
    const { event, tier } = findTierLocation(tierId);
    const cleanAttendeeName = assertNonEmptyString(attendeeName, "attendeeName");
    const qty = assertPositiveSafeInteger(quantity, "quantity");

    if (qty < MIN_TICKETS_PER_BOOKING || qty > MAX_TICKETS_PER_BOOKING) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        `Waitlist quantity must be between ${MIN_TICKETS_PER_BOOKING} and ${MAX_TICKETS_PER_BOOKING} tickets.`
      );
    }

    const queue = waitlistsByTierId.get(tier.id);
    const entry = {
      id: newId(),
      eventId: event.id,
      tierId: tier.id,
      attendeeName: cleanAttendeeName,
      quantity: qty,
      joinedAt: new Date().toISOString(),
    };

    const position = queue.enqueue(entry);
    return {
      entry: { ...entry },
      position,
      waitlistSize: queue.size,
    };
  }

  function getTierStatus(tierId) {
    const { event, tier } = findTierLocation(tierId);
    const queue = waitlistsByTierId.get(tier.id);
    return {
      eventId: event.id,
      eventTitle: event.title,
      tierId: tier.id,
      tierName: tier.name,
      priceCents: tier.priceCents,
      capacity: tier.capacity,
      seatsLeft: tier.seatsLeft,
      waitlistSize: queue ? queue.size : 0,
      nextInLine: queue?.peek() ? { ...queue.peek() } : null,
    };
  }

  return {
    createEvent,
    addTier,
    bookTickets,
    cancelBooking,
    findBookingByReference,
    joinWaitlist,
    getTierStatus,
  };
}