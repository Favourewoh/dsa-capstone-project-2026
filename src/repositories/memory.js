import { WaitlistQueue } from "../domain/waitlistQueue.js";

export function createMemoryRepository() {
  const usersById = new Map();
  const userIdByEmail = new Map();
  const events = new Map();
  const tiers = new Map();
  const bookingsByReference = new Map();
  const tierIdsByEventId = new Map();
  const waitlistsByTierId = new Map();

  function normalizeRef(reference) {
    return String(reference).trim().toUpperCase();
  }

  function normalizeEmail(email) {
    return String(email).trim().toLowerCase();
  }

  return {
    async createUser(user) {
      const record = { ...user };
      usersById.set(record.id, record);
      if (record.email) {
        userIdByEmail.set(normalizeEmail(record.email), record.id);
      }
      return { ...record };
    },

    async getUserById(userId) {
      if (!userId) return null;
      const user = usersById.get(String(userId));
      return user ? { ...user } : null;
    },

    async getUserByEmail(email) {
      if (!email) return null;
      const id = userIdByEmail.get(normalizeEmail(email));
      if (!id) return null;
      const user = usersById.get(id);
      return user ? { ...user } : null;
    },

    async saveEvent(event) {
      events.set(event.id, { ...event });
      if (!tierIdsByEventId.has(event.id)) {
        tierIdsByEventId.set(event.id, []);
      }
      return { ...events.get(event.id) };
    },

    async getEventById(eventId) {
      const event = events.get(eventId);
      return event ? { ...event } : null;
    },

    async listEvents() {
      return Array.from(events.values()).map((event) => ({ ...event }));
    },

    async saveTier(tier) {
      tiers.set(tier.id, { ...tier });
      const list = tierIdsByEventId.get(tier.eventId) ?? [];
      if (!list.includes(tier.id)) {
        list.push(tier.id);
        tierIdsByEventId.set(tier.eventId, list);
      }
      if (!waitlistsByTierId.has(tier.id)) {
        waitlistsByTierId.set(tier.id, new WaitlistQueue());
      }
      return { ...tiers.get(tier.id) };
    },

    async getTierById(tierId) {
      const tier = tiers.get(tierId);
      return tier ? { ...tier } : null;
    },

    async listTiersByEventId(eventId) {
      const ids = tierIdsByEventId.get(eventId) ?? [];
      const result = [];
      for (const id of ids) {
        const tier = tiers.get(id);
        if (tier) {
          result.push({ ...tier });
        }
      }
      return result;
    },

    async saveBooking(booking) {
      const key = normalizeRef(booking.reference);
      bookingsByReference.set(key, { ...booking });
      return { ...bookingsByReference.get(key) };
    },

    async getBookingByReference(reference) {
      if (typeof reference !== "string" || reference.trim() === "") {
        return null;
      }
      const booking = bookingsByReference.get(normalizeRef(reference));
      return booking ? { ...booking } : null;
    },

    async hasBookingReference(reference) {
      if (typeof reference !== "string" || reference.trim() === "") {
        return false;
      }
      return bookingsByReference.has(normalizeRef(reference));
    },

    async getWaitlistSize(tierId) {
      const queue = waitlistsByTierId.get(tierId);
      return queue ? queue.size : 0;
    },
  };
}