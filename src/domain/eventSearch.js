import { DomainError, ErrorCodes } from "./errors.js";
import { mergeSort } from "./sorting.js";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SORT_OPTIONS = new Set(["date", "price", "availability"]);

function parseBoundDate(value, fieldName, { endOfDay = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `${fieldName} must be an ISO date string.`
    );
  }

  const trimmed = value.trim();
  if (endOfDay && DATE_ONLY_REGEX.test(trimmed)) {
    const endMs = Date.parse(`${trimmed}T23:59:59.999Z`);
    if (Number.isNaN(endMs)) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        `${fieldName} is not a valid date: ${value}`
      );
    }
    return endMs;
  }

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs)) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `${fieldName} is not a valid date: ${value}`
    );
  }
  return parsedMs;
}

function parseMaxPriceCents(maxPriceCents) {
  if (maxPriceCents === undefined || maxPriceCents === null) {
    return null;
  }
  if (
    typeof maxPriceCents !== "number" ||
    !Number.isInteger(maxPriceCents) ||
    !Number.isSafeInteger(maxPriceCents) ||
    maxPriceCents < 0
  ) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "maxPriceCents must be a non-negative whole number (integer)."
    );
  }
  return maxPriceCents;
}

function getCheapestPrice(summary) {
  if (typeof summary.cheapestPriceCents === "number" && Number.isFinite(summary.cheapestPriceCents)) {
    return summary.cheapestPriceCents;
  }
  if (Array.isArray(summary.tiers) && summary.tiers.length > 0) {
    let min = Infinity;
    for (const tier of summary.tiers) {
      if (typeof tier.priceCents === "number" && tier.priceCents < min) {
        min = tier.priceCents;
      }
    }
    return min === Infinity ? null : min;
  }
  return null;
}

function getSeatsLeft(summary) {
  if (typeof summary.seatsLeft === "number" && Number.isFinite(summary.seatsLeft)) {
    return summary.seatsLeft;
  }
  if (Array.isArray(summary.tiers)) {
    return summary.tiers.reduce((sum, t) => sum + (typeof t.seatsLeft === "number" ? t.seatsLeft : 0), 0);
  }
  return 0;
}

function compareTies(a, b) {
  const titleA = String(a?.title ?? "");
  const titleB = String(b?.title ?? "");
  if (titleA !== titleB) {
    return titleA < titleB ? -1 : 1;
  }
  const idA = String(a?.id ?? "");
  const idB = String(b?.id ?? "");
  if (idA !== idB) {
    return idA < idB ? -1 : 1;
  }
  return 0;
}

export function filterEvents(summaries, criteria = {}) {
  if (!Array.isArray(summaries)) {
    throw new DomainError(ErrorCodes.VALIDATION, "summaries must be an array.");
  }
  if (criteria !== undefined && (typeof criteria !== "object" || criteria === null || Array.isArray(criteria))) {
    throw new DomainError(ErrorCodes.VALIDATION, "criteria must be an object.");
  }

  const {
    q = "",
    city = "",
    from = null,
    to = null,
    maxPriceCents = null,
    onlyAvailable = false,
  } = criteria ?? {};

  if (q !== undefined && q !== null && typeof q !== "string") {
    throw new DomainError(ErrorCodes.VALIDATION, "q must be a string.");
  }
  if (city !== undefined && city !== null && typeof city !== "string") {
    throw new DomainError(ErrorCodes.VALIDATION, "city must be a string.");
  }
  if (typeof onlyAvailable !== "boolean") {
    throw new DomainError(ErrorCodes.VALIDATION, "onlyAvailable must be a boolean.");
  }

  const fromMs = parseBoundDate(from, "from", { endOfDay: false });
  const toMs = parseBoundDate(to, "to", { endOfDay: true });
  const parsedMaxPrice = parseMaxPriceCents(maxPriceCents);

  const normalizedQuery = typeof q === "string" ? q.trim().toLowerCase() : "";
  const normalizedCity = typeof city === "string" ? city.trim().toLowerCase() : "";

  return summaries
    .filter((summary) => {
      if (normalizedQuery) {
        const title = String(summary.title ?? "").toLowerCase();
        const venue = String(summary.venue ?? "").toLowerCase();
        if (!title.includes(normalizedQuery) && !venue.includes(normalizedQuery)) {
          return false;
        }
      }

      if (normalizedCity) {
        const eventCity = String(summary.city ?? "").trim().toLowerCase();
        if (eventCity !== normalizedCity) {
          return false;
        }
      }

      if (fromMs !== null || toMs !== null) {
        const eventMs = Date.parse(String(summary.startsAt ?? ""));
        if (Number.isNaN(eventMs)) {
          return false;
        }
        if (fromMs !== null && eventMs < fromMs) {
          return false;
        }
        if (toMs !== null && eventMs > toMs) {
          return false;
        }
      }

      if (parsedMaxPrice !== null) {
        const cheapest = getCheapestPrice(summary);
        if (cheapest === null || cheapest > parsedMaxPrice) {
          return false;
        }
      }

      if (onlyAvailable) {
        if (getSeatsLeft(summary) <= 0) {
          return false;
        }
      }

      return true;
    })
    .map((item) => ({ ...item }));
}

export function sortEvents(summaries, sortBy = "date") {
  if (!Array.isArray(summaries)) {
    throw new DomainError(ErrorCodes.VALIDATION, "summaries must be an array.");
  }
  if (typeof sortBy !== "string" || !VALID_SORT_OPTIONS.has(sortBy)) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `Unknown sort option: "${sortBy}". Expected one of: date, price, availability.`
    );
  }

  const comparator = (a, b) => {
    if (sortBy === "date") {
      const dateA = Date.parse(String(a?.startsAt ?? ""));
      const dateB = Date.parse(String(b?.startsAt ?? ""));
      const validA = !Number.isNaN(dateA);
      const validB = !Number.isNaN(dateB);
      if (validA && validB && dateA !== dateB) {
        return dateA - dateB;
      }
      if (validA !== validB) {
        return validA ? -1 : 1;
      }
      return compareTies(a, b);
    }

    if (sortBy === "price") {
      const priceA = getCheapestPrice(a);
      const priceB = getCheapestPrice(b);
      const hasPriceA = priceA !== null;
      const hasPriceB = priceB !== null;

      // Events with no price go last.
      if (hasPriceA && !hasPriceB) return -1;
      if (!hasPriceA && hasPriceB) return 1;
      if (hasPriceA && hasPriceB && priceA !== priceB) {
        return priceA - priceB;
      }
      return compareTies(a, b);
    }

    // sortBy === "availability": most seats left first
    const seatsA = getSeatsLeft(a);
    const seatsB = getSeatsLeft(b);
    if (seatsA !== seatsB) {
      return seatsB - seatsA;
    }
    return compareTies(a, b);
  };

  return mergeSort(summaries, comparator).map((item) => ({ ...item }));
}

export function searchEvents(summaries, criteria = {}, sortBy = "date") {
  const filtered = filterEvents(summaries, criteria);
  return sortEvents(filtered, sortBy);
}