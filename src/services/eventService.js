import { DomainError, ErrorCodes } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import { searchEvents } from "../domain/eventSearch.js";
import { assertEventOwner } from "../http/guards.js";

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError(ErrorCodes.VALIDATION, `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePositiveSafeInt(value, fieldName) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new DomainError(ErrorCodes.VALIDATION, `${fieldName} must be a positive integer.`);
  }
  return value;
}

function requireNonNegativeSafeInt(value, fieldName) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `${fieldName} must be a non-negative integer in whole cents.`
    );
  }
  return value;
}

function requireIsoDate(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainError(ErrorCodes.VALIDATION, `${fieldName} must be a valid ISO date string.`);
  }
  const trimmed = value.trim();
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new DomainError(ErrorCodes.VALIDATION, `${fieldName} is not a valid date: ${value}`);
  }
  return new Date(ms).toISOString();
}

function parseBooleanQuery(raw, fieldName, defaultValue = false) {
  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  throw new DomainError(ErrorCodes.VALIDATION, `${fieldName} must be a boolean.`);
}

function parseMaxPriceQuery(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  const num = Number(raw);
  if (!Number.isInteger(num) || !Number.isSafeInteger(num) || num < 0) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "maxPriceCents must be a non-negative integer in whole cents."
    );
  }
  return num;
}

export function createEventService(repository) {
  if (!repository) {
    throw new DomainError(ErrorCodes.VALIDATION, "Repository is required for eventService.");
  }

  async function buildSummary(event, tiers) {
    let cheapestPriceCents = null;
    let seatsLeft = 0;
    let waitlistCount = 0;

    for (const tier of tiers) {
      seatsLeft += tier.seatsLeft;
      if (cheapestPriceCents === null || tier.priceCents < cheapestPriceCents) {
        cheapestPriceCents = tier.priceCents;
      }
      if (typeof repository.getWaitlistSize === "function") {
        waitlistCount += await repository.getWaitlistSize(tier.id);
      }
    }

    return {
      id: event.id,
      organizerId: event.organizerId ?? null,
      title: event.title,
      city: event.city,
      venue: event.venue,
      startsAt: event.startsAt,
      published: event.published,
      status: event.published ? "PUBLISHED" : "DRAFT",
      tierCount: tiers.length,
      cheapestPriceCents,
      seatsLeft,
      waitlistCount,
      tiers: tiers.map((t) => ({ ...t })),
    };
  }

  return {
    async createEvent({ title, city, venue = "", startsAt, organizerId = null } = {}) {
      const cleanTitle = requireNonEmptyString(title, "title");
      const cleanCity = requireNonEmptyString(city, "city");
      if (venue !== undefined && venue !== null && typeof venue !== "string") {
        throw new DomainError(ErrorCodes.VALIDATION, "venue must be a string.");
      }
      const cleanVenue = typeof venue === "string" ? venue.trim() : "";
      const validStartsAt = requireIsoDate(startsAt, "startsAt");

      const event = {
        id: newId(),
        organizerId: organizerId ? String(organizerId).trim() : null,
        title: cleanTitle,
        city: cleanCity,
        venue: cleanVenue,
        startsAt: validStartsAt,
        published: false,
      };

      const saved = await repository.saveEvent(event);
      return {
        ...saved,
        status: "DRAFT",
        tiers: [],
      };
    },

    async addTier(eventId, { name, priceCents, capacity } = {}, { actor = null } = {}) {
      const cleanEventId = requireNonEmptyString(eventId, "eventId");
      const event = await repository.getEventById(cleanEventId);
      if (!event) {
        throw new DomainError(ErrorCodes.NOT_FOUND, `Event not found: ${cleanEventId}`);
      }
      if (actor) {
        assertEventOwner(event, actor);
      }

      const cleanName = requireNonEmptyString(name, "name");
      const validPriceCents = requireNonNegativeSafeInt(priceCents, "priceCents");
      const validCapacity = requirePositiveSafeInt(capacity, "capacity");

      const tier = {
        id: newId(),
        eventId: event.id,
        name: cleanName,
        priceCents: validPriceCents,
        capacity: validCapacity,
        seatsLeft: validCapacity,
      };

      return repository.saveTier(tier);
    },

    async publishEvent(eventId, { actor = null } = {}) {
      const cleanEventId = requireNonEmptyString(eventId, "eventId");
      const event = await repository.getEventById(cleanEventId);
      if (!event) {
        throw new DomainError(ErrorCodes.NOT_FOUND, `Event not found: ${cleanEventId}`);
      }
      if (actor) {
        assertEventOwner(event, actor);
      }

      const tiers = await repository.listTiersByEventId(event.id);
      if (tiers.length === 0) {
        throw new DomainError(
          ErrorCodes.INVALID_STATE,
          `Cannot publish event "${event.title}" because it has no ticket tiers.`
        );
      }

      const updated = await repository.saveEvent({
        ...event,
        published: true,
      });

      return buildSummary(updated, tiers);
    },

    async unpublishEvent(eventId, { actor = null } = {}) {
      const cleanEventId = requireNonEmptyString(eventId, "eventId");
      const event = await repository.getEventById(cleanEventId);
      if (!event) {
        throw new DomainError(ErrorCodes.NOT_FOUND, `Event not found: ${cleanEventId}`);
      }
      if (actor) {
        assertEventOwner(event, actor);
      }

      const tiers = await repository.listTiersByEventId(event.id);
      const updated = await repository.saveEvent({
        ...event,
        published: false,
      });

      return buildSummary(updated, tiers);
    },

    async listAndSearchEvents(queryParams = {}) {
      const q = queryParams.q !== undefined ? String(queryParams.q) : "";
      const city = queryParams.city !== undefined ? String(queryParams.city) : "";
      const from = queryParams.from || null;
      const to = queryParams.to || null;
      const maxPriceCents = parseMaxPriceQuery(queryParams.maxPriceCents);
      const onlyAvailable = parseBooleanQuery(queryParams.onlyAvailable, "onlyAvailable", false);
      const includeUnpublished = parseBooleanQuery(
        queryParams.includeUnpublished,
        "includeUnpublished",
        false
      );
      const sortBy = queryParams.sortBy || queryParams.sort || "date";

      const allEvents = await repository.listEvents();
      const summaries = [];

      for (const event of allEvents) {
        if (!includeUnpublished && !event.published) {
          continue;
        }
        const tiers = await repository.listTiersByEventId(event.id);
        summaries.push(await buildSummary(event, tiers));
      }

      return searchEvents(
        summaries,
        { q, city, from, to, maxPriceCents, onlyAvailable },
        sortBy
      );
    },
  };
}