import { requireUser, requireRole } from "../guards.js";

function queryToObject(searchParams) {
  const obj = {};
  for (const [key, value] of searchParams.entries()) {
    obj[key] = value;
  }
  return obj;
}

export function registerApiRoutes(
  router,
  { eventService, bookingService, repository, readJsonBody, sendJson }
) {
  const requireOrganizer = requireRole("organizer");
  const requireAttendee = requireRole("attendee");
  const guardContext = { repository };

  router.post("/api/events", async (req, res) => {
    const user = await requireOrganizer(req, guardContext);
    const body = await readJsonBody(req);
    const created = await eventService.createEvent({
      ...body,
      organizerId: user.id,
    });
    sendJson(res, 201, created);
  });

  router.post("/api/events/:id/tiers", async (req, res, { params }) => {
    const user = await requireOrganizer(req, guardContext);
    const body = await readJsonBody(req);
    const tier = await eventService.addTier(params.id, body, { actor: user });
    sendJson(res, 201, tier);
  });

  router.post("/api/events/:id/publish", async (req, res, { params }) => {
    const user = await requireOrganizer(req, guardContext);
    const published = await eventService.publishEvent(params.id, { actor: user });
    sendJson(res, 200, published);
  });

  router.post("/api/events/:id/unpublish", async (req, res, { params }) => {
    const user = await requireOrganizer(req, guardContext);
    const unpublished = await eventService.unpublishEvent(params.id, { actor: user });
    sendJson(res, 200, unpublished);
  });

  router.get("/api/events", async (_req, res, { query }) => {
    const events = await eventService.listAndSearchEvents(queryToObject(query));
    sendJson(res, 200, { events });
  });

  router.get("/api/events/:id", async (_req, res, { params }) => {
    const events = await eventService.listAndSearchEvents({ includeUnpublished: true });
    const event = events.find((e) => e.id === params.id);
    if (!event) {
      sendJson(res, 404, {
        error: { code: "NOT_FOUND", message: `Event not found: ${params.id}` },
      });
      return;
    }
    sendJson(res, 200, { event });
  });

  router.get("/api/bookings", async (req, res) => {
    const user = await requireUser(req, guardContext);
    const bookings =
      typeof bookingService.listBookingsForUser === "function"
        ? await bookingService.listBookingsForUser(user.id)
        : [];
    sendJson(res, 200, { bookings });
  });

  router.post("/api/bookings", async (req, res) => {
    const user = await requireAttendee(req, guardContext);
    const body = await readJsonBody(req);
    const booking = await bookingService.createBooking({
      ...body,
      userId: user.id,
    });
    sendJson(res, 201, booking);
  });

  router.post("/api/bookings/:reference/pay", async (req, res, { params }) => {
    const user = await requireAttendee(req, guardContext);
    const body = await readJsonBody(req);
    const result = await bookingService.payBooking(params.reference, {
      userId: user.id,
      decline: Boolean(body?.decline),
    });
    sendJson(res, 200, result);
  });

  router.post("/api/bookings/:reference/cancel", async (req, res, { params }) => {
    const user = await requireAttendee(req, guardContext);
    const result = await bookingService.cancelBooking(params.reference, {
      userId: user.id,
    });
    sendJson(res, 200, result);
  });
}