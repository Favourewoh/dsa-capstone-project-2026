import { openDatabase } from "../db/connection.js";
import { DomainError, ErrorCodes } from "../domain/errors.js";

function normalizeRef(reference) {
  return String(reference).trim().toUpperCase();
}

function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizerId: row.organizer_id ?? null,
    title: row.title,
    city: row.city,
    venue: row.venue,
    startsAt: row.starts_at,
    published: Boolean(row.published),
  };
}

function mapTierRow(row) {
  if (!row) return null;
  const capacity = Number(row.capacity);
  const sold = Number(row.sold);
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: Number(row.price_cents),
    capacity,
    sold,
    seatsLeft: capacity - sold,
  };
}

function mapBookingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    eventId: row.event_id,
    tierId: row.tier_id,
    userId: row.user_id,
    attendeeName: row.attendee_name,
    quantity: Number(row.quantity),
    unitPriceCents: Number(row.unit_price_cents),
    totalCents: Number(row.total_cents),
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    paymentTransactionId: row.payment_transaction_id ?? undefined,
  };
}

export function createSqliteRepository(dbOrPath) {
  const db =
    dbOrPath && typeof dbOrPath.prepare === "function"
      ? dbOrPath
      : openDatabase(dbOrPath);

  const ensureUserStmt = db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, role, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  const saveEventStmt = db.prepare(
    `INSERT INTO events (id, organizer_id, title, city, venue, starts_at, published, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       organizer_id = excluded.organizer_id,
       title = excluded.title,
       city = excluded.city,
       venue = excluded.venue,
       starts_at = excluded.starts_at,
       published = excluded.published`
  );

  const getEventByIdStmt = db.prepare(
    `SELECT id, organizer_id, title, city, venue, starts_at, published
     FROM events WHERE id = ?`
  );

  const listEventsStmt = db.prepare(
    `SELECT id, organizer_id, title, city, venue, starts_at, published
     FROM events`
  );

  const saveTierStmt = db.prepare(
    `INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       event_id = excluded.event_id,
       name = excluded.name,
       price_cents = excluded.price_cents,
       capacity = excluded.capacity,
       sold = excluded.sold`
  );

  const getTierByIdStmt = db.prepare(
    `SELECT id, event_id, name, price_cents, capacity, sold
     FROM ticket_tiers WHERE id = ?`
  );

  const listTiersByEventIdStmt = db.prepare(
    `SELECT id, event_id, name, price_cents, capacity, sold
     FROM ticket_tiers WHERE event_id = ? ORDER BY created_at ASC, id ASC`
  );

  const reserveSeatsStmt = db.prepare(
    `UPDATE ticket_tiers
     SET sold = sold + ?
     WHERE id = ? AND sold + ? <= capacity`
  );

  const saveBookingStmt = db.prepare(
    `INSERT INTO bookings (
       id, reference, event_id, tier_id, user_id, attendee_name,
       quantity, unit_price_cents, total_cents, status,
       created_at, paid_at, cancelled_at, payment_transaction_id
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       reference = excluded.reference,
       event_id = excluded.event_id,
       tier_id = excluded.tier_id,
       user_id = excluded.user_id,
       attendee_name = excluded.attendee_name,
       quantity = excluded.quantity,
       unit_price_cents = excluded.unit_price_cents,
       total_cents = excluded.total_cents,
       status = excluded.status,
       paid_at = excluded.paid_at,
       cancelled_at = excluded.cancelled_at,
       payment_transaction_id = excluded.payment_transaction_id`
  );

  const getBookingByRefStmt = db.prepare(
    `SELECT id, reference, event_id, tier_id, user_id, attendee_name,
            quantity, unit_price_cents, total_cents, status,
            created_at, paid_at, cancelled_at, payment_transaction_id
     FROM bookings WHERE UPPER(reference) = ?`
  );

  const hasBookingRefStmt = db.prepare(
    `SELECT 1 AS found FROM bookings WHERE UPPER(reference) = ? LIMIT 1`
  );

  function ensureUser(userId) {
    if (!userId) return;
    const cleanId = String(userId).trim();
    if (!cleanId) return;
    const now = new Date().toISOString();
    ensureUserStmt.run(cleanId, cleanId, `${cleanId}@local.invalid`, "attendee", now);
  }

  return {
    async saveEvent(event) {
      const now = new Date().toISOString();
      if (event.organizerId) {
        ensureUser(event.organizerId);
      }
      saveEventStmt.run(
        event.id,
        event.organizerId ?? null,
        event.title,
        event.city,
        event.venue ?? "",
        event.startsAt,
        event.published ? 1 : 0,
        now
      );
      return mapEventRow(getEventByIdStmt.get(event.id));
    },

    async getEventById(eventId) {
      return mapEventRow(getEventByIdStmt.get(eventId));
    },

    async listEvents() {
      return listEventsStmt.all().map(mapEventRow);
    },

    async saveTier(tier) {
      const existing = getTierByIdStmt.get(tier.id);
      const capacity = Number(tier.capacity);
      const sold =
        typeof tier.sold === "number"
          ? tier.sold
          : typeof tier.seatsLeft === "number"
            ? capacity - tier.seatsLeft
            : existing
              ? Number(existing.sold)
              : 0;
      const now = existing?.created_at ?? new Date().toISOString();

      saveTierStmt.run(
        tier.id,
        tier.eventId,
        tier.name,
        tier.priceCents,
        capacity,
        sold,
        now
      );
      return mapTierRow(getTierByIdStmt.get(tier.id));
    },

    async getTierById(tierId) {
      return mapTierRow(getTierByIdStmt.get(tierId));
    },

    async listTiersByEventId(eventId) {
      return listTiersByEventIdStmt.all(eventId).map(mapTierRow);
    },

    async reserveSeats({ tierId, quantity }) {
      const tier = mapTierRow(getTierByIdStmt.get(tierId));
      if (!tier) {
        throw new DomainError(ErrorCodes.NOT_FOUND, `Ticket tier not found: ${tierId}`);
      }

      const info = reserveSeatsStmt.run(quantity, tierId, quantity);
      if (!info || info.changes === 0) {
        throw new DomainError(
          ErrorCodes.SOLD_OUT,
          `Not enough seats left on tier "${tier.name}". Requested ${quantity}, available ${tier.seatsLeft}.`
        );
      }

      return mapTierRow(getTierByIdStmt.get(tierId));
    },

    async saveBooking(booking) {
      if (booking.userId) {
        ensureUser(booking.userId);
      }
      const ref = normalizeRef(booking.reference);
      const existing = getBookingByRefStmt.get(ref);
      const createdAt = booking.createdAt ?? existing?.created_at ?? new Date().toISOString();

      saveBookingStmt.run(
        booking.id,
        ref,
        booking.eventId,
        booking.tierId,
        booking.userId,
        booking.attendeeName,
        booking.quantity,
        booking.unitPriceCents,
        booking.totalCents,
        booking.status,
        createdAt,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
        booking.paymentTransactionId ?? null
      );
      return mapBookingRow(getBookingByRefStmt.get(ref));
    },

    async getBookingByReference(reference) {
      if (typeof reference !== "string" || reference.trim() === "") {
        return null;
      }
      return mapBookingRow(getBookingByRefStmt.get(normalizeRef(reference)));
    },

    async hasBookingReference(reference) {
      if (typeof reference !== "string" || reference.trim() === "") {
        return false;
      }
      return Boolean(hasBookingRefStmt.get(normalizeRef(reference)));
    },

    async getWaitlistSize(_tierId) {
      return 0;
    },
  };
}