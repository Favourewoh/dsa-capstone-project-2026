import { MOCK_EVENTS } from "./mockData.js";

const HOLD_DURATION_SECONDS = 10 * 60;

const state = {
  events: MOCK_EVENTS.map((ev) => ({
    ...ev,
    tiers: ev.tiers.map((t) => ({ ...t })),
  })),
  bookingsByRef: new Map(),
};

let refCounter = 100;
let txCounter = 1;

function nextReference() {
  refCounter += 1;
  return `TKT-MOCK-${refCounter}`;
}

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function cloneEventWithMinPrice(ev) {
  const availableTiers = ev.tiers.filter((t) => t.seatsLeft > 0);
  const prices = (availableTiers.length > 0 ? availableTiers : ev.tiers).map(
    (t) => t.priceCents
  );
  const minPriceCents = prices.length > 0 ? Math.min(...prices) : 0;
  const totalSeatsLeft = ev.tiers.reduce((sum, t) => sum + t.seatsLeft, 0);

  return {
    id: ev.id,
    title: ev.title,
    city: ev.city,
    venue: ev.venue,
    startsAt: ev.startsAt,
    published: ev.published,
    minPriceCents,
    totalSeatsLeft,
    tiers: ev.tiers.map((t) => ({ ...t })),
  };
}

export async function listEvents(filters = {}) {
  const q = String(filters.q || "").trim().toLowerCase();
  const city = String(filters.city || "").trim().toLowerCase();
  const maxPriceCents =
    filters.maxPriceCents !== undefined &&
    filters.maxPriceCents !== null &&
    filters.maxPriceCents !== ""
      ? Number(filters.maxPriceCents)
      : null;
  const sortBy = filters.sortBy || "date";

  let items = state.events
    .filter((ev) => ev.published)
    .map(cloneEventWithMinPrice);

  if (q) {
    items = items.filter(
      (ev) =>
        ev.title.toLowerCase().includes(q) ||
        ev.city.toLowerCase().includes(q) ||
        ev.venue.toLowerCase().includes(q)
    );
  }

  if (city) {
    items = items.filter((ev) => ev.city.toLowerCase() === city);
  }

  if (maxPriceCents !== null && Number.isFinite(maxPriceCents)) {
    items = items.filter((ev) => ev.minPriceCents <= maxPriceCents);
  }

  items.sort((a, b) => {
    if (sortBy === "price") {
      return a.minPriceCents - b.minPriceCents || a.title.localeCompare(b.title);
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  return { events: items };
}

export async function getEvent(eventId) {
  const ev = state.events.find((item) => item.id === eventId && item.published);
  if (!ev) {
    throw makeError("NOT_FOUND", `Event not found: ${eventId}`);
  }
  return { event: cloneEventWithMinPrice(ev) };
}

export async function createBooking({ tierId, attendeeName, quantity, userId = "attendee-demo" }) {
  const cleanName = String(attendeeName || "").trim();
  const qty = Number(quantity);

  if (!cleanName) {
    throw makeError("VALIDATION", "Attendee name is required.");
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw makeError("VALIDATION", "Quantity must be between 1 and 10.");
  }

  let foundEvent = null;
  let foundTier = null;

  for (const ev of state.events) {
    const tier = ev.tiers.find((t) => t.id === tierId);
    if (tier) {
      foundEvent = ev;
      foundTier = tier;
      break;
    }
  }

  if (!foundEvent || !foundTier) {
    throw makeError("NOT_FOUND", "Ticket tier not found.");
  }
  if (!foundEvent.published) {
    throw makeError("INVALID_STATE", "Event is not published.");
  }
  if (foundTier.seatsLeft <= 0 || foundTier.seatsLeft < qty) {
    throw makeError("SOLD_OUT", "Not enough seats left on this tier.");
  }

  foundTier.seatsLeft -= qty;

  const now = Date.now();
  const reference = nextReference();
  const booking = {
    id: `bk-${reference}`,
    reference,
    eventId: foundEvent.id,
    eventTitle: foundEvent.title,
    tierId: foundTier.id,
    tierName: foundTier.name,
    userId,
    attendeeName: cleanName,
    quantity: qty,
    unitPriceCents: foundTier.priceCents,
    totalCents: foundTier.priceCents * qty,
    status: "pending",
    holdSeconds: HOLD_DURATION_SECONDS,
    expiresAt: new Date(now + HOLD_DURATION_SECONDS * 1000).toISOString(),
    createdAt: new Date(now).toISOString(),
    paidAt: null,
  };

  state.bookingsByRef.set(reference, booking);
  return { booking: { ...booking } };
}

export async function pay(reference, { decline = false, cardLast4 = "4242" } = {}) {
  const cleanRef = String(reference || "").trim().toUpperCase();
  const booking = state.bookingsByRef.get(cleanRef);

  if (!booking) {
    throw makeError("NOT_FOUND", `Booking not found: ${cleanRef}`);
  }
  if (booking.status === "paid") {
    throw makeError("INVALID_TRANSITION", "Booking is already paid.");
  }
  if (booking.status !== "pending") {
    throw makeError("INVALID_TRANSITION", `Cannot pay booking in "${booking.status}" state.`);
  }

  const cleanLast4 = String(cardLast4 || "").trim();
  if (decline || cleanLast4.endsWith("0000")) {
    throw makeError(
      "PAYMENT_DECLINED",
      "Your mock card was declined. Check your details and try again."
    );
  }

  txCounter += 1;
  const chargedAt = new Date().toISOString();
  const transactionId = `txn_mock_${txCounter}`;

  booking.status = "paid";
  booking.paidAt = chargedAt;
  booking.paymentTransactionId = transactionId;

  return {
    booking: { ...booking },
    payment: {
      transactionId,
      amountCents: booking.totalCents,
      status: "approved",
      chargedAt,
    },
  };
}