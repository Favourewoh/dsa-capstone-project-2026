import { DomainError, ErrorCodes } from "../../domain/errors.js";

function getCallerUserId(req) {
  const raw = req.headers?.["x-user-id"];
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "Missing required x-user-id header."
    );
  }
  return raw.trim();
}

function queryToObject(searchParams) {
  const obj = {};
  for (const [key, value] of searchParams.entries()) {
    obj[key] = value;
  }
  return obj;
}

export function registerApiRoutes(router, { eventService, bookingService, readJsonBody, sendJson }) {
  router.post("/api/events", async (req, res) => {
    const userId = getCallerUserId(req);
    const body = await readJsonBody(req);
    const created = await eventService.createEvent({
      ...body,
      organizerId: userId,
    });
    sendJson(res, 201, created);
  });

  router.post("/api/events/:id/tiers", async (req, res, { params }) => {
    getCallerUserId(req);
    const body = await readJsonBody(req);
    const tier = await eventService.addTier(params.id, body);
    sendJson(res, 201, tier);
  });

  router.post("/api/events/:id/publish", async (req, res, { params }) => {
    getCallerUserId(req);
    const published = await eventService.publishEvent(params.id);
    sendJson(res, 200, published);
  });

  router.get("/api/events", async (_req, res, { query }) => {
    const events = await eventService.listAndSearchEvents(queryToObject(query));
    sendJson(res, 200, { events });
  });

  router.post("/api/bookings", async (req, res) => {
    const userId = getCallerUserId(req);
    const body = await readJsonBody(req);
    const booking = await bookingService.createBooking({
      ...body,
      userId,
    });
    sendJson(res, 201, booking);
  });

  router.post("/api/bookings/:reference/pay", async (req, res, { params }) => {
    const userId = getCallerUserId(req);
    const body = await readJsonBody(req);
    const result = await bookingService.payBooking(params.reference, {
      userId,
      decline: Boolean(body?.decline),
    });
    sendJson(res, 200, result);
  });

  router.post("/api/bookings/:reference/cancel", async (req, res, { params }) => {
    const userId = getCallerUserId(req);
    const result = await bookingService.cancelBooking(params.reference, {
      userId,
    });
    sendJson(res, 200, result);
  });
}